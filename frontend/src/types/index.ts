// API関連の型定義
export interface ApiConfig {
  keyId: string;
  throttling: {
    rateLimit: number;
    burstLimit: number;
    dailyQuota: number;
  };
  timeout: number;
  retryAttempts: number;
}

export interface UIConfig {
  theme: 'light' | 'dark';
  language: 'ja' | 'en';
  showAdvancedOptions: boolean;
  maxImageSize: number;
  supportedFormats: string[];
}

export interface MonitoringConfig {
  enableCloudWatchLogs: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  enablePerformanceMetrics: boolean;
  enableErrorTracking: boolean;
}

export interface SecurityConfig {
  enableCSP: boolean;
  enableSRI: boolean;
  corsOrigins: string[];
}

export interface DevelopmentConfig {
  enableHotReload: boolean;
  enableSourceMaps: boolean;
  enableConsoleLogging: boolean;
  mockApiResponses: boolean;
}

export interface AppConfig {
  // 基本API設定
  apiUrl: string;
  uploadApiUrl: string;
  cloudfrontUrl: string;
  
  // S3バケット設定
  s3BucketNames: {
    resources: string;
    testImages: string;
    frontend: string;
    upload: string;
  };
  
  // バージョンと環境情報
  version: string;
  environment: 'development' | 'staging' | 'production';
  buildTimestamp: string;
  region: string;
  
  // 機能フラグ
  features: {
    enableS3Upload: boolean;
    enableAdvancedFilters: boolean;
    enable3ImageComposition: boolean;
    enableDebugMode: boolean;
    enableAnalytics: boolean;
    enableCaching: boolean;
    enableErrorReporting: boolean;
  };
  
  // 詳細設定
  api: ApiConfig;
  ui: UIConfig;
  monitoring: MonitoringConfig;
  security: SecurityConfig;
  development: DevelopmentConfig;
}

// 画像合成関連の型定義
export interface ImagePosition {
  x: number;
  y: number;
}

export interface ImageParameters {
  url: string;
  position: ImagePosition;
  opacity?: number;
  scale?: number;
  rotation?: number;
}

export interface CompositeRequest {
  image1: ImageParameters;
  image2: ImageParameters;
  image3?: ImageParameters;
  outputFormat?: 'png' | 'jpeg' | 'html';
  canvasSize?: {
    width: number;
    height: number;
  };
}

export interface CompositeResponse {
  success: boolean;
  data?: string; // Base64エンコードされた画像データ
  error?: string;
  message?: string;
  version?: string;
  processingTime?: number;
}

// アップロード関連の型定義
export interface UploadRequest {
  fileName: string;
  fileType: string;
  fileSize: number;
}

export interface UploadResponse {
  success: boolean;
  uploadUrl?: string;
  fileUrl?: string;
  error?: string;
}

export interface UploadedImage {
  id: string;
  fileName: string;
  fileSize: number;
  uploadDate: string;
  thumbnailUrl?: string;
  fullUrl: string;
}

// UI状態管理の型定義
export interface LoadingState {
  isLoading: boolean;
  message?: string;
  progress?: number;
}

export interface ErrorState {
  hasError: boolean;
  message?: string;
  code?: string;
  details?: any;
}

export interface NotificationState {
  type: 'success' | 'warning' | 'error' | 'info';
  message: string;
  duration?: number;
  id: string;
}

// フォーム関連の型定義
export interface ValidationRule {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  custom?: (value: any) => boolean | string;
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'url' | 'file' | 'select' | 'checkbox';
  value: any;
  rules?: ValidationRule[];
  options?: { label: string; value: any }[];
  placeholder?: string;
  disabled?: boolean;
}

export interface FormState {
  fields: Record<string, FormField>;
  isValid: boolean;
  errors: Record<string, string>;
  touched: Record<string, boolean>;
}

// テーマ関連の型定義
export interface ThemeConfig {
  name: string;
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    background: string;
    surface: string;
    text: string;
  };
  fonts: {
    primary: string;
    secondary: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
}

// ルーティング関連の型定義
export interface RouteConfig {
  path: string;
  name: string;
  component: any;
  meta?: {
    title?: string;
    requiresAuth?: boolean;
    roles?: string[];
  };
}

// API レスポンスの共通型
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  code?: string;
  timestamp?: string;
}

// ページネーション関連の型定義
export interface PaginationConfig {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: PaginationConfig;
}

// 検索・フィルター関連の型定義
export interface SearchConfig {
  query: string;
  filters: Record<string, any>;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// メトリクス・分析関連の型定義
export interface PerformanceMetrics {
  loadTime: number;
  renderTime: number;
  apiResponseTime: number;
  memoryUsage?: number;
  errorCount: number;
}

export interface AnalyticsEvent {
  name: string;
  category: string;
  action: string;
  label?: string;
  value?: number;
  timestamp: string;
  userId?: string;
  sessionId: string;
}