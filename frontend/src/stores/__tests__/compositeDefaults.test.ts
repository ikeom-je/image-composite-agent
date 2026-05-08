import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useCompositeDefaultsStore } from '@/stores/compositeDefaults'

const SAMPLE_JSON = {
  version: '1.0',
  system_default: {
    canvas: { width: 1920, height: 1080 },
    baseImage: '#000000',
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
      text1: { placeholder: 'LIVE', x: 1800, y: 300, font_size: 40 },
      text2: { placeholder: 'Telop text on the bottom', x: 300, y: 900, font_size: 50 },
      text3: { placeholder: 'message for the program', x: 300, y: 100, font_size: 40 },
    },
    video: { format: 'MP4', duration: 3 },
  },
  presets: {},
}

describe('useCompositeDefaultsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('初期状態では isLoaded=false かつ defaults=null', () => {
    const store = useCompositeDefaultsStore()
    expect(store.isLoaded).toBe(false)
    expect(store.defaults).toBeNull()
  })

  it('loadDefaults() で composite-default.json を fetch する', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_JSON,
    })
    vi.stubGlobal('fetch', fetchMock)

    const store = useCompositeDefaultsStore()
    await store.loadDefaults()

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/composite-default.json'), expect.any(Object))
    expect(store.isLoaded).toBe(true)
    expect(store.defaults?.system_default.baseImage).toBe('#000000')
  })

  it('fetch 失敗時はフォールバック値を使用（baseImage は transparent を維持）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')))

    const store = useCompositeDefaultsStore()
    await store.loadDefaults()

    expect(store.isLoaded).toBe(true)
    expect(store.defaults?.system_default.baseImage).toBe('transparent') // design §6.9
  })

  it('HTTP error 時もフォールバック値を使用', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    const store = useCompositeDefaultsStore()
    await store.loadDefaults()

    expect(store.isLoaded).toBe(true)
    expect(store.defaults?.system_default.baseImage).toBe('transparent')
  })

  describe('determineImageMode (image2/image3 のみで判定、テキスト無関係)', () => {
    it('image1 のみ → single', () => {
      const store = useCompositeDefaultsStore()
      expect(store.determineImageMode({ image1: 'a' })).toBe('single')
    })

    it('image2 指定 → double', () => {
      const store = useCompositeDefaultsStore()
      expect(store.determineImageMode({ image1: 'a', image2: 'b' })).toBe('double')
    })

    it('image3 指定 → triple', () => {
      const store = useCompositeDefaultsStore()
      expect(store.determineImageMode({ image1: 'a', image2: 'b', image3: 'c' })).toBe('triple')
    })

    it('text 有無は影響しない（AC 21.3）', () => {
      const store = useCompositeDefaultsStore()
      expect(store.determineImageMode({ image1: 'a', text1: 'LIVE' })).toBe('single')
    })
  })

  describe('getter ヘルパー（fetch 後）', () => {
    beforeEach(async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => SAMPLE_JSON }))
      const store = useCompositeDefaultsStore()
      await store.loadDefaults()
    })

    it('getImageDefault(mode, key) で各モードの座標を返す', () => {
      const store = useCompositeDefaultsStore()
      expect(store.getImageDefault('single', 'image1')).toEqual({ x: 1700, y: 96, width: 200, height: 200 })
      expect(store.getImageDefault('triple', 'image3')).toEqual({ x: 1520, y: 700, width: 300, height: 300 })
    })

    it('getTextPlaceholder(key) で placeholder と座標を返す', () => {
      const store = useCompositeDefaultsStore()
      expect(store.getTextPlaceholder('text1')).toEqual({ placeholder: 'LIVE', x: 1800, y: 300, font_size: 40 })
      expect(store.getTextPlaceholder('text2').placeholder).toBe('Telop text on the bottom')
    })

    it('baseImage / baseOpacity / video.format / video.duration / canvas を取得できる', () => {
      const store = useCompositeDefaultsStore()
      expect(store.systemDefault?.baseImage).toBe('#000000')
      expect(store.systemDefault?.baseOpacity).toBe(100)
      expect(store.systemDefault?.video.format).toBe('MP4')
      expect(store.systemDefault?.video.duration).toBe(3)
      expect(store.systemDefault?.canvas).toEqual({ width: 1920, height: 1080 })
    })
  })

  it('読み込み済みの場合、loadDefaults() を再呼び出ししても fetch は1回のみ（キャッシュ）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => SAMPLE_JSON })
    vi.stubGlobal('fetch', fetchMock)

    const store = useCompositeDefaultsStore()
    await store.loadDefaults()
    await store.loadDefaults()
    await store.loadDefaults()

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
