"""
動画生成モジュール - v2.5.5

合成画像から動画を生成するためのモジュール。
ffmpegを使用して静止画像から動画を作成する。
"""

import os
import io
import logging
import tempfile
import subprocess
from typing import Optional, Dict, Any, Tuple
from PIL import Image

# ログ設定
logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# サポートされる動画フォーマット
SUPPORTED_VIDEO_FORMATS = {
    'XMF': {
        'extension': 'mp4',
        'codec': 'libx264',
        'container': 'mp4',
        'mime_type': 'video/mp4'
    },
    'MP4': {
        'extension': 'mp4',
        'codec': 'libx264',
        'container': 'mp4',
        'mime_type': 'video/mp4'
    },
    'WEBM': {
        'extension': 'webm',
        'codec': 'libvpx-vp9',
        'container': 'webm',
        'mime_type': 'video/webm'
    },
    'AVI': {
        'extension': 'avi',
        'codec': 'libx264',
        'container': 'avi',
        'mime_type': 'video/x-msvideo'
    }
}

# デフォルト設定
DEFAULT_DURATION = 3  # 秒
DEFAULT_FORMAT = 'XMF'
DEFAULT_FPS = 30
DEFAULT_QUALITY = 'high'


class VideoGenerationError(Exception):
    """動画生成エラー"""
    def __init__(self, message: str, details: Dict[str, Any] = None):
        self.message = message
        self.details = details or {}
        super().__init__(self.message)


def validate_video_parameters(duration: int, format_name: str) -> Tuple[bool, list]:
    """
    動画生成パラメータの検証
    
    Args:
        duration: 動画の長さ（秒）
        format_name: 動画フォーマット名
        
    Returns:
        Tuple[bool, list]: (検証成功フラグ, エラーメッセージリスト)
    """
    errors = []
    
    # 動画の長さの検証
    if not isinstance(duration, int) or duration < 1:
        errors.append("動画の長さは1秒以上の整数である必要があります")
    elif duration > 30:
        errors.append("動画の長さは30秒以下である必要があります")
    
    # フォーマットの検証
    if format_name not in SUPPORTED_VIDEO_FORMATS:
        errors.append(f"サポートされていない動画フォーマットです: {format_name}")
        errors.append(f"サポートされているフォーマット: {', '.join(SUPPORTED_VIDEO_FORMATS.keys())}")
    
    return len(errors) == 0, errors


def check_ffmpeg_availability() -> bool:
    """
    ffmpegの利用可能性をチェック
    
    Returns:
        bool: ffmpegが利用可能かどうか
    """
    try:
        result = subprocess.run(
            ['ffmpeg', '-version'],
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
        return False


def generate_video_from_image(
    image: Image.Image,
    duration: int = DEFAULT_DURATION,
    format_name: str = DEFAULT_FORMAT,
    fps: int = DEFAULT_FPS,
    quality: str = DEFAULT_QUALITY
) -> bytes:
    """
    静止画像から動画を生成
    
    Args:
        image: 合成画像（PIL Image）
        duration: 動画の長さ（秒）
        format_name: 動画フォーマット名
        fps: フレームレート
        quality: 品質設定
        
    Returns:
        bytes: 生成された動画のバイナリデータ
        
    Raises:
        VideoGenerationError: 動画生成に失敗した場合
    """
    logger.info(f"🎬 Starting video generation: duration={duration}s, format={format_name}, fps={fps}")
    
    # パラメータ検証
    is_valid, validation_errors = validate_video_parameters(duration, format_name)
    if not is_valid:
        raise VideoGenerationError(
            "動画生成パラメータが無効です",
            details={
                "validation_errors": validation_errors,
                "provided_params": {
                    "duration": duration,
                    "format": format_name,
                    "fps": fps
                }
            }
        )
    
    # ffmpegの利用可能性チェック
    if not check_ffmpeg_availability():
        raise VideoGenerationError(
            "ffmpegが利用できません",
            details={
                "error_type": "ffmpeg_not_available",
                "suggestion": "Lambda環境でffmpegが正しくインストールされているか確認してください"
            }
        )
    
    # フォーマット設定を取得
    format_config = SUPPORTED_VIDEO_FORMATS[format_name]
    
    # 一時ファイルを使用して動画生成
    with tempfile.TemporaryDirectory() as temp_dir:
        try:
            # 入力画像を一時ファイルに保存
            input_image_path = os.path.join(temp_dir, 'input_image.png')
            image.save(input_image_path, format='PNG', optimize=True)
            
            # 出力動画ファイルパス
            output_video_path = os.path.join(temp_dir, f'output_video.{format_config["extension"]}')
            
            # ffmpegコマンドを構築
            ffmpeg_cmd = build_ffmpeg_command(
                input_image_path,
                output_video_path,
                duration,
                fps,
                format_config,
                quality
            )
            
            logger.info(f"🔧 Executing ffmpeg command: {' '.join(ffmpeg_cmd)}")
            
            # ffmpegを実行
            result = subprocess.run(
                ffmpeg_cmd,
                capture_output=True,
                text=True,
                timeout=60  # 60秒でタイムアウト
            )
            
            if result.returncode != 0:
                raise VideoGenerationError(
                    "ffmpegによる動画生成に失敗しました",
                    details={
                        "return_code": result.returncode,
                        "stderr": result.stderr,
                        "stdout": result.stdout,
                        "command": ' '.join(ffmpeg_cmd)
                    }
                )
            
            # 生成された動画ファイルを読み込み
            if not os.path.exists(output_video_path):
                raise VideoGenerationError(
                    "動画ファイルが生成されませんでした",
                    details={
                        "output_path": output_video_path,
                        "temp_dir_contents": os.listdir(temp_dir)
                    }
                )
            
            with open(output_video_path, 'rb') as video_file:
                video_data = video_file.read()
            
            logger.info(f"✅ Video generation completed: {len(video_data)} bytes")
            return video_data
            
        except subprocess.TimeoutExpired:
            raise VideoGenerationError(
                "動画生成がタイムアウトしました",
                details={
                    "timeout_seconds": 60,
                    "duration": duration,
                    "format": format_name
                }
            )
        except Exception as e:
            if isinstance(e, VideoGenerationError):
                raise
            raise VideoGenerationError(
                "動画生成中に予期しないエラーが発生しました",
                details={
                    "original_error": str(e),
                    "error_type": type(e).__name__
                }
            )


def build_ffmpeg_command(
    input_path: str,
    output_path: str,
    duration: int,
    fps: int,
    format_config: Dict[str, str],
    quality: str
) -> list:
    """
    ffmpegコマンドを構築
    
    Args:
        input_path: 入力画像ファイルパス
        output_path: 出力動画ファイルパス
        duration: 動画の長さ（秒）
        fps: フレームレート
        format_config: フォーマット設定
        quality: 品質設定
        
    Returns:
        list: ffmpegコマンドの引数リスト
    """
    cmd = [
        'ffmpeg',
        '-y',  # 出力ファイルを上書き
        '-loop', '1',  # 入力画像をループ
        '-i', input_path,  # 入力ファイル
        '-c:v', format_config['codec'],  # ビデオコーデック
        '-t', str(duration),  # 動画の長さ
        '-r', str(fps),  # フレームレート
        '-pix_fmt', 'yuv420p',  # ピクセルフォーマット（互換性のため）
        '-movflags', '+faststart',  # Web再生用の最適化
    ]
    
    # 品質設定とプロファイル設定（互換性向上）
    if format_config['codec'] == 'libx264':
        cmd.extend([
            '-profile:v', 'baseline',  # 最大互換性のためのベースラインプロファイル
            '-level', '3.0',  # 互換性レベル
            '-preset', 'medium',  # エンコード速度と品質のバランス
        ])
        
        if quality == 'high':
            cmd.extend(['-crf', '20'])  # 高品質（少し下げて互換性向上）
        elif quality == 'medium':
            cmd.extend(['-crf', '25'])  # 中品質
        else:  # low quality
            cmd.extend(['-crf', '30'])  # 低品質
            
    elif format_config['codec'] == 'libvpx-vp9':
        if quality == 'high':
            cmd.extend(['-crf', '30', '-b:v', '0'])  # VP9高品質
        elif quality == 'medium':
            cmd.extend(['-crf', '35', '-b:v', '0'])  # VP9中品質
        else:  # low quality
            cmd.extend(['-crf', '40', '-b:v', '0'])  # VP9低品質
    
    # 音声なしの設定
    cmd.extend(['-an'])  # 音声トラックなし
    
    # 出力ファイル
    cmd.append(output_path)
    
    return cmd


def get_video_mime_type(format_name: str) -> str:
    """
    動画フォーマットのMIMEタイプを取得
    
    Args:
        format_name: 動画フォーマット名
        
    Returns:
        str: MIMEタイプ
    """
    return SUPPORTED_VIDEO_FORMATS.get(format_name, {}).get('mime_type', 'video/mp4')


def get_video_extension(format_name: str) -> str:
    """
    動画フォーマットのファイル拡張子を取得
    
    Args:
        format_name: 動画フォーマット名
        
    Returns:
        str: ファイル拡張子
    """
    return SUPPORTED_VIDEO_FORMATS.get(format_name, {}).get('extension', 'mp4')


if __name__ == "__main__":
    # テスト用コード
    print("🎬 動画生成モジュール テスト")
    
    # ffmpegの利用可能性チェック
    if check_ffmpeg_availability():
        print("✅ ffmpeg is available")
    else:
        print("❌ ffmpeg is not available")
    
    # サポートされているフォーマットを表示
    print(f"📋 Supported formats: {', '.join(SUPPORTED_VIDEO_FORMATS.keys())}")
    
    # パラメータ検証テスト
    is_valid, errors = validate_video_parameters(3, 'XMF')
    print(f"✅ Parameter validation test: valid={is_valid}, errors={errors}")