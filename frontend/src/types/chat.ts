export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  mediaUrl?: string
  mediaType?: 'image' | 'video'
  isLoading?: boolean
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
