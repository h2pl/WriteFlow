import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Sparkles, Loader2, Copy, Check } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select } from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { articleApi, configApi } from '@/lib/api'
import type { GenerateRequest } from '@/lib/api'

export default function GeneratePage() {
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
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

  const generateMutation = useMutation({
    mutationFn: (data: GenerateRequest) => articleApi.generate(data).then(r => r.data),
  })

  const result = generateMutation.data

  const handleGenerate = () => {
    if (!form.topic.trim()) return
    const req = { ...form }
    if (!req.provider) delete req.provider
    if (!req.extra_instructions) delete req.extra_instructions
    generateMutation.mutate(req)
  }

  const handleCopy = () => {
    if (result?.article.content) {
      navigator.clipboard.writeText(result.article.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

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

            <div>
              <label className="text-sm font-medium mb-1.5 block">AI 模型</label>
              <Select
                value={form.provider || ''}
                onChange={e => setForm(f => ({ ...f, provider: e.target.value }))}
              >
                <option value="">默认</option>
                {providers?.filter(p => p.is_configured).map(p => (
                  <option key={p.name} value={p.name}>{p.display_name}</option>
                ))}
              </Select>
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
              onClick={handleGenerate}
              disabled={!form.topic.trim() || generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  生成中...
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
                  {result ? result.article.title : '生成结果'}
                </CardTitle>
                {result && (
                  <CardDescription className="mt-1 flex items-center gap-2">
                    <Badge variant="secondary">{result.article.llm_provider}</Badge>
                    <Badge variant="outline">{result.article.llm_model}</Badge>
                    <span>耗时 {result.generation_time.toFixed(1)}s</span>
                  </CardDescription>
                )}
              </div>
              {result && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? '已复制' : '复制'}
                  </Button>
                  <Button size="sm" onClick={() => navigate(`/articles/${result.article.id}`)}>
                    查看详情
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {generateMutation.isPending && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4" />
                <p>AI 正在创作中，请稍候...</p>
                <p className="text-xs mt-1">通常需要 10-30 秒</p>
              </div>
            )}
            {generateMutation.isError && (
              <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                生成失败：{(generateMutation.error as Error).message}
              </div>
            )}
            {result && (
              <div className="prose prose-neutral max-w-none dark:prose-invert">
                <ReactMarkdown>{result.article.content}</ReactMarkdown>
              </div>
            )}
            {!result && !generateMutation.isPending && !generateMutation.isError && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Sparkles className="h-12 w-12 mb-4 opacity-20" />
                <p>输入主题后点击"开始生成"</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
