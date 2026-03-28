export interface AssetImage {
  key: string
  filename: string
  size_display: string
  thumbnail_url?: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  mediaUrl?: string
  mediaType?: 'image' | 'video' | 'image_list'
  imageList?: AssetImage[]
  isLoading?: boolean
  modelId?: string
  modelName?: string
}

export interface ModelInfo {
  id: string
  name: string
  provider: string
  description: string
}

export interface ImageConfig {
  source: string
  x: number
  y: number
  width: number
  height: number
}

export interface CompositeCommand {
  baseImage: string
  images: Record<string, ImageConfig>
  imageMode: number
  format: 'png'
  videoEnabled: boolean
  videoDuration: number
  videoFormat: string
}
