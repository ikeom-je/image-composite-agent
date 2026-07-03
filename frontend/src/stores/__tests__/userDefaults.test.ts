import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserDefaultsStore } from '@/stores/userDefaults'
import type { Preset } from '@/stores/compositeDefaults'

const SAMPLE_PRESET: Preset = {
  description: 'ライブ配信用',
  baseImage: '#000000',
  baseOpacity: 100,
  image_placement: { image1: { x: 760, y: 290, width: 400, height: 400 } },
  text_overlays: {
    text1: { text: 'LIVE', position: '1800,80', font_size: 56, font_color: '#FF0000', bg_color: null },
  },
}

describe('useUserDefaultsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('初期状態では overrides は空オブジェクト', () => {
    const store = useUserDefaultsStore()
    expect(store.overrides).toEqual({})
    expect(store.hasOverrides).toBe(false)
  })

  it('applyPreset で baseImage/baseOpacity を localStorage に保存する', () => {
    const store = useUserDefaultsStore()
    store.applyPreset(SAMPLE_PRESET)
    expect(store.overrides.baseImage).toBe('#000000')
    expect(store.overrides.baseOpacity).toBe(100)
    expect(store.hasOverrides).toBe(true)
    const saved = JSON.parse(localStorage.getItem('composite-user-defaults') ?? '{}')
    expect(saved.baseImage).toBe('#000000')
  })

  it('reset() で overrides をクリアし localStorage を削除する', () => {
    const store = useUserDefaultsStore()
    store.applyPreset(SAMPLE_PRESET)
    store.reset()
    expect(store.overrides).toEqual({})
    expect(store.hasOverrides).toBe(false)
    expect(localStorage.getItem('composite-user-defaults')).toBeNull()
  })

  it('localStorage に保存済み値があれば初期化時に復元する', () => {
    localStorage.setItem('composite-user-defaults', JSON.stringify({ baseImage: '#FFFFFF', baseOpacity: 80 }))
    const store = useUserDefaultsStore()
    expect(store.overrides.baseImage).toBe('#FFFFFF')
    expect(store.overrides.baseOpacity).toBe(80)
  })

  it('localStorage が壊れていてもエラーにならず空オブジェクトを返す', () => {
    localStorage.setItem('composite-user-defaults', 'invalid json{')
    const store = useUserDefaultsStore()
    expect(store.overrides).toEqual({})
  })
})
