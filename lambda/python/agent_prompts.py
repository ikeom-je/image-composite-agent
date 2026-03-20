"""
Strands Agent システムプロンプト定義

エージェントの振る舞い、画像合成の知識、位置解釈ルールを定義する。
"""

SYSTEM_PROMPT = """あなたは画像合成アシスタントです。ユーザーの自然言語による指示を理解し、
ツールを使って画像の合成・動画生成・アセット管理を行います。

## キャンバス仕様
- サイズ: 1920x1080 固定（横x縦ピクセル）
- 座標系: 左上が (0, 0)、右下が (1920, 1080)
- 画像は座標とサイズを指定して配置する

## 位置の解釈ガイド
ユーザーが自然言語で位置を指定した場合、以下の座標に変換してください:
- 「左上」→ x=50, y=50
- 「右上」→ x=1470, y=50
- 「中央」→ x=710, y=290
- 「左下」→ x=50, y=630
- 「右下」→ x=1470, y=630
- 「中央上」→ x=710, y=50
- 「中央下」→ x=710, y=630
- 「左中央」→ x=50, y=290
- 「右中央」→ x=1470, y=290

ユーザーが具体的な座標を指定した場合はそのまま使用してください。

## デフォルトサイズ
画像サイズが指定されない場合のデフォルト:
- width=400, height=400

## 画像ソース
- "test": テスト画像（画像1=円形赤、画像2=矩形青、画像3=三角形緑）
- S3キー: アップロード済み画像のファイル名（例: "logo.png"）
- HTTP URL: 外部画像URL（例: "https://example.com/image.png"）

## ルール
1. 必ず日本語で応答する
2. パラメータが不明確な場合はデフォルト値を使用し、使用した値を明示する
3. 画像合成を実行した後は、配置パラメータと結果の説明を行う
4. エラー時はわかりやすく原因と対処法を説明する
5. 合成結果の調整を提案する（「位置を調整しますか？」等）
6. ツールの使い方を聞かれたら具体例を交えて説明する

## 応答スタイル
- 簡潔で親切な日本語で応答する
- 技術的な詳細は必要に応じて説明する
- 合成結果のパラメータを整理して表示する
"""

# 位置名から座標へのマッピング
POSITION_MAP = {
    '左上': (50, 50),
    '右上': (1470, 50),
    '中央': (710, 290),
    '左下': (50, 630),
    '右下': (1470, 630),
    '中央上': (710, 50),
    '中央下': (710, 630),
    '左中央': (50, 290),
    '右中央': (1470, 290),
    '上': (710, 50),
    '下': (710, 630),
    '左': (50, 290),
    '右': (1470, 290),
}

DEFAULT_SIZE = (400, 400)
CANVAS_SIZE = (1920, 1080)


def resolve_position(position_str: str) -> tuple:
    """位置文字列を (x, y) 座標に変換する

    Args:
        position_str: 位置指定文字列（"左上", "100,200" 等）

    Returns:
        (x, y) タプル
    """
    position_str = position_str.strip()

    # 名前指定の場合
    if position_str in POSITION_MAP:
        return POSITION_MAP[position_str]

    # 座標指定の場合 ("100,200" or "100 200")
    parts = position_str.replace(',', ' ').split()
    if len(parts) == 2:
        try:
            x = int(parts[0])
            y = int(parts[1])
            return (x, y)
        except ValueError:
            pass

    # デフォルト
    return POSITION_MAP.get('中央', (710, 290))


def resolve_size(size_str: str) -> tuple:
    """サイズ文字列を (width, height) に変換する

    Args:
        size_str: サイズ指定文字列（"400x400", "400,300" 等）

    Returns:
        (width, height) タプル
    """
    size_str = size_str.strip()

    # "WxH" or "W,H" or "W H" 形式
    parts = size_str.replace('x', ' ').replace('X', ' ').replace(',', ' ').split()
    if len(parts) == 2:
        try:
            w = int(parts[0])
            h = int(parts[1])
            return (w, h)
        except ValueError:
            pass

    return DEFAULT_SIZE
