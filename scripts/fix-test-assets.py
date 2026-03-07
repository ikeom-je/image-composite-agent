#!/usr/bin/env python3
"""
テスト期待値画像データ修正スクリプト

このスクリプトは以下の機能を提供します：
1. ファイル形式判定（PNG vs base64テキスト）
2. base64データのデコード
3. 元ファイルのバックアップ
4. エラーハンドリング
"""

import os
import sys
import base64
import subprocess
from pathlib import Path
from dataclasses import dataclass
from typing import List, Optional
import shutil
import logging

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class FileInfo:
    """ファイル情報を格納するデータクラス"""
    path: str
    file_type: str  # 'png_image', 'base64_text', 'unknown'
    purpose: str    # 'expected_value', 'test_output', 'basic_test_image'
    size: int
    is_valid: bool
    needs_conversion: bool

class TestAssetFixer:
    """テスト用画像データ修正クラス"""
    
    def __init__(self, test_assets_dir: str = "test/test-assets"):
        self.test_assets_dir = Path(test_assets_dir)
        self.backup_dir = Path("test/test-results")
        self.backup_dir.mkdir(parents=True, exist_ok=True)
    
    def analyze_file(self, file_path: Path) -> FileInfo:
        """ファイルの形式と用途を分析"""
        try:
            # ファイルサイズ取得
            size = file_path.stat().st_size
            
            # file コマンドによる形式判定
            result = subprocess.run(
                ['file', str(file_path)], 
                capture_output=True, 
                text=True
            )
            file_output = result.stdout.strip()
            
            # ファイル形式判定
            if 'PNG image data' in file_output:
                file_type = 'png_image'
                is_valid = True
                needs_conversion = False
            elif 'ASCII text' in file_output and file_path.suffix == '.png':
                file_type = 'base64_text'
                is_valid = False
                needs_conversion = True
            else:
                file_type = 'unknown'
                is_valid = False
                needs_conversion = False
            
            # ファイル用途判定
            filename = file_path.name
            if filename.startswith('expected-'):
                purpose = 'expected_value'
            elif filename.startswith('test_'):
                purpose = 'test_output'
            elif filename in ['circle_red.png', 'rectangle_blue.png', 'triangle_green.png', 'default-base.png']:
                purpose = 'basic_test_image'
            else:
                purpose = 'unknown'
            
            return FileInfo(
                path=str(file_path),
                file_type=file_type,
                purpose=purpose,
                size=size,
                is_valid=is_valid,
                needs_conversion=needs_conversion
            )
            
        except Exception as e:
            logger.error(f"ファイル分析エラー {file_path}: {e}")
            return FileInfo(
                path=str(file_path),
                file_type='unknown',
                purpose='unknown',
                size=0,
                is_valid=False,
                needs_conversion=False
            )
    
    def create_backup(self, file_path: Path) -> bool:
        """元ファイルのバックアップを作成"""
        try:
            backup_path = self.backup_dir / f"{file_path.name}.backup"
            shutil.copy2(file_path, backup_path)
            logger.info(f"バックアップ作成: {backup_path}")
            return True
        except Exception as e:
            logger.error(f"バックアップ作成エラー {file_path}: {e}")
            return False
    
    def decode_base64_to_png(self, text_file_path: Path) -> bool:
        """base64テキストファイルをPNG画像に変換"""
        try:
            # バックアップ作成
            if not self.create_backup(text_file_path):
                logger.warning(f"バックアップ作成に失敗しましたが、変換を続行します: {text_file_path}")
            
            # base64データの読み込み
            with open(text_file_path, 'r', encoding='utf-8') as f:
                base64_data = f.read().strip()
            
            # base64データの検証
            try:
                # base64デコード
                image_data = base64.b64decode(base64_data)
                
                # PNGヘッダーの確認
                if not image_data.startswith(b'\x89PNG\r\n\x1a\n'):
                    logger.error(f"デコード結果がPNG形式ではありません: {text_file_path}")
                    return False
                
                # PNG形式で保存
                with open(text_file_path, 'wb') as f:
                    f.write(image_data)
                
                logger.info(f"base64からPNGに変換完了: {text_file_path}")
                return True
                
            except Exception as decode_error:
                logger.error(f"base64デコードエラー {text_file_path}: {decode_error}")
                return False
                
        except Exception as e:
            logger.error(f"ファイル変換エラー {text_file_path}: {e}")
            return False
    
    def verify_png_file(self, file_path: Path) -> bool:
        """PNG画像ファイルの検証"""
        try:
            # file コマンドで再確認
            result = subprocess.run(
                ['file', str(file_path)], 
                capture_output=True, 
                text=True
            )
            
            if 'PNG image data' in result.stdout:
                logger.info(f"PNG画像として正常に認識: {file_path}")
                return True
            else:
                logger.error(f"PNG画像として認識されません: {file_path}")
                return False
                
        except Exception as e:
            logger.error(f"PNG検証エラー {file_path}: {e}")
            return False
    
    def scan_and_fix_files(self) -> List[FileInfo]:
        """ファイルをスキャンして修正が必要なファイルを処理"""
        results = []
        
        if not self.test_assets_dir.exists():
            logger.error(f"テストアセットディレクトリが存在しません: {self.test_assets_dir}")
            return results
        
        # expected-*.pngファイルを検索
        expected_files = list(self.test_assets_dir.glob("expected-*.png"))
        
        if not expected_files:
            logger.warning("expected-*.pngファイルが見つかりません")
            return results
        
        logger.info(f"{len(expected_files)}個のexpected-*.pngファイルを発見")
        
        for file_path in expected_files:
            logger.info(f"処理中: {file_path}")
            
            # ファイル分析
            file_info = self.analyze_file(file_path)
            results.append(file_info)
            
            # 変換が必要な場合
            if file_info.needs_conversion:
                logger.info(f"base64テキストファイルを発見、変換を実行: {file_path}")
                
                if self.decode_base64_to_png(file_path):
                    # 変換後の検証
                    if self.verify_png_file(file_path):
                        file_info.is_valid = True
                        file_info.needs_conversion = False
                        file_info.file_type = 'png_image'
                        logger.info(f"変換成功: {file_path}")
                    else:
                        logger.error(f"変換後の検証に失敗: {file_path}")
                else:
                    logger.error(f"変換に失敗: {file_path}")
            
            elif file_info.file_type == 'png_image':
                logger.info(f"既に正常なPNG画像: {file_path}")
            
            else:
                logger.warning(f"不明なファイル形式: {file_path}")
        
        return results
    
    def generate_report(self, results: List[FileInfo]) -> str:
        """処理結果のレポートを生成"""
        report = []
        report.append("=== テスト期待値画像修正レポート ===\n")
        
        total_files = len(results)
        valid_files = sum(1 for r in results if r.is_valid)
        converted_files = sum(1 for r in results if r.needs_conversion)
        
        report.append(f"処理ファイル数: {total_files}")
        report.append(f"正常なファイル数: {valid_files}")
        report.append(f"変換が必要だったファイル数: {converted_files}")
        report.append("")
        
        report.append("ファイル詳細:")
        for result in results:
            status = "✓" if result.is_valid else "✗"
            report.append(f"{status} {result.path}")
            report.append(f"   形式: {result.file_type}")
            report.append(f"   用途: {result.purpose}")
            report.append(f"   サイズ: {result.size} bytes")
            if result.needs_conversion:
                report.append(f"   変換: 必要")
            report.append("")
        
        return "\n".join(report)

def main():
    """メイン関数"""
    logger.info("テスト期待値画像修正スクリプトを開始")
    
    # 修正処理実行
    fixer = TestAssetFixer()
    results = fixer.scan_and_fix_files()
    
    # レポート生成
    report = fixer.generate_report(results)
    print(report)
    
    # レポートをファイルに保存
    report_path = Path("test/test-results/fix-report.txt")
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write(report)
    
    logger.info(f"レポートを保存: {report_path}")
    
    # 結果判定
    all_valid = all(r.is_valid for r in results)
    if all_valid:
        logger.info("全てのファイルが正常です")
        sys.exit(0)
    else:
        logger.error("一部のファイルに問題があります")
        sys.exit(1)

if __name__ == "__main__":
    main()