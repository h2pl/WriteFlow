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
  default_model: string | null
}

export interface Platform {
  name: string
  is_configured: boolean
}

// --- API Calls ---

export const articleApi = {
  list: (page = 1, pageSize = 20, status?: string, search?: string) =>
    api.get<ArticleListResponse>('/articles', { params: { page, page_size: pageSize, status, search } }),

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

  generateStream: (data: GenerateRequest, onChunk: (chunk: string) => void, onDone: (article: Article) => void, onError: (error: string) => void) => {
    const controller = new AbortController()
    fetch('/api/articles/generate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({ detail: 'Request failed' }))
        onError(err.detail || 'Request failed')
        return
      }
      const reader = response.body?.getReader()
      if (!reader) { onError('No reader'); return }
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              if (event.type === 'chunk') onChunk(event.content)
              else if (event.type === 'done') onDone(event.article)
              else if (event.type === 'error') onError(event.message)
            } catch {}
          }
        }
      }
    }).catch((err) => {
      if (err.name !== 'AbortError') onError(err.message)
    })
    return controller
  },

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

  getSettings: () =>
    api.get<Record<string, string | null>>('/llm/settings'),

  updateSettings: (data: Record<string, string>) =>
    api.put('/llm/settings', data),

  fetchModels: (provider: string) =>
    api.get<{ provider: string; models: string[] }>(`/llm/models/${provider}`),
}

export const healthApi = {
  check: () => api.get('/health'),
}

export default api
