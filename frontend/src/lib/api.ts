import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 120000, // 2 min for AI generation
})

// --- Types ---

export interface Article {
  id: number
  title: string
  content: string
  summary: string | null
  tags: string | null
  category: string | null
  cover_image: string | null
  llm_provider: string | null
  llm_model: string | null
  prompt: string | null
  status: string
  created_at: string
  updated_at: string
}

export interface ArticleListResponse {
  items: Article[]
  total: number
  page: number
  page_size: number
}

export interface GenerateRequest {
  topic: string
  style?: string
  language?: string
  length?: string
  provider?: string
  model?: string
  extra_instructions?: string
}

export interface GenerateResponse {
  article: Article
  generation_time: number
}

export interface PublishRequest {
  article_id: number
  platforms: string[]
}

export interface PublishRecord {
  id: number
  article_id: number
  platform: string
  platform_article_id: string | null
  platform_url: string | null
  status: string
  error_message: string | null
  published_at: string | null
  created_at: string
}

export interface LLMProvider {
  name: string
  display_name: string
  models: string[]
  is_configured: boolean
}

export interface Platform {
  name: string
  is_configured: boolean
}

// --- API Calls ---

export const articleApi = {
  list: (page = 1, pageSize = 20, status?: string) =>
    api.get<ArticleListResponse>('/articles', { params: { page, page_size: pageSize, status } }),

  get: (id: number) =>
    api.get<Article>(`/articles/${id}`),

  create: (data: { title: string; content?: string; summary?: string; tags?: string; category?: string }) =>
    api.post<Article>('/articles', data),

  update: (id: number, data: Partial<Article>) =>
    api.put<Article>(`/articles/${id}`, data),

  delete: (id: number) =>
    api.delete(`/articles/${id}`),

  generate: (data: GenerateRequest) =>
    api.post<GenerateResponse>('/articles/generate', data),

  publish: (articleId: number, platforms: string[]) =>
    api.post<PublishRecord[]>(`/articles/${articleId}/publish`, { article_id: articleId, platforms }),

  getPublishRecords: (articleId: number) =>
    api.get<PublishRecord[]>(`/articles/${articleId}/publish-records`),
}

export const configApi = {
  getProviders: () =>
    api.get<LLMProvider[]>('/llm/providers'),

  getPlatforms: () =>
    api.get<Platform[]>('/llm/platforms'),
}

export const healthApi = {
  check: () => api.get('/health'),
}

export default api
