import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { 
  ImageParameters, 
  CompositeRequest, 
  CompositeResponse, 
  UploadedImage 
} from '@/types'
import { useAppStore } from './app'
import { useNotificationStore } from './notification'
import { apiService } from '@/utils/api.ts'

export const useImageStore = defineStore('image', () => {
  const appStore = useAppStore()
  const notificationStore = useNotificationStore()
  
  // State
  const images = ref<ImageParameters[]>([
    {
      url: 'test',
      position: { x: 100, y: 100 },
      opacity: 1.0,
      scale: 1.0,
      rotation: 0
    },
    {
      url: 'test',
      position: { x: 300, y: 200 },
      opacity: 1.0,
      scale: 1.0,
      rotation: 0
    }
  ])
  
  const thirdImage = ref<ImageParameters | null>(null)
  const outputFormat = ref<'png' | 'jpeg' | 'html'>('html')
  const canvasSize = ref({ width: 2000, height: 1000 })
  const compositeResult = ref<CompositeResponse | null>(null)
  const uploadedImages = ref<UploadedImage[]>([])
  const previewMode = ref<'2images' | '3images'>('2images')
  
  // Getters
  const hasThirdImage = computed(() => thirdImage.value !== null)
  const isValidRequest = computed(() => {
    return images.value.length >= 2 && 
           images.value.every(img => img.url.trim() !== '')
  })
  
  const requestPayload = computed((): CompositeRequest => {
    const request: CompositeRequest = {
      image1: images.value[0],
      image2: images.value[1],
      outputFormat: outputFormat.value,
      canvasSize: canvasSize.value
    }
    
    if (hasThirdImage.value && thirdImage.value) {
      request.image3 = thirdImage.value
    }
    
    return request
  })
  
  // Actions
  const updateImage = (index: number, updates: Partial<ImageParameters>) => {
    if (index >= 0 && index < images.value.length) {
      images.value[index] = { ...images.value[index], ...updates }
    }
  }
  
  const updateImageUrl = (index: number, url: string) => {
    updateImage(index, { url })
  }
  
  const updateImagePosition = (index: number, position: { x: number; y: number }) => {
    updateImage(index, { position })
  }
  
  const updateImageOpacity = (index: number, opacity: number) => {
    updateImage(index, { opacity: Math.max(0, Math.min(1, opacity)) })
  }
  
  const updateImageScale = (index: number, scale: number) => {
    updateImage(index, { scale: Math.max(0.1, Math.min(5, scale)) })
  }
  
  const updateImageRotation = (index: number, rotation: number) => {
    updateImage(index, { rotation: rotation % 360 })
  }
  
  const addThirdImage = () => {
    if (!hasThirdImage.value) {
      thirdImage.value = {
        url: 'test',
        position: { x: 500, y: 150 },
        opacity: 1.0,
        scale: 1.0,
        rotation: 0
      }
      previewMode.value = '3images'
    }
  }
  
  const removeThirdImage = () => {
    thirdImage.value = null
    previewMode.value = '2images'
  }
  
  const updateThirdImage = (updates: Partial<ImageParameters>) => {
    if (thirdImage.value) {
      thirdImage.value = { ...thirdImage.value, ...updates }
    }
  }
  
  const setOutputFormat = (format: 'png' | 'jpeg' | 'html') => {
    outputFormat.value = format
  }
  
  const setCanvasSize = (size: { width: number; height: number }) => {
    canvasSize.value = {
      width: Math.max(100, Math.min(4000, size.width)),
      height: Math.max(100, Math.min(4000, size.height))
    }
  }
  
  const resetToDefaults = () => {
    images.value = [
      {
        url: 'test',
        position: { x: 100, y: 100 },
        opacity: 1.0,
        scale: 1.0,
        rotation: 0
      },
      {
        url: 'test',
        position: { x: 300, y: 200 },
        opacity: 1.0,
        scale: 1.0,
        rotation: 0
      }
    ]
    thirdImage.value = null
    outputFormat.value = 'html'
    canvasSize.value = { width: 2000, height: 1000 }
    compositeResult.value = null
    previewMode.value = '2images'
  }
  
  const generateComposite = async (): Promise<CompositeResponse> => {
    if (!isValidRequest.value) {
      throw new Error('Invalid request: Please provide at least 2 valid images')
    }
    
    appStore.startLoading('Generating composite image...')
    
    try {
      const response = await apiService.generateComposite(requestPayload.value)
      compositeResult.value = response
      
      if (response.success) {
        notificationStore.showSuccess('Composite image generated successfully!')
      } else {
        notificationStore.showError(response.error || 'Failed to generate composite image')
      }
      
      return response
    } catch (error: any) {
      appStore.handleApiError(error)
      notificationStore.showError('Failed to generate composite image')
      throw error
    } finally {
      appStore.stopLoading()
    }
  }
  
  const downloadResult = () => {
    if (!compositeResult.value?.data) {
      notificationStore.showWarning('No image data to download')
      return
    }
    
    try {
      const format = outputFormat.value
      let dataUrl: string
      let filename: string
      
      if (format === 'html') {
        // HTMLの場合はそのままダウンロード
        const blob = new Blob([compositeResult.value.data], { type: 'text/html' })
        dataUrl = URL.createObjectURL(blob)
        filename = `composite-${Date.now()}.html`
      } else {
        // 画像の場合はBase64デコード
        dataUrl = `data:image/${format};base64,${compositeResult.value.data}`
        filename = `composite-${Date.now()}.${format}`
      }
      
      const link = document.createElement('a')
      link.href = dataUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      if (format === 'html') {
        URL.revokeObjectURL(dataUrl)
      }
      
      notificationStore.showSuccess('Download started!')
    } catch (error) {
      console.error('Download error:', error)
      notificationStore.showError('Failed to download image')
    }
  }
  
  const loadUploadedImages = async () => {
    appStore.startLoading('Loading uploaded images...')
    
    try {
      const response = await apiService.getUploadedImages()
      uploadedImages.value = response.data || []
    } catch (error: any) {
      appStore.handleApiError(error)
      notificationStore.showError('Failed to load uploaded images')
    } finally {
      appStore.stopLoading()
    }
  }
  
  const uploadImage = async (file: File): Promise<UploadedImage | null> => {
    appStore.startLoading('Uploading image...')
    
    try {
      const response = await apiService.uploadImage(file)
      
      if (response.success && response.data) {
        uploadedImages.value.unshift(response.data)
        notificationStore.showSuccess('Image uploaded successfully!')
        return response.data
      } else {
        notificationStore.showError(response.error || 'Failed to upload image')
        return null
      }
    } catch (error: any) {
      appStore.handleApiError(error)
      notificationStore.showError('Failed to upload image')
      return null
    } finally {
      appStore.stopLoading()
    }
  }
  
  const deleteUploadedImage = async (imageId: string) => {
    try {
      await apiService.deleteUploadedImage(imageId)
      uploadedImages.value = uploadedImages.value.filter(img => img.id !== imageId)
      notificationStore.showSuccess('Image deleted successfully!')
    } catch (error: any) {
      appStore.handleApiError(error)
      notificationStore.showError('Failed to delete image')
    }
  }
  
  const useUploadedImage = (image: UploadedImage, targetIndex: number) => {
    if (targetIndex === 2) {
      if (!hasThirdImage.value) {
        addThirdImage()
      }
      updateThirdImage({ url: image.fullUrl })
    } else {
      updateImageUrl(targetIndex, image.fullUrl)
    }
    notificationStore.showInfo(`Image applied to position ${targetIndex + 1}`)
  }
  
  // プリセット機能
  const applyPreset = (presetName: string) => {
    switch (presetName) {
      case 'default':
        resetToDefaults()
        break
      case 'three-corners':
        images.value[0].position = { x: 50, y: 50 }
        images.value[1].position = { x: 1500, y: 50 }
        addThirdImage()
        if (thirdImage.value) {
          thirdImage.value.position = { x: 800, y: 700 }
        }
        break
      case 'center-focus':
        images.value[0].position = { x: 200, y: 200 }
        images.value[1].position = { x: 1200, y: 200 }
        addThirdImage()
        if (thirdImage.value) {
          thirdImage.value.position = { x: 700, y: 400 }
          thirdImage.value.scale = 1.5
        }
        break
      case 'overlay':
        images.value[0].position = { x: 100, y: 100 }
        images.value[1].position = { x: 150, y: 150 }
        images.value[1].opacity = 0.7
        addThirdImage()
        if (thirdImage.value) {
          thirdImage.value.position = { x: 200, y: 200 }
          thirdImage.value.opacity = 0.5
        }
        break
    }
    notificationStore.showInfo(`Applied preset: ${presetName}`)
  }
  
  return {
    // State
    images,
    thirdImage,
    outputFormat,
    canvasSize,
    compositeResult,
    uploadedImages,
    previewMode,
    
    // Getters
    hasThirdImage,
    isValidRequest,
    requestPayload,
    
    // Actions
    updateImage,
    updateImageUrl,
    updateImagePosition,
    updateImageOpacity,
    updateImageScale,
    updateImageRotation,
    addThirdImage,
    removeThirdImage,
    updateThirdImage,
    setOutputFormat,
    setCanvasSize,
    resetToDefaults,
    generateComposite,
    downloadResult,
    loadUploadedImages,
    uploadImage,
    deleteUploadedImage,
    useUploadedImage,
    applyPreset
  }
})