import { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, Loader2, Copy, Check, Square, Cpu } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { articleApi, configApi } from '@/lib/api'
import type { GenerateRequest, Article } from '@/lib/api'

export default function GeneratePage() {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [generatedArticle, setGeneratedArticle] = useState<Article | null>(null)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [form, setForm] = useState<GenerateRequest>({
    topic: '',
    style: 'tech_blog',
    language: 'zh',
    length: 'medium',
    provider: '',
    extra_instructions: '',
  })

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => configApi.getProviders().then(r => r.data),
  })

  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => configApi.getSettings().then(r => r.data),
  })

  // Auto-select the configured default provider + its default model
  useEffect(() => {
    if (providers && settings && !form.provider) {
      const defaultProviderName = settings.DEFAULT_LLM_PROVIDER || ''
      // Prefer the configured default provider, otherwise first configured
      const target = providers.find(p => p.name === defaultProviderName && p.is_configured && p.models.length > 0)
        || providers.find(p => p.is_configured && p.models.length > 0)
      if (target) {
        const model = target.default_model && target.models.includes(target.default_model)
          ? target.default_model
          : target.models[0]
        setForm(f => ({ ...f, provider: target.name, model }))
      }
    }
  }, [providers, settings])

  const configuredProviders = providers?.filter(p => p.is_configured) || []

  // Parse "provider:model" value from dropdown
  const handleModelSelect = (value: string) => {
    const sepIdx = value.indexOf(':')
    if (sepIdx === -1) return
    const provider = value.slice(0, sepIdx)
    const model = value.slice(sepIdx + 1)
    setForm(f => ({ ...f, provider, model }))
  }

  const currentValue = form.provider && form.model ? `${form.provider}:${form.model}` : ''

  const handleGenerate = () => {
    if (!form.topic.trim()) return
    const req = { ...form }
    if (!req.provider) delete req.provider
    if (!req.model) delete req.model
    if (!req.extra_instructions) delete req.extra_instructions

    setStreaming(true)
    setStreamContent('')
    setGeneratedArticle(null)
    setError(null)

    abortRef.current = articleApi.generateStream(
      req,
      (chunk) => setStreamContent(prev => prev + chunk),
      (article) => {
        setGeneratedArticle(article)
        setStreaming(false)
      },
      (errMsg) => {
        setError(errMsg)
        setStreaming(false)
      },
    )
  }

  const handleStop = useCallback(() => {
    abortRef.current?.abort()
    setStreaming(false)
  }, [])

  const handleCopy = () => {
    const content = generatedArticle?.content || streamContent
    if (content) {
      navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const displayContent = generatedArticle?.content || streamContent

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">AI 创作</h1>
        <p className="text-muted-foreground mt-1">输入主题，AI 自动生成高质量文章</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Form */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              创作设置
            </CardTitle>
            <CardDescription>配置 AI 写作参数</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">写作主题 *</label>
              <Textarea
                placeholder="例如：如何用 Python 实现一个简单的 Web 爬虫"
                value={form.topic}
                onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                rows={3}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">写作风格</label>
              <Select
                value={form.style}
                onChange={e => setForm(f => ({ ...f, style: e.target.value }))}
              >
                <option value="tech_blog">技术博客</option>
                <option value="tutorial">教程</option>
                <option value="opinion">观点评论</option>
                <option value="news">科技新闻</option>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium mb-1.5 block">语言</label>
                <Select
                  value={form.language}
                  onChange={e => setForm(f => ({ ...f, language: e.target.value }))}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">长度</label>
                <Select
                  value={form.length}
                  onChange={e => setForm(f => ({ ...f, length: e.target.value }))}
                >
                  <option value="short">短 (800-1500字)</option>
                  <option value="medium">中 (1500-3000字)</option>
                  <option value="long">长 (3000-5000字)</option>
                </Select>
              </div>
            </div>

            {/* Model Selection - Two-level dropdown */}
            <div>
              <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                AI 模型
              </label>
              {configuredProviders.length > 0 ? (
                <Select
                  value={currentValue}
                  onChange={e => handleModelSelect(e.target.value)}
                >
                  {configuredProviders.map(p => (
                    <optgroup key={p.name} label={p.display_name}>
                      {p.models.map(m => (
                        <option key={`${p.name}:${m}`} value={`${p.name}:${m}`}>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground py-2">请先在配置页面添加 AI 模型</p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">额外指令</label>
              <Textarea
                placeholder="可选：补充写作要求..."
                value={form.extra_instructions || ''}
                onChange={e => setForm(f => ({ ...f, extra_instructions: e.target.value }))}
                rows={2}
              />
            </div>

            <Button
              className="w-full"
              onClick={streaming ? handleStop : handleGenerate}
              disabled={!streaming && !form.topic.trim()}
            >
              {streaming ? (
                <>
                  <Square className="h-4 w-4" />
                  停止生成
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  开始生成
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Right: Result */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>
                  {generatedArticle ? generatedArticle.title : '生成结果'}
                </CardTitle>
                {generatedArticle && (
                  <CardDescription className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary">{generatedArticle.llm_provider}</Badge>
                    <Badge variant="outline">{generatedArticle.llm_model}</Badge>
                  </CardDescription>
                )}
              </div>
              {(generatedArticle || streamContent) && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? '已复制' : '复制'}
                  </Button>
                  {generatedArticle && (
                    <Button size="sm" onClick={() => navigate(`/articles/${generatedArticle.id}`)}>
                      查看详情
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {streaming && !streamContent && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4" />
                <p>AI 正在创作中，请稍候...</p>
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                生成失败：{error}
              </div>
            )}
            {displayContent && (
              <div className="prose prose-neutral max-w-none dark:prose-invert">
                <ReactMarkdown>{displayContent}</ReactMarkdown>
              </div>
            )}
            {!displayContent && !streaming && !error && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Sparkles className="h-12 w-12 mb-4 opacity-20" />
                <p>输入主题后点击“开始生成”</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
