# GCP Step 1: Cloud Run + Gemini Function Calling Agent 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存AWS実装の静止画合成API + Chat Agentを、Cloud Run + Gemini function callingでGCPに移植する（issue #106 Step 1）。

**Architecture:** `lambda/python` の合成エンジン（image_compositor / text_renderer / image_fetcher / composite_defaults）を**無変更で共有**し、`gcp/app/` にFastAPIアダプタ + Gemini Agentを新設する。コンテナはPython 3.12-slim（ffmpegなし・Step 1は静止画のみ）。IaCはTerraform、リージョンはasia-northeast1。

**Tech Stack:** Python 3.12 / FastAPI / uvicorn / Pillow（lambda同一制約） / google-genai SDK（Vertex AIモード） / google-cloud-firestore / Terraform / Cloud Build / Artifact Registry / Cloud Run v2

**Spec:** [docs/superpowers/specs/2026-07-05-multicloud-agent-plan-design.md](../specs/2026-07-05-multicloud-agent-plan-design.md)

## Global Constraints

- `lambda/python/*.py` は**一切変更しない**（AWS本番パスの共有モジュール）
- 決定論的レンダリング維持: 同一パラメータ→同一PNGバイト列（テストで二重レンダリング一致を検証）
- APIパラメータ契約はAWS版 `/images/composite` と同一（`image1..3`, `imageNX/Y/Width/Height`, `baseImage`, `baseOpacity`, `text1..3`系）
- Step 1スコープ外: 動画生成（ffmpeg）、S3/GCSソース（`s3://`は400エラー）、アップロード管理、format=html
- キャンバスはエンジン実装準拠の **2000x1000**（`create_base_image`デフォルト。requirements.mdの1920x1080記述との乖離は既存実装由来でありスコープ外）
- Pillow `>=10.4.0,<12.0.0`（lambda/python/requirements.txtと同一制約）
- Geminiモデルは環境変数 `GEMINI_MODEL_ID`（デフォルト `gemini-2.5-flash`）
- リージョン: `asia-northeast1`、会話履歴TTL: 7日（Firestore TTLポリシー）
- コンテナビルドは**Cloud Build必須**（開発機はarm64、Cloud Runはamd64のため）
- コミットメッセージは日本語・`<type>(gcp): <内容>`形式

## File Structure

```
gcp/
├── README.md                    # GCP版のセットアップ・デプロイ手順
├── requirements.txt             # 実行時依存
├── requirements-dev.txt         # pytest等
├── Dockerfile                   # マルチステージ（build context=リポジトリルート）
├── cloudbuild.yaml              # Cloud Buildでamd64イメージをビルド&push
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI: /images/composite, /chat, /healthz
│   ├── compositor_service.py    # lambda合成エンジンを呼ぶオーケストレーション
│   ├── agent.py                 # Gemini function callingループ
│   ├── tools.py                 # compose_images / get_position_coordinates
│   └── history.py               # ChatHistory Protocol + InMemory/Firestore実装
├── tests/
│   ├── conftest.py              # sys.path設定 + composite_defaults.json fixture
│   ├── test_compositor_service.py
│   ├── test_api.py
│   ├── test_tools.py
│   ├── test_agent.py
│   └── test_history.py
├── scripts/
│   ├── setup-project.sh         # プロジェクト作成・API有効化
│   └── deploy.sh                # Cloud Build → Terraform apply → 検証
└── terraform/
    ├── main.tf                  # provider, APIs, Artifact Registry, Firestore
    ├── cloudrun.tf              # Cloud Run v2 service + SA/IAM
    ├── variables.tf
    └── outputs.tf
```

---

### Task 0: GCP環境セットアップ

**Files:**
- Create: `gcp/scripts/setup-project.sh`
- Create: `gcp/README.md`（セットアップ節のみ、以降のTaskで追記）

**Interfaces:**
- Produces: 課金有効なGCPプロジェクト（ID例 `image-compositor-dev`）、有効化済みAPI群、`gcloud` 認証済み環境。以降の全Taskの前提

- [ ] **Step 1: gcloud CLIの確認・インストール**

```bash
which gcloud || echo "NOT INSTALLED"
```

未インストールの場合（Raspberry Pi OS / Debian arm64）:

```bash
curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | sudo gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" | sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list
sudo apt-get update && sudo apt-get install -y google-cloud-cli
```

- [ ] **Step 2: 認証（ユーザー操作が必要 — 停止して依頼する）**

ユーザーに以下の実行を依頼（`!`プレフィックスでセッション内実行可）:

```bash
gcloud auth login
gcloud auth application-default login
```

- [ ] **Step 3: setup-project.sh を作成**

```bash
#!/usr/bin/env bash
# GCPプロジェクトの作成とAPI有効化（冪等）
# Usage: PROJECT_ID=image-compositor-dev BILLING_ACCOUNT_ID=XXXXXX-XXXXXX-XXXXXX ./setup-project.sh
set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID を指定してください}"
: "${BILLING_ACCOUNT_ID:?BILLING_ACCOUNT_ID を指定してください (gcloud billing accounts list で確認)}"
REGION="${REGION:-asia-northeast1}"

if ! gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud projects create "$PROJECT_ID"
fi
gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT_ID"
gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  aiplatform.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com

echo "✅ Project $PROJECT_ID ready (region: $REGION)"
```

- [ ] **Step 4: 実行して検証**

```bash
chmod +x gcp/scripts/setup-project.sh
gcloud billing accounts list   # BILLING_ACCOUNT_ID確認（ユーザーに提示して選択してもらう）
PROJECT_ID=image-compositor-dev BILLING_ACCOUNT_ID=<選択したID> ./gcp/scripts/setup-project.sh
gcloud services list --enabled | grep -E "run|aiplatform|firestore"
```

Expected: 5つのAPIがすべて有効

- [ ] **Step 5: gcp/README.md（セットアップ節）を作成してコミット**

```bash
git add gcp/scripts/setup-project.sh gcp/README.md
git commit -m "chore(gcp): GCPプロジェクトセットアップスクリプト追加"
```

---

### Task 1: 合成サービス（compositor_service）

**Files:**
- Create: `gcp/app/__init__.py`（空）
- Create: `gcp/app/compositor_service.py`
- Create: `gcp/requirements.txt`, `gcp/requirements-dev.txt`
- Test: `gcp/tests/conftest.py`, `gcp/tests/test_compositor_service.py`

**Interfaces:**
- Consumes: `lambda/python` の `parse_image_parameters(query_params) -> dict`, `parse_text_parameters(query_params) -> dict`, `validate_text_parameters(params) -> list`, `create_composite_image(base_img, image1, image2, image3, params, text_params=None, base_opacity=100) -> Image`, `fetch_images_parallel(image_paths: dict) -> dict`, `get_base_image_default() -> str`, `get_base_opacity_default() -> int`
- Produces: `compose_still_image(query_params: Dict[str, str]) -> bytes`（PNG）、例外 `UnsupportedSourceError(ValueError)`。Task 2/3が使用

- [ ] **Step 1: 依存ファイルを作成**

`gcp/requirements.txt`:

```
fastapi>=0.115,<1.0
uvicorn[standard]>=0.30,<1.0
Pillow>=10.4.0,<12.0.0
requests==2.31.0
google-genai>=1.0.0
google-cloud-firestore>=2.16.0
```

`gcp/requirements-dev.txt`:

```
-r requirements.txt
pytest>=8.0
httpx>=0.27
```

venv作成とインストール:

```bash
cd gcp && python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
```

> 注: `boto3`は含めない。`image_fetcher.py`はtry-importのためboto3なしでも動作し、`s3://`はアダプタ側で事前拒否する。

- [ ] **Step 2: conftest.pyを書く**

`gcp/tests/conftest.py`:

```python
"""lambda/python の合成エンジンを import 可能にし、composite_defaults.json を準備する。"""
import shutil
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "lambda" / "python"))
sys.path.insert(0, str(REPO_ROOT / "gcp"))


@pytest.fixture(scope="session", autouse=True)
def composite_defaults_json():
    """deploy.sh 相当: frontend/public/composite-default.json をエンジン横に配置する。"""
    src = REPO_ROOT / "frontend" / "public" / "composite-default.json"
    dst = REPO_ROOT / "lambda" / "python" / "composite_defaults.json"
    created = False
    if src.exists() and not dst.exists():
        shutil.copy(src, dst)
        created = True
    yield
    if created:
        dst.unlink()
```

- [ ] **Step 3: 失敗するテストを書く**

`gcp/tests/test_compositor_service.py`:

```python
from io import BytesIO

import pytest
from PIL import Image

from app.compositor_service import UnsupportedSourceError, compose_still_image

PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def test_compose_two_test_images_returns_png():
    png = compose_still_image({"image1": "test", "image2": "test"})
    assert png[:8] == PNG_MAGIC
    img = Image.open(BytesIO(png))
    assert img.size == (2000, 1000)  # エンジンのキャンバスデフォルト
    assert img.mode == "RGBA"


def test_deterministic_double_render():
    """決定論的レンダリング: 同一パラメータ→同一バイト列（設計原則7）。"""
    params = {
        "image1": "test", "image2": "test",
        "image1X": "100", "image1Y": "100",
        "text1": "LIVE", "text1X": "1800", "text1Y": "300",
        "baseImage": "#000000", "baseOpacity": "50",
    }
    assert compose_still_image(params) == compose_still_image(params)


def test_s3_source_rejected():
    with pytest.raises(UnsupportedSourceError):
        compose_still_image({"image1": "s3://bucket/key.png"})


def test_text_only_mode():
    png = compose_still_image({"text1": "こんにちは", "text1X": "300", "text1Y": "100"})
    assert png[:8] == PNG_MAGIC


def test_no_image_no_text_raises():
    with pytest.raises(ValueError):
        compose_still_image({})
```

- [ ] **Step 4: テストが失敗することを確認**

```bash
cd gcp && .venv/bin/pytest tests/test_compositor_service.py -v
```

Expected: FAIL（`ModuleNotFoundError: No module named 'app.compositor_service'`）

- [ ] **Step 5: compositor_service.pyを実装**

`gcp/app/compositor_service.py`:

```python
"""静止画合成サービス — lambda/python の合成エンジンを再利用するGCP用アダプタ。

Lambdaハンドラ（image_processor.py handler）の静止画パスのオーケストレーションを
Cloud Run向けに再実装したもの。エンジンモジュール自体は変更せず共有する。
Step 1スコープ: 静止画のみ（動画生成・s3://ソースは非対応）。
"""
import logging
from io import BytesIO
from typing import Dict

from PIL import Image

from composite_defaults import get_base_image_default, get_base_opacity_default
from image_compositor import (
    create_composite_image,
    parse_image_parameters,
    parse_text_parameters,
    validate_text_parameters,
)
from image_fetcher import fetch_images_parallel

logger = logging.getLogger(__name__)

CANVAS_SIZE = (2000, 1000)  # create_base_image のデフォルトと一致させる


class UnsupportedSourceError(ValueError):
    """Step 1で未対応の画像ソース（s3://等）が指定された。"""


def _reject_s3_sources(query_params: Dict[str, str]) -> None:
    for key in ("image1", "image2", "image3", "baseImage"):
        value = query_params.get(key) or ""
        if value.startswith("s3://"):
            raise UnsupportedSourceError(
                f"{key}: s3:// ソースはGCP Step 1では未対応です（test画像またはHTTP URLを使用してください）"
            )


def compose_still_image(query_params: Dict[str, str]) -> bytes:
    """クエリパラメータ互換dictから合成PNGバイト列を返す。

    パラメータ契約はAWS版 /images/composite と同一。
    """
    _reject_s3_sources(query_params)

    img_params = parse_image_parameters(query_params)
    text_params = parse_text_parameters(query_params)
    if text_params:
        errors = validate_text_parameters(text_params)
        if errors:
            raise ValueError(f"Invalid text parameters: {', '.join(errors)}")

    base_image_param = query_params.get("baseImage") or get_base_image_default()
    try:
        base_opacity = int(query_params.get("baseOpacity", str(get_base_opacity_default())))
    except (ValueError, TypeError):
        base_opacity = get_base_opacity_default()

    image1_param = query_params.get("image1")
    if not image1_param and not text_params:
        raise ValueError("image1 または text1〜text3 のいずれかが必要です")

    images: Dict[str, Image.Image] = {}

    # ベース画像の特殊値処理（white / #RRGGBB(AA) / transparent）— image_processor.py準拠
    base_is_special = False
    if base_image_param == "white":
        images["base"] = Image.new("RGBA", CANVAS_SIZE, (255, 255, 255, 255))
        base_is_special = True
    elif base_image_param.startswith("#"):
        from text_renderer import _parse_color
        color = _parse_color(base_image_param)
        if len(color) == 3:
            color = (*color, 255)
        images["base"] = Image.new("RGBA", CANVAS_SIZE, color)
        base_is_special = True
    elif base_image_param == "transparent":
        base_is_special = True

    # テキストのみモード（image1省略時は透明1x1）
    if not image1_param and text_params:
        images["image1"] = Image.new("RGBA", (1, 1), (0, 0, 0, 0))
        img_params["image1"] = {"x": 0, "y": 0, "width": 1, "height": 1}

    if image1_param:
        image_paths = {"image1": image1_param}
        if base_image_param and not base_is_special:
            image_paths["base"] = base_image_param
        for key in ("image2", "image3"):
            if query_params.get(key):
                image_paths[key] = query_params[key]
        images.update(fetch_images_parallel(image_paths))

    composite = create_composite_image(
        images.get("base"),
        images["image1"],
        images.get("image2"),
        images.get("image3"),
        img_params,
        text_params=text_params if text_params else None,
        base_opacity=base_opacity,
    )

    buf = BytesIO()
    composite.save(buf, format="PNG")
    return buf.getvalue()
```

`gcp/app/__init__.py` は空ファイルで作成。

- [ ] **Step 6: テストが通ることを確認**

```bash
cd gcp && .venv/bin/pytest tests/test_compositor_service.py -v
```

Expected: 5 passed

- [ ] **Step 7: コミット**

```bash
git add gcp/app gcp/tests gcp/requirements.txt gcp/requirements-dev.txt
git commit -m "feat(gcp): 合成サービスアダプタ追加 — lambda合成エンジンを無変更で共有"
```

---

### Task 2: FastAPI /images/composite エンドポイント

**Files:**
- Create: `gcp/app/main.py`
- Test: `gcp/tests/test_api.py`

**Interfaces:**
- Consumes: Task 1の `compose_still_image`, `UnsupportedSourceError`
- Produces: FastAPI `app`（`app.main:app`）。エンドポイント `GET /healthz`, `GET|POST /images/composite`（PNG直接返却）。Task 3が `app` に `/chat` を追加、Task 5のコンテナCMDが参照

- [ ] **Step 1: 失敗するテストを書く**

`gcp/tests/test_api.py`:

```python
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


def test_healthz():
    res = client.get("/healthz")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_composite_get_returns_png():
    res = client.get("/images/composite", params={"image1": "test", "image2": "test"})
    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert res.content[:8] == PNG_MAGIC


def test_composite_post_returns_png():
    res = client.post("/images/composite", json={"image1": "test", "text1": "LIVE"})
    assert res.status_code == 200
    assert res.content[:8] == PNG_MAGIC


def test_composite_s3_source_400():
    res = client.get("/images/composite", params={"image1": "s3://bucket/x.png"})
    assert res.status_code == 400
    assert "s3://" in res.json()["error"]


def test_composite_empty_400():
    res = client.get("/images/composite")
    assert res.status_code == 400
```

- [ ] **Step 2: 失敗を確認**

```bash
cd gcp && .venv/bin/pytest tests/test_api.py -v
```

Expected: FAIL（`ModuleNotFoundError: No module named 'app.main'`）

- [ ] **Step 3: main.pyを実装**

`gcp/app/main.py`:

```python
"""Image Compositor GCP — FastAPIエントリポイント。

AWS版とのAPI契約差分（Step 1の意図的簡略化）:
- format パラメータは無視し常にPNG直接返却（format=html非対応）
- 動画生成パラメータ（video/videoDuration/videoFormat）非対応
"""
import logging

from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

from app.compositor_service import UnsupportedSourceError, compose_still_image

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Image Compositor GCP", version="0.1.0")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/images/composite")
def composite_get(request: Request) -> Response:
    return _compose_response(dict(request.query_params))


@app.post("/images/composite")
async def composite_post(request: Request) -> Response:
    body = await request.json()
    return _compose_response({k: str(v) for k, v in body.items()})


def _compose_response(params: dict) -> Response:
    try:
        png = compose_still_image(params)
    except (UnsupportedSourceError, ValueError) as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    except Exception:
        logger.exception("composition failed")
        return JSONResponse(status_code=500, content={"error": "画像の合成に失敗しました"})
    return Response(content=png, media_type="image/png")
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd gcp && .venv/bin/pytest tests/ -v
```

Expected: 10 passed（Task 1の5件 + 本Taskの5件）

- [ ] **Step 5: ローカル起動して実挙動確認**

```bash
cd gcp && PYTHONPATH=../lambda/python:. .venv/bin/uvicorn app.main:app --port 8080 &
sleep 2
curl -s "http://localhost:8080/images/composite?image1=test&image2=test" -o /tmp/gcp-test.png
file /tmp/gcp-test.png   # Expected: PNG image data, 2000 x 1000
kill %1
```

- [ ] **Step 6: コミット**

```bash
git add gcp/app/main.py gcp/tests/test_api.py
git commit -m "feat(gcp): /images/composite エンドポイント追加（FastAPI, PNG直接返却）"
```

---

### Task 3: Geminiエージェント + /chat エンドポイント

**Files:**
- Create: `gcp/app/tools.py`, `gcp/app/agent.py`, `gcp/app/history.py`（InMemoryのみ）
- Modify: `gcp/app/main.py`（/chat系を追加）
- Test: `gcp/tests/test_tools.py`, `gcp/tests/test_agent.py`, `gcp/tests/test_history.py`, `gcp/tests/test_api.py`（/chatテスト追記）

**Interfaces:**
- Consumes: Task 1の `compose_still_image`
- Produces:
  - `tools.ToolContext`（`.images: list[bytes]`）、`tools.make_tools(ctx) -> list[Callable]`
  - `agent.run_agent(message: str, history: list[dict], client=None) -> tuple[str, list[bytes]]`
  - `history.ChatHistory`（Protocol: `append(session_id, role, content)`, `get(session_id, limit=20) -> list[dict]`, `delete(session_id) -> int`）、`history.InMemoryHistory`, `history.create_history() -> ChatHistory`
  - HTTP: `POST /chat` `{message, sessionId?}` → `{reply, sessionId, modelId, images: [base64...]}`、`GET|DELETE /chat/history/{session_id}`

- [ ] **Step 1: toolsの失敗するテストを書く**

`gcp/tests/test_tools.py`:

```python
from app.tools import ToolContext, make_tools


def _get_tool(ctx, name):
    return next(t for t in make_tools(ctx) if t.__name__ == name)


def test_compose_images_stores_png_and_returns_metadata_only():
    ctx = ToolContext()
    compose = _get_tool(ctx, "compose_images")
    result = compose(image1="test", image2="test", image1_x=100, image1_y=100)
    assert result["status"] == "success"
    assert "image_base64" not in str(result)  # base64をモデルに返さない
    assert len(ctx.images) == 1
    assert ctx.images[0][:8] == b"\x89PNG\r\n\x1a\n"


def test_compose_images_reports_used_params():
    ctx = ToolContext()
    compose = _get_tool(ctx, "compose_images")
    result = compose(image1="test", text1="LIVE", text1_x=1800, text1_y=300)
    assert result["used_params"]["text1"] == "LIVE"
    assert result["used_params"]["text1X"] == "1800"


def test_get_position_coordinates():
    ctx = ToolContext()
    pos = _get_tool(ctx, "get_position_coordinates")
    assert pos(position="右上") == {"x": 1620, "y": 100}
    unknown = pos(position="ナナメ")
    assert "error" in unknown and "候補" in unknown["error"]
```

- [ ] **Step 2: 失敗を確認**

```bash
cd gcp && .venv/bin/pytest tests/test_tools.py -v
```

Expected: FAIL（`ModuleNotFoundError`）

- [ ] **Step 3: tools.pyを実装**

`gcp/app/tools.py`:

```python
"""Gemini function calling用ツール群（AWS版agent_tools.pyのStep 1サブセット）。

compose_imagesは生成PNGをToolContextに蓄積し、モデルへはメタデータのみ返す
（base64をプロンプトに載せるとトークン浪費・コンテキスト溢れになるため）。
"""
from typing import Callable, Optional

from app.compositor_service import compose_still_image

# キャンバス2000x1000上の九分割位置（AWS agent_tools._resolve_positionに相当）
_POSITIONS = {
    "左上": (100, 100), "上": (860, 100), "右上": (1620, 100),
    "左": (100, 400), "中央": (860, 400), "右": (1620, 400),
    "左下": (100, 700), "下": (860, 700), "右下": (1620, 700),
}


class ToolContext:
    """1リクエスト分のツール実行結果（生成画像PNG）を保持する。"""

    def __init__(self) -> None:
        self.images: list[bytes] = []


def make_tools(ctx: ToolContext) -> list[Callable]:
    """ctxに束縛されたツール関数のリストを返す（google-genaiに直接渡せる）。"""

    def compose_images(
        image1: str,
        image2: Optional[str] = None,
        image3: Optional[str] = None,
        image1_x: Optional[int] = None,
        image1_y: Optional[int] = None,
        image1_width: Optional[int] = None,
        image1_height: Optional[int] = None,
        image2_x: Optional[int] = None,
        image2_y: Optional[int] = None,
        image2_width: Optional[int] = None,
        image2_height: Optional[int] = None,
        image3_x: Optional[int] = None,
        image3_y: Optional[int] = None,
        image3_width: Optional[int] = None,
        image3_height: Optional[int] = None,
        base_image: Optional[str] = None,
        base_opacity: Optional[int] = None,
        text1: Optional[str] = None,
        text1_x: Optional[int] = None,
        text1_y: Optional[int] = None,
        text1_size: Optional[int] = None,
        text1_color: Optional[str] = None,
        text2: Optional[str] = None,
        text2_x: Optional[int] = None,
        text2_y: Optional[int] = None,
        text2_size: Optional[int] = None,
        text2_color: Optional[str] = None,
    ) -> dict:
        """画像を合成する。キャンバスは2000x1000、座標は左上原点。

        image1〜image3: "test"（テスト画像）またはHTTP URL。
        位置・サイズ省略時はシステムデフォルトが適用される。
        base_image: "white" / "transparent" / "#RRGGBB"。
        base_opacity: 0-100。text1〜text2でテロップを追加できる。
        成功時は使用パラメータを返す（画像データは別経路でユーザーに届く）。
        """
        params: dict[str, str] = {"image1": image1}
        mapping = {
            "image2": image2, "image3": image3,
            "image1X": image1_x, "image1Y": image1_y,
            "image1Width": image1_width, "image1Height": image1_height,
            "image2X": image2_x, "image2Y": image2_y,
            "image2Width": image2_width, "image2Height": image2_height,
            "image3X": image3_x, "image3Y": image3_y,
            "image3Width": image3_width, "image3Height": image3_height,
            "baseImage": base_image, "baseOpacity": base_opacity,
            "text1": text1, "text1X": text1_x, "text1Y": text1_y,
            "text1Size": text1_size, "text1Color": text1_color,
            "text2": text2, "text2X": text2_x, "text2Y": text2_y,
            "text2Size": text2_size, "text2Color": text2_color,
        }
        for key, value in mapping.items():
            if value is not None:
                params[key] = str(value)
        try:
            png = compose_still_image(params)
        except ValueError as e:
            return {"status": "error", "message": str(e)}
        ctx.images.append(png)
        return {"status": "success", "used_params": params, "size_bytes": len(png)}

    def get_position_coordinates(position: str) -> dict:
        """「左上」「中央」「右下」等の位置名をキャンバス2000x1000上のx,y座標へ変換する。"""
        if position not in _POSITIONS:
            return {"error": f"未知の位置名です。候補: {', '.join(_POSITIONS)}"}
        x, y = _POSITIONS[position]
        return {"x": x, "y": y}

    return [compose_images, get_position_coordinates]
```

- [ ] **Step 4: toolsテストが通ることを確認**

```bash
cd gcp && .venv/bin/pytest tests/test_tools.py -v
```

Expected: 3 passed

- [ ] **Step 5: history（InMemory）のテストを書く**

`gcp/tests/test_history.py`:

```python
from app.history import InMemoryHistory


def test_append_get_delete_roundtrip():
    h = InMemoryHistory()
    h.append("s1", "user", "こんにちは")
    h.append("s1", "model", "どうぞ")
    msgs = h.get("s1")
    assert [m["role"] for m in msgs] == ["user", "model"]
    assert h.delete("s1") == 2
    assert h.get("s1") == []


def test_get_respects_limit():
    h = InMemoryHistory()
    for i in range(30):
        h.append("s1", "user", f"msg{i}")
    msgs = h.get("s1", limit=20)
    assert len(msgs) == 20
    assert msgs[-1]["content"] == "msg29"
```

- [ ] **Step 6: history.pyを実装（InMemory + factory）**

`gcp/app/history.py`:

```python
"""会話履歴の抽象化。Step 1はInMemory、Task 4でFirestore実装を追加する。"""
import os
import time
from typing import Protocol


class ChatHistory(Protocol):
    def append(self, session_id: str, role: str, content: str) -> None: ...
    def get(self, session_id: str, limit: int = 20) -> list[dict]: ...
    def delete(self, session_id: str) -> int: ...


class InMemoryHistory:
    """開発・テスト用。プロセス再起動で消える。"""

    def __init__(self) -> None:
        self._data: dict[str, list[dict]] = {}

    def append(self, session_id: str, role: str, content: str) -> None:
        self._data.setdefault(session_id, []).append(
            {"role": role, "content": content, "createdAt": time.time()}
        )

    def get(self, session_id: str, limit: int = 20) -> list[dict]:
        return self._data.get(session_id, [])[-limit:]

    def delete(self, session_id: str) -> int:
        return len(self._data.pop(session_id, []))


def create_history() -> ChatHistory:
    backend = os.environ.get("HISTORY_BACKEND", "memory")
    if backend == "firestore":
        from app.history_firestore import FirestoreHistory  # Task 4で追加
        return FirestoreHistory()
    return InMemoryHistory()
```

```bash
cd gcp && .venv/bin/pytest tests/test_history.py -v
```

Expected: 2 passed

- [ ] **Step 7: agentのテストを書く（fakeクライアント注入）**

`gcp/tests/test_agent.py`:

```python
from app.agent import run_agent


class _FakeResponse:
    text = "右上に配置しました"


class _FakeModels:
    def __init__(self):
        self.last_kwargs = None

    def generate_content(self, **kwargs):
        self.last_kwargs = kwargs
        return _FakeResponse()


class _FakeClient:
    def __init__(self):
        self.models = _FakeModels()


def test_run_agent_returns_text_and_passes_history():
    client = _FakeClient()
    reply, images = run_agent(
        "赤い丸を右上に置いて",
        history=[{"role": "user", "content": "前の発言"}, {"role": "model", "content": "了解"}],
        client=client,
    )
    assert reply == "右上に配置しました"
    assert images == []
    contents = client.models.last_kwargs["contents"]
    assert len(contents) == 3  # 履歴2 + 今回1
    assert contents[-1].parts[0].text == "赤い丸を右上に置いて"
```

- [ ] **Step 8: agent.pyを実装**

`gcp/app/agent.py`:

```python
"""Gemini function callingエージェント（google-genai SDK, Vertex AIモード）。

自然言語→決定論的合成パラメータへの翻訳のみを担い、ピクセルは生成しない
（設計原則: .claude/steering/product.md「プロダクトの立ち位置」）。
"""
import os

from google import genai
from google.genai import types

from app.tools import ToolContext, make_tools

DEFAULT_MODEL_ID = "gemini-2.5-flash"

SYSTEM_PROMPT = """あなたは画像合成アシスタントです。ユーザーの日本語指示を画像合成パラメータに変換し、ツールで実行します。

ルール:
- キャンバスは2000x1000ピクセル、座標は左上原点
- 「右上」「中央」等の曖昧な位置指定は get_position_coordinates で座標に変換してから compose_images を呼ぶ
- 画像ソースは "test"（テスト画像）またはHTTP URLのみ。S3は使えない
- 合成後は使用したパラメータ（座標・サイズ・色）を必ずユーザーに報告する
- 日本語で応答する
"""


def _get_client() -> genai.Client:
    return genai.Client(
        vertexai=True,
        project=os.environ["GOOGLE_CLOUD_PROJECT"],
        location=os.environ.get("GOOGLE_CLOUD_LOCATION", "asia-northeast1"),
    )


def run_agent(message: str, history: list[dict], client=None) -> tuple[str, list[bytes]]:
    """1ターン実行し (応答テキスト, 生成画像PNGリスト) を返す。

    historyのroleは "user" / "model"（Gemini API準拠）。
    """
    client = client or _get_client()
    ctx = ToolContext()
    contents = [
        types.Content(role=m["role"], parts=[types.Part(text=m["content"])])
        for m in history
    ]
    contents.append(types.Content(role="user", parts=[types.Part(text=message)]))
    response = client.models.generate_content(
        model=os.environ.get("GEMINI_MODEL_ID", DEFAULT_MODEL_ID),
        contents=contents,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_PROMPT,
            tools=make_tools(ctx),  # Python関数を渡すと自動function callingループが有効になる
        ),
    )
    return response.text or "", ctx.images
```

```bash
cd gcp && .venv/bin/pytest tests/test_agent.py -v
```

Expected: 1 passed

- [ ] **Step 9: /chat系エンドポイントのテストを test_api.py に追記**

```python
# test_api.py に追記
import uuid


def test_chat_returns_reply_and_session(monkeypatch):
    def fake_run_agent(message, history, client=None):
        return f"echo: {message}", [b"\x89PNG\r\n\x1a\nfake"]

    monkeypatch.setattr("app.main.run_agent", fake_run_agent)
    res = client.post("/chat", json={"message": "テスト"})
    assert res.status_code == 200
    body = res.json()
    assert body["reply"] == "echo: テスト"
    uuid.UUID(body["sessionId"])  # 有効なUUID
    assert len(body["images"]) == 1


def test_chat_history_roundtrip(monkeypatch):
    monkeypatch.setattr("app.main.run_agent", lambda m, h, client=None: ("了解", []))
    session = client.post("/chat", json={"message": "1回目"}).json()["sessionId"]
    client.post("/chat", json={"message": "2回目", "sessionId": session})
    msgs = client.get(f"/chat/history/{session}").json()["messages"]
    assert len(msgs) == 4  # user/model × 2往復
    assert client.delete(f"/chat/history/{session}").json()["deleted"] == 4


def test_chat_message_validation():
    assert client.post("/chat", json={}).status_code == 400
    assert client.post("/chat", json={"message": "x" * 2001}).status_code == 400
```

- [ ] **Step 10: main.pyに/chat系を追加**

`gcp/app/main.py` に追記（importsに `base64`, `os`, `uuid`, `run_agent`, `create_history` を追加）:

```python
import base64
import os
import uuid

from app.agent import run_agent
from app.history import create_history

app.state.history = create_history()


@app.post("/chat")
async def chat(request: Request):
    body = await request.json()
    message = (body.get("message") or "").strip()
    if not message or len(message) > 2000:
        return JSONResponse(
            status_code=400,
            content={"error": "message は1〜2000文字で指定してください"},
        )
    session_id = body.get("sessionId") or str(uuid.uuid4())
    history = app.state.history
    try:
        reply, images = run_agent(message, history.get(session_id))
    except Exception:
        logger.exception("agent failed")
        return JSONResponse(status_code=500, content={"error": "エージェント実行に失敗しました"})
    history.append(session_id, "user", message)
    history.append(session_id, "model", reply)
    return {
        "reply": reply,
        "sessionId": session_id,
        "modelId": os.environ.get("GEMINI_MODEL_ID", "gemini-2.5-flash"),
        "images": [base64.b64encode(p).decode() for p in images],
    }


@app.get("/chat/history/{session_id}")
def chat_history_get(session_id: str):
    return {"sessionId": session_id, "messages": app.state.history.get(session_id)}


@app.delete("/chat/history/{session_id}")
def chat_history_delete(session_id: str):
    return {"sessionId": session_id, "deleted": app.state.history.delete(session_id)}
```

- [ ] **Step 11: 全テストが通ることを確認**

```bash
cd gcp && .venv/bin/pytest tests/ -v
```

Expected: 19 passed（T1:5 + T2:5 + tools:3 + history:2 + agent:1 + chat API:3）

- [ ] **Step 12: コミット**

```bash
git add gcp/app gcp/tests
git commit -m "feat(gcp): Gemini function callingエージェントと/chat系エンドポイント追加"
```

---

### Task 4: Firestore会話履歴バックエンド

**Files:**
- Create: `gcp/app/history_firestore.py`
- Test: `gcp/tests/test_history.py`（fakeクライアントでのテスト追記）

**Interfaces:**
- Consumes: Task 3の `ChatHistory` Protocol
- Produces: `FirestoreHistory(client=None)`。`HISTORY_BACKEND=firestore` で `create_history()` から返される。TTLフィールド名は `expireAt`（Task 6のTerraform TTLポリシーと一致必須）

- [ ] **Step 1: 失敗するテストを書く（fake Firestoreクライアント）**

`gcp/tests/test_history.py` に追記:

```python
from datetime import datetime, timedelta, timezone


class _FakeDoc:
    def __init__(self, data):
        self._data = data
        self.reference = self

    def get(self, key):
        return self._data.get(key)

    def delete(self):
        self._deleted = True


class _FakeCollection:
    """chat_sessions/{sid}/messages を模倣する最小fake。"""

    def __init__(self):
        self.docs: list[_FakeDoc] = []

    def add(self, data):
        self.docs.append(_FakeDoc(data))

    def order_by(self, field, direction=None):
        self._sorted = sorted(self.docs, key=lambda d: d.get("createdAt"), reverse=True)
        return self

    def limit(self, n):
        self._limited = self._sorted[:n]
        return self

    def stream(self):
        return iter(getattr(self, "_limited", self.docs))


class _FakeFirestoreClient:
    def __init__(self):
        self.collections: dict[str, _FakeCollection] = {}

    def collection(self, name):
        return self

    def document(self, session_id):
        self._sid = session_id
        return self

    # document().collection("messages") の呼び出し
    def __call__(self):  # 使わない
        raise AssertionError


def test_firestore_history_append_sets_ttl():
    from app.history_firestore import TTL_DAYS, FirestoreHistory

    fake_col = _FakeCollection()

    class _Client(_FakeFirestoreClient):
        def collection(self, name):
            if name == "messages":
                return fake_col
            return self

    h = FirestoreHistory(client=_Client())
    h.append("s1", "user", "hello")
    doc = fake_col.docs[0]
    assert doc.get("role") == "user"
    delta = doc.get("expireAt") - doc.get("createdAt")
    assert delta == timedelta(days=TTL_DAYS)
```

- [ ] **Step 2: 失敗を確認**

```bash
cd gcp && .venv/bin/pytest tests/test_history.py -v
```

Expected: 既存2件PASS、新規1件FAIL（`ModuleNotFoundError: app.history_firestore`）

- [ ] **Step 3: history_firestore.pyを実装**

`gcp/app/history_firestore.py`:

```python
"""Firestore会話履歴（TTL 7日）。

構造: chat_sessions/{sessionId}/messages/{auto-id}
TTLはTerraformで expireAt フィールドにTTLポリシーを設定して実現する。
"""
from datetime import datetime, timedelta, timezone

from google.cloud import firestore

TTL_DAYS = 7


class FirestoreHistory:
    def __init__(self, client=None) -> None:
        self._db = client or firestore.Client()

    def _messages(self, session_id: str):
        return (
            self._db.collection("chat_sessions")
            .document(session_id)
            .collection("messages")
        )

    def append(self, session_id: str, role: str, content: str) -> None:
        now = datetime.now(timezone.utc)
        self._messages(session_id).add(
            {
                "role": role,
                "content": content,
                "createdAt": now,
                "expireAt": now + timedelta(days=TTL_DAYS),
            }
        )

    def get(self, session_id: str, limit: int = 20) -> list[dict]:
        docs = (
            self._messages(session_id)
            .order_by("createdAt", direction=firestore.Query.DESCENDING)
            .limit(limit)
            .stream()
        )
        return [
            {"role": d.get("role"), "content": d.get("content")}
            for d in reversed(list(docs))
        ]

    def delete(self, session_id: str) -> int:
        count = 0
        for doc in self._messages(session_id).stream():
            doc.reference.delete()
            count += 1
        return count
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd gcp && .venv/bin/pytest tests/ -v
```

Expected: 20 passed

- [ ] **Step 5: コミット**

```bash
git add gcp/app/history_firestore.py gcp/tests/test_history.py
git commit -m "feat(gcp): Firestore会話履歴バックエンド追加（TTL 7日）"
```

---

### Task 5: Dockerfile + Cloud Build設定

**Files:**
- Create: `gcp/Dockerfile`
- Create: `gcp/.dockerignore`（リポジトリルート用ではなくビルド最適化用）
- Create: `gcp/cloudbuild.yaml`

**Interfaces:**
- Consumes: Task 1-4の `gcp/app`、`lambda/python`（エンジン）、`frontend/public/composite-default.json`
- Produces: コンテナイメージ `{REGION}-docker.pkg.dev/{PROJECT_ID}/image-compositor/api:latest`。Task 6のCloud Run定義、Task 7のdeploy.shが参照

- [ ] **Step 1: Dockerfileを書く**

`gcp/Dockerfile`（build contextは**リポジトリルート**）:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

COPY gcp/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 合成エンジン（lambda/pythonを無変更で共有）
COPY lambda/python/*.py /app/engine/
COPY lambda/python/fonts /app/engine/fonts
# デフォルト値JSON（AWSのdeploy.shに相当する配置）
COPY frontend/public/composite-default.json /app/engine/composite_defaults.json

COPY gcp/app /app/app

ENV PYTHONPATH=/app/engine
ENV PORT=8080

# Cloud RunはPORT環境変数を注入する
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
```

- [ ] **Step 2: cloudbuild.yamlを書く**

`gcp/cloudbuild.yaml`:

```yaml
# 実行: gcloud builds submit --config gcp/cloudbuild.yaml .  （リポジトリルートから）
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - build
      - -f
      - gcp/Dockerfile
      - -t
      - ${_REGION}-docker.pkg.dev/${PROJECT_ID}/image-compositor/api:latest
      - .
images:
  - ${_REGION}-docker.pkg.dev/${PROJECT_ID}/image-compositor/api:latest
substitutions:
  _REGION: asia-northeast1
```

- [ ] **Step 3: ローカルビルドで機能検証（arm64だが機能確認は可能）**

```bash
cd ~/develop/image-composite-agent/.worktrees/docs-issue106-multicloud-agent-plan
docker build -f gcp/Dockerfile -t gcp-compositor-local .
docker run -d --rm -p 8081:8080 --name gcp-test gcp-compositor-local
sleep 3
curl -s http://localhost:8081/healthz
curl -s "http://localhost:8081/images/composite?image1=test&image2=test" -o /tmp/container-test.png
file /tmp/container-test.png   # Expected: PNG image data, 2000 x 1000
docker stop gcp-test
```

> 注: /chatはGCP認証情報がコンテナ内にないため未検証でよい（Task 7のデプロイ後検証で確認）

- [ ] **Step 4: コミット**

```bash
git add gcp/Dockerfile gcp/cloudbuild.yaml gcp/.dockerignore
git commit -m "feat(gcp): Dockerfile + Cloud Build設定追加"
```

---

### Task 6: Terraformインフラ定義

**Files:**
- Create: `gcp/terraform/main.tf`, `gcp/terraform/cloudrun.tf`, `gcp/terraform/variables.tf`, `gcp/terraform/outputs.tf`

**Interfaces:**
- Consumes: Task 5のイメージパス規約 `{region}-docker.pkg.dev/{project}/image-compositor/api:latest`
- Produces: Cloud Runサービス `image-compositor-api`（URL出力 `service_url`）、Firestore DB + `expireAt` TTLポリシー、SA `image-compositor-run`。Task 7のdeploy.shが `terraform apply` と `service_url` 出力を使用

- [ ] **Step 1: variables.tf / main.tfを書く**

`gcp/terraform/variables.tf`:

```hcl
variable "project_id" {
  type = string
}

variable "region" {
  type    = string
  default = "asia-northeast1"
}

variable "image_tag" {
  type    = string
  default = "latest"
}

variable "gemini_model_id" {
  type    = string
  default = "gemini-2.5-flash"
}
```

`gcp/terraform/main.tf`:

```hcl
terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

resource "google_artifact_registry_repository" "images" {
  location      = var.region
  repository_id = "image-compositor"
  format        = "DOCKER"
}

resource "google_firestore_database" "default" {
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
}

# 会話履歴のTTL（history_firestore.pyのexpireAtフィールドと一致させる）
resource "google_firestore_field" "messages_ttl" {
  database   = google_firestore_database.default.name
  collection = "messages"
  field      = "expireAt"

  ttl_config {}

  index_config {}
}
```

- [ ] **Step 2: cloudrun.tf / outputs.tfを書く**

`gcp/terraform/cloudrun.tf`:

```hcl
resource "google_service_account" "run" {
  account_id   = "image-compositor-run"
  display_name = "Image Compositor Cloud Run SA"
}

resource "google_project_iam_member" "vertex_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.run.email}"
}

resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.run.email}"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "image-compositor-api"
  location = var.region

  template {
    service_account = google_service_account.run.email

    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/image-compositor/api:${var.image_tag}"

      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
        startup_cpu_boost = true
      }

      env {
        name  = "GOOGLE_CLOUD_PROJECT"
        value = var.project_id
      }
      env {
        name  = "GOOGLE_CLOUD_LOCATION"
        value = var.region
      }
      env {
        name  = "GEMINI_MODEL_ID"
        value = var.gemini_model_id
      }
      env {
        name  = "HISTORY_BACKEND"
        value = "firestore"
      }
    }
  }

  depends_on = [google_artifact_registry_repository.images]
}

# 検証用に未認証アクセスを許可（本番運用時は要見直し）
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}
```

`gcp/terraform/outputs.tf`:

```hcl
output "service_url" {
  value = google_cloud_run_v2_service.api.uri
}
```

- [ ] **Step 3: terraform init & validate**

```bash
cd gcp/terraform && terraform init && terraform validate
```

Expected: `Success! The configuration is valid.`

（terraform未インストールなら: `sudo apt-get install -y terraform` または https://developer.hashicorp.com/terraform/install の手順）

- [ ] **Step 4: コミット**

```bash
git add gcp/terraform
git commit -m "feat(gcp): Terraformインフラ定義追加（Cloud Run + Firestore TTL + IAM）"
```

---

### Task 7: デプロイ + 実機検証 + ドキュメント

**Files:**
- Create: `gcp/scripts/deploy.sh`
- Modify: `gcp/README.md`（デプロイ・検証手順を追記）
- Modify: `.claude/steering/structure.md`（`gcp/` ディレクトリを構成図に追加）
- Modify: `docs/superpowers/specs/2026-07-05-multicloud-agent-plan-design.md`（GCP Step 1のステータス更新）

**Interfaces:**
- Consumes: Task 5のcloudbuild.yaml、Task 6のterraform設定と `service_url` 出力
- Produces: 稼働中のCloud Runサービス + 検証済みエンドポイント

- [ ] **Step 1: deploy.shを書く**

`gcp/scripts/deploy.sh`:

```bash
#!/usr/bin/env bash
# GCP版のビルド＆デプロイ
# Usage: PROJECT_ID=image-compositor-dev ./gcp/scripts/deploy.sh
set -euo pipefail

: "${PROJECT_ID:?PROJECT_ID を指定してください}"
REGION="${REGION:-asia-northeast1}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

cd "$REPO_ROOT"
gcloud config set project "$PROJECT_ID"

echo "🏗  Cloud Buildでイメージをビルド（amd64）..."
gcloud builds submit --config gcp/cloudbuild.yaml --substitutions "_REGION=$REGION" .

echo "🚀 Terraform apply..."
cd gcp/terraform
terraform init -input=false
terraform apply -auto-approve -var "project_id=$PROJECT_ID" -var "region=$REGION"

SERVICE_URL="$(terraform output -raw service_url)"
echo "✅ Deployed: $SERVICE_URL"

echo "🔍 検証: healthz"
curl -sf "$SERVICE_URL/healthz"

echo "🔍 検証: 静止画合成"
curl -sf "$SERVICE_URL/images/composite?image1=test&image2=test" -o /tmp/gcp-deploy-test.png
file /tmp/gcp-deploy-test.png

echo "🔍 検証: chat"
curl -sf -X POST "$SERVICE_URL/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "赤い丸のテスト画像を右上に配置して"}' | head -c 500

echo ""
echo "🎉 All checks passed"
```

- [ ] **Step 2: 初回はArtifact Registryが必要なためTerraformを先行適用してからフルデプロイ**

```bash
chmod +x gcp/scripts/deploy.sh
# 初回のみ: ARリポジトリを先に作成（イメージpush先が必要なため）
cd gcp/terraform && terraform apply -auto-approve \
  -var "project_id=$PROJECT_ID" -target=google_artifact_registry_repository.images
cd ../..
PROJECT_ID=image-compositor-dev ./gcp/scripts/deploy.sh
```

Expected: `🎉 All checks passed`、chatレスポンスに `reply` と `images`（base64）が含まれる

- [ ] **Step 3: 決定論性の実機確認**

```bash
SERVICE_URL=$(cd gcp/terraform && terraform output -raw service_url)
curl -s "$SERVICE_URL/images/composite?image1=test&image2=test&text1=LIVE" -o /tmp/a.png
curl -s "$SERVICE_URL/images/composite?image1=test&image2=test&text1=LIVE" -o /tmp/b.png
sha256sum /tmp/a.png /tmp/b.png   # Expected: 同一ハッシュ
```

- [ ] **Step 4: ドキュメント更新**

- `gcp/README.md`: セットアップ〜デプロイ〜検証の全手順、AWS版とのAPI契約差分（format=html非対応・動画非対応・s3://非対応）を明記
- `.claude/steering/structure.md`: ルートディレクトリ構成に `├── gcp/ # GCP版（Cloud Run + Gemini、issue #106 Step 1）` を追加
- spec（`2026-07-05-multicloud-agent-plan-design.md`）: 比較マトリクスのGCP Step 1セルを「✅ 実装済み」に更新

- [ ] **Step 5: 全テスト最終確認とコミット**

```bash
cd gcp && .venv/bin/pytest tests/ -v && cd ..
git add gcp/scripts/deploy.sh gcp/README.md .claude/steering/structure.md docs/superpowers/specs/
git commit -m "feat(gcp): デプロイスクリプトと実機検証手順追加、ドキュメント更新"
```

- [ ] **Step 6: PR作成**

```bash
git push -u origin <作業ブランチ名>
gh pr create --base dev --title "feat(gcp): GCP Step 1 — Cloud Run + Gemini function calling Agent (issue #106)" --body "(PRテンプレートに従い、テスト結果・検証ログ・ドキュメント更新チェックリストを記載)"
```

---

## 実装順序と依存関係

```
Task 0（GCP環境）──────────────┐
Task 1（合成サービス）→ Task 2（API）→ Task 3（Agent+chat）→ Task 4（Firestore）
                                                    ↓
                              Task 5（Docker）→ Task 6（Terraform）→ Task 7（デプロイ検証）
```

Task 0はTask 7まで不要（Task 1〜5はローカル完結）のため、並行して進めてよい。

## 検証メトリクス収集（Step 1完了後のレビューゲート用）

Task 7完了後、spec §6の5メトリクス（コスト・レイテンシ・開発体験・決定論的等価性・Agent翻訳精度）を計測し、AWS版との比較メモを `docs/superpowers/specs/` に追記する。これはCloudflare Step 1完了後のレビューゲートのインプットとなる。
