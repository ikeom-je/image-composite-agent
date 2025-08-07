#!/usr/bin/env python3
"""
期待値画像再生成スクリプト

APIの実際の出力から正しい期待値画像を再生成します。
"""

import os
import sys
import requests
import base64
from pathlib import Path
import logging
from typing import Dict, List, Optional
import time

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class ExpectedImageGenerator:
    """期待値画像生成クラス"""
    
    def __init__(self):
        self.api_base_url = os.environ.get('API_URL', 'https://u4v31lnz5m.execute-api.ap-northeast-1.amazonaws.com/prod')
        self.api_endpoint = f"{self.api_base_url}/images/composite"
        self.test_assets_dir = Path("test/test-assets")
        self.backup_dir = Path("test/test-results")
        self.backup_dir.mkdir(parents=True, exist_ok=True)
    
    def get_test_patterns(self) -> List[Dict]:
        """テストパターンの定義"""
        return [
            {
                'name': 'expected-2-images.png',
                'description': '2画像合成（基本パターン）',
                'params': {
                    'baseImage': 'test',
                    'image1': 'test',
                    'image2': 'test',
                    'format': 'png'
                }
            },
            {
                'name': 'expected-3-images.png',
                'description': '3画像合成',
                'params': {
                    'baseImage': 'test',
                    'image1': 'test',
                    'image2': 'test',
                    'image3': 'test',
                    'format': 'png'
                }
            },
            {
                'name': 'expected-aws-logo-base.png',
                'description': 'AWSロゴベース画像',
                'params': {
                    'baseImage': 'aws-logo',
                    'image1': 'test',
                    'format': 'png'
                }
            },
            {
                'name': 'expected-transparent-base.png',
                'description': '透明ベース画像',
                'params': {
                    'baseImage': 'transparent',
                    'image1': 'test',
                    'format': 'png'
                }
            },
            {
                'name': 'expected-three-images.png',
                'description': '3画像合成（別パターン）',
                'params': {
                    'baseImage': 'test',
                    'image1': 'test',
                    'image2': 'test',
                    'image3': 'test',
                    'format': 'png'
                }
            },
            {
                'name': 'expected-two-images.png',
                'description': '2画像合成（別パターン）',
                'params': {
                    'baseImage': 'test',
                    'image1': 'test',
                    'image2': 'test',
                    'format': 'png'
                }
            }
        ]
    
    def call_api(self, params: Dict) -> Optional[bytes]:
        """API呼び出しを実行"""
        try:
            logger.info(f"API呼び出し: {self.api_endpoint}")
            logger.info(f"パラメータ: {params}")
            
            response = requests.get(
                self.api_endpoint,
                params=params,
                timeout=30
            )
            
            logger.info(f"レスポンスステータス: {response.status_code}")
            logger.info(f"レスポンスヘッダー: {dict(response.headers)}")
            
            if response.status_code == 200:
                # Content-Typeを確認
                content_type = response.headers.get('content-type', '')
                
                if 'image/png' in content_type:
                    # Content-Typeがimage/pngでもbase64エンコードされている可能性がある
                    try:
                        # まずbase64デコードを試行
                        response_text = response.text
                        image_data = base64.b64decode(response_text)
                        
                        # PNGヘッダーの確認
                        if image_data.startswith(b'\x89PNG\r\n\x1a\n'):
                            logger.info("Content-Type: image/pngだがbase64エンコードされたPNGデータをデコード")
                            return image_data
                        else:
                            # base64デコードに失敗した場合、バイナリデータとして扱う
                            logger.info("バイナリPNGデータを受信")
                            return response.content
                    except Exception:
                        # base64デコードに失敗した場合、バイナリデータとして扱う
                        logger.info("バイナリPNGデータを受信")
                        return response.content
                elif 'text/' in content_type or 'application/json' in content_type:
                    # base64エンコードされたデータの可能性
                    try:
                        response_text = response.text
                        logger.info(f"テキストレスポンス長: {len(response_text)}")
                        
                        # base64デコードを試行
                        image_data = base64.b64decode(response_text)
                        
                        # PNGヘッダーの確認
                        if image_data.startswith(b'\x89PNG\r\n\x1a\n'):
                            logger.info("base64エンコードされたPNGデータをデコード")
                            return image_data
                        else:
                            logger.error("デコード結果がPNG形式ではありません")
                            return None
                            
                    except Exception as e:
                        logger.error(f"base64デコードエラー: {e}")
                        return None
                else:
                    logger.error(f"未対応のContent-Type: {content_type}")
                    return None
            else:
                logger.error(f"API呼び出しエラー: {response.status_code}")
                logger.error(f"レスポンス内容: {response.text[:500]}")
                return None
                
        except requests.exceptions.RequestException as e:
            logger.error(f"リクエストエラー: {e}")
            return None
        except Exception as e:
            logger.error(f"予期しないエラー: {e}")
            return None
    
    def save_expected_image(self, filename: str, image_data: bytes) -> bool:
        """期待値画像を保存"""
        try:
            file_path = self.test_assets_dir / filename
            
            # 既存ファイルのバックアップ
            if file_path.exists():
                backup_path = self.backup_dir / f"{filename}.backup.{int(time.time())}"
                file_path.rename(backup_path)
                logger.info(f"既存ファイルをバックアップ: {backup_path}")
            
            # 新しい期待値画像を保存
            with open(file_path, 'wb') as f:
                f.write(image_data)
            
            logger.info(f"期待値画像を保存: {file_path} ({len(image_data)} bytes)")
            return True
            
        except Exception as e:
            logger.error(f"ファイル保存エラー {filename}: {e}")
            return False
    
    def verify_png_image(self, filename: str) -> bool:
        """PNG画像の検証"""
        try:
            file_path = self.test_assets_dir / filename
            
            # ファイル存在確認
            if not file_path.exists():
                logger.error(f"ファイルが存在しません: {file_path}")
                return False
            
            # PNGヘッダーの確認
            with open(file_path, 'rb') as f:
                header = f.read(8)
                if not header.startswith(b'\x89PNG\r\n\x1a\n'):
                    logger.error(f"PNGヘッダーが不正: {file_path}")
                    return False
            
            logger.info(f"PNG画像として正常: {file_path}")
            return True
            
        except Exception as e:
            logger.error(f"PNG検証エラー {filename}: {e}")
            return False
    
    def generate_all_expected_images(self) -> Dict[str, bool]:
        """全ての期待値画像を生成"""
        results = {}
        patterns = self.get_test_patterns()
        
        logger.info(f"API エンドポイント: {self.api_endpoint}")
        logger.info(f"{len(patterns)}個のパターンで期待値画像を生成開始")
        
        for pattern in patterns:
            filename = pattern['name']
            description = pattern['description']
            params = pattern['params']
            
            logger.info(f"\n--- {filename} ({description}) ---")
            
            # API呼び出し
            image_data = self.call_api(params)
            
            if image_data:
                # 画像保存
                if self.save_expected_image(filename, image_data):
                    # 検証
                    if self.verify_png_image(filename):
                        results[filename] = True
                        logger.info(f"✓ {filename} 生成成功")
                    else:
                        results[filename] = False
                        logger.error(f"✗ {filename} 検証失敗")
                else:
                    results[filename] = False
                    logger.error(f"✗ {filename} 保存失敗")
            else:
                results[filename] = False
                logger.error(f"✗ {filename} API呼び出し失敗")
            
            # API呼び出し間隔を空ける
            time.sleep(1)
        
        return results
    
    def generate_report(self, results: Dict[str, bool]) -> str:
        """生成結果のレポートを作成"""
        report = []
        report.append("=== 期待値画像再生成レポート ===\n")
        
        total_patterns = len(results)
        success_count = sum(1 for success in results.values() if success)
        
        report.append(f"処理パターン数: {total_patterns}")
        report.append(f"成功数: {success_count}")
        report.append(f"失敗数: {total_patterns - success_count}")
        report.append(f"API エンドポイント: {self.api_endpoint}")
        report.append("")
        
        report.append("詳細結果:")
        for filename, success in results.items():
            status = "✓" if success else "✗"
            report.append(f"{status} {filename}")
        
        report.append("")
        
        if success_count == total_patterns:
            report.append("🎉 全ての期待値画像の生成に成功しました！")
        else:
            report.append("⚠️ 一部の期待値画像の生成に失敗しました。")
            report.append("   APIエンドポイントやパラメータを確認してください。")
        
        return "\n".join(report)

def main():
    """メイン関数"""
    logger.info("期待値画像再生成スクリプトを開始")
    
    # 生成処理実行
    generator = ExpectedImageGenerator()
    results = generator.generate_all_expected_images()
    
    # レポート生成
    report = generator.generate_report(results)
    print("\n" + report)
    
    # レポートをファイルに保存
    report_path = Path("test/test-results/regenerate-report.txt")
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    
    logger.info(f"レポートを保存: {report_path}")
    
    # 結果判定
    all_success = all(results.values())
    if all_success:
        logger.info("全ての期待値画像の生成に成功")
        sys.exit(0)
    else:
        logger.error("一部の期待値画像の生成に失敗")
        sys.exit(1)

if __name__ == "__main__":
    main()