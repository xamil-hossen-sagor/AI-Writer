export enum ContentType {
  TRENDS = 'TRENDS',
  ARTICLE = 'ARTICLE',
  IMAGES = 'IMAGES',
  VIDEO = 'VIDEO',
  VOICE = 'VOICE'
}

export interface TrendItem {
  topic: string;
  volume: string;
  description: string;
}

export interface ArticleData {
  title: string;
  content: string;
  seoScore?: number;
  keywords?: string[];
}

export interface GeneratedImage {
  url: string;
  prompt: string;
}

export interface ChatMessage {
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: number;
}
