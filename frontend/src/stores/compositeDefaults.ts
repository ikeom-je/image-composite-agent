/**
 * 画像合成デフォルト値の一元管理ストア（Issue #58 / Requirement 21）
 *
 * /composite-default.json をビルド時に S3 (frontend bucket) へ配置し、フロント起動時に fetch する。
 * 詳細仕様は .kiro/specs/image-composition/design.md §6 を参照。
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface ImagePosition {
  x: number
  y: number
  width: number
  height: number
}

export interface TextPlaceholder {
  placeholder: string
  x: number
  y: number
  font_size: number
}

export type ImageMode = 'single' | 'double' | 'triple'
export type ImageKey = 'image1' | 'image2' | 'image3'
export type TextKey = 'text1' | 'text2' | 'text3'

export interface SystemDefault {
  canvas: { width: number; height: number }
  baseImage: string
  baseOpacity: number
  image_placement: {
    single: { image1: ImagePosition }
    double: { image1: ImagePosition; image2: ImagePosition }
    triple: { image1: ImagePosition; image2: ImagePosition; image3: ImagePosition }
  }
  text_placeholders: {
    text1: TextPlaceholder
    text2: TextPlaceholder
    text3: TextPlaceholder
  }
  video: { format: string; duration: number }
}

export interface CompositeDefaults {
  version: string
  system_default: SystemDefault
  presets: Record<string, unknown>
}

// design §6.9: フォールバック値。baseImage は transparent を維持してリスク最小化
const HARDCODED_FALLBACK: CompositeDefaults = {
  version: '1.0',
  system_default: {
    canvas: { width: 1920, height: 1080 },
    baseImage: 'transparent',
    baseOpacity: 100,
    image_placement: {
      single: { image1: { x: 1700, y: 96, width: 200, height: 200 } },
      double: {
        image1: { x: 1700, y: 96, width: 200, height: 200 },
        image2: { x: 600, y: 400, width: 300, height: 300 },
      },
      triple: {
        image1: { x: 1700, y: 96, width: 200, height: 200 },
        image2: { x: 600, y: 400, width: 300, height: 300 },
        image3: { x: 1520, y: 700, width: 300, height: 300 },
      },
    },
    text_placeholders: {
      text1: { placeholder: '', x: 0, y: 0, font_size: 48 },
      text2: { placeholder: '', x: 0, y: 0, font_size: 48 },
      text3: { placeholder: '', x: 0, y: 0, font_size: 48 },
    },
    video: { format: 'MP4', duration: 3 },
  },
  presets: {},
}

export const useCompositeDefaultsStore = defineStore('compositeDefaults', () => {
  const defaults = ref<CompositeDefaults | null>(null)
  const isLoaded = ref(false)

  const systemDefault = computed(() => defaults.value?.system_default ?? null)

  async function loadDefaults(): Promise<void> {
    if (isLoaded.value) return

    const url = `${window.location.origin}/composite-default.json`
    try {
      const res = await fetch(url, { cache: 'no-cache' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      defaults.value = (await res.json()) as CompositeDefaults
    } catch (e) {
      console.warn('[compositeDefaults] 読み込み失敗、フォールバック使用:', e)
      defaults.value = HARDCODED_FALLBACK
    }
    isLoaded.value = true
  }

  function determineImageMode(queryParams: Record<string, unknown>): ImageMode {
    if (queryParams.image3) return 'triple'
    if (queryParams.image2) return 'double'
    return 'single'
  }

  function getImageDefault(mode: ImageMode, key: ImageKey): ImagePosition {
    const sd = defaults.value?.system_default ?? HARDCODED_FALLBACK.system_default
    const placements = sd.image_placement as Record<ImageMode, Partial<Record<ImageKey, ImagePosition>>>
    const pos = placements[mode][key]
    if (!pos) {
      throw new Error(`getImageDefault: mode=${mode} に key=${key} のデフォルトはありません`)
    }
    return pos
  }

  function getTextPlaceholder(key: TextKey): TextPlaceholder {
    const sd = defaults.value?.system_default ?? HARDCODED_FALLBACK.system_default
    return sd.text_placeholders[key]
  }

  return {
    defaults,
    isLoaded,
    systemDefault,
    loadDefaults,
    determineImageMode,
    getImageDefault,
    getTextPlaceholder,
  }
})
