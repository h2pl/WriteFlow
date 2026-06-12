import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Send, Copy, Check, Save, Loader2, Pencil,
  CheckCircle2, XCircle, Clock, ExternalLink, AlertCircle, ChevronDown,
  ImageIcon, Sparkles, Search, Upload, RefreshCw, X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { articleApi, configApi } from '@/lib/api'
import type { Article, PublishRecord } from '@/lib/api'

interface Props {
  article: Article
  onBack: () => void
}

/** Pull a human-readable message out of any error shape. */
function extractError(err: unknown, mode: string = ''): string {
  if (!err) return '封面生成失败：未知错误'
  const e = err as any
  // 1) axios shape: { response: { data: { detail } } }
  const detail = e?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  // 2) plain Error with a message
  if (e?.message && typeof e.message === 'string') {
    return `${e.message}${mode ? ` (模式: ${mode})` : ''}`
  }
  // 3) last resort
  try {
    return JSON.stringify(err).slice(0, 300)
  } catch {
    return '封面生成失败'
  }
}

/* ---------- Publish Record Item ---------- */

function PublishRecordItem({ record, label }: { record: PublishRecord; label: string }) {
  const [expanded, setExpanded] = useState(false)
  const isSuccess = record.status === 'success'
  const isPending = record.status === 'pending'
  const isFailed = record.status === 'failed'

  const StatusIcon = isSuccess
    ? CheckCircle2
    : isPending
      ? Loader2
      : XCircle

  const iconColor = isSuccess
    ? 'text-green-600'
    : isPending
      ? 'text-yellow-600'
      : 'text-destructive'

  const statusText = isSuccess ? '发布成功' : isPending ? '发布中...' : '发布失败'
  const timeStr = record.published_at
    ? new Date(record.published_at).toLocaleString('zh-CN')
    : record.created_at
      ? new Date(record.created_at).toLocaleString('zh-CN')
      : null

  const hasDetails = record.error_message || record.platform_url

  return (
    <div className="border-b last:border-b-0">
      <button
        className={`flex items-center gap-2 w-full px-4 py-2.5 text-sm text-left hover:bg-muted/50 transition-colors ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        <StatusIcon className={`h-4 w-4 flex-shrink-0 ${iconColor} ${isPending ? 'animate-spin' : ''}`} />
        <span className="flex-1 font-medium">{label}</span>
        {timeStr && (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {timeStr}
          </span>
        )}
        <span className={`text-xs ${isFailed ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
          {statusText}
        </span>
        {hasDetails && (
          <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        )}
      </button>
      {expanded && hasDetails && (
        <div className="px-4 pb-3 pt-0.5 space-y-1.5">
          {record.error_message && (
            <div className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span className="break-all">{record.error_message}</span>
            </div>
          )}
          {record.platform_url && (
            <a
              href={record.platform_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              查看文章
            </a>
          )}
        </div>
      )}
    </div>
  )
}

/* ---------- Cover Section ---------- */

type CoverMode = 'manual' | 'search' | 'ai'

const COVER_MODES: { value: CoverMode; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { value: 'manual', label: '手动上传', icon: Upload, desc: '从本机选择图片' },
  { value: 'search', label: '自动搜图', icon: Search, desc: '从网上搜索主题相关图' },
  { value: 'ai', label: 'AI 生成', icon: Sparkles, desc: '让 AI 根据标题生成' },
]

function CoverSection({
  article,
  onUpdated,
}: {
  article: Article
  onUpdated: (a: Article) => void
}) {
  const [coverMode, setCoverMode] = useState<CoverMode>((article.cover_mode as CoverMode) || 'search')

  const fetchMutation = useMutation({
    mutationFn: (mode: CoverMode) => articleApi.fetchCover(article.id, mode),
    onSuccess: (res) => {
      onUpdated(res.data)
      setCoverMode(res.data.cover_mode as CoverMode)
    },
  })

  const handleFile = async (file: File) => {
    // Manual mode: encode to data URL, PATCH to server
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = reader.result as string
      const res = await articleApi.update(article.id, { cover_image: dataUrl, cover_mode: 'manual' })
      onUpdated(res.data)
      setCoverMode('manual')
    }
    reader.readAsDataURL(file)
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ImageIcon className="h-4 w-4" />
          封面图片
        </CardTitle>
        <CardDescription>选择封面来源，发布到平台时会自动使用</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Mode selector */}
        <div className="grid grid-cols-3 gap-2">
          {COVER_MODES.map(m => {
            const Icon = m.icon
            const active = coverMode === m.value
            const loading = fetchMutation.isPending && fetchMutation.variables === m.value
            return (
              <button
                key={m.value}
                className={`flex flex-col items-center gap-1 rounded-md border p-2.5 text-center transition-colors ${
                  active
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-input hover:border-primary/50 hover:bg-accent'
                } ${loading ? 'opacity-60' : ''}`}
                onClick={() => {
                  if (m.value === 'manual') {
                    setCoverMode('manual')
                    // Trigger file input click
                    const input = document.getElementById(`cover-file-input-${article.id}`) as HTMLInputElement
                    input?.click()
                  } else {
                    setCoverMode(m.value)
                    fetchMutation.mutate(m.value)
                  }
                }}
                disabled={fetchMutation.isPending && fetchMutation.variables !== m.value}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                <span className="text-xs font-medium">{m.label}</span>
              </button>
            )
          })}
        </div>

        {/* Hidden file input for manual mode */}
        <input
          id={`cover-file-input-${article.id}`}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
            e.target.value = ''
          }}
        />

        {/* Cover preview */}
        {article.cover_image ? (
          <div className="relative group rounded-md overflow-hidden border bg-muted">
            <img
              src={article.cover_image}
              alt="封面"
              className="w-full h-40 object-cover"
            />
            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {coverMode !== 'manual' && (
                <Button
                  size="icon"
                  variant="secondary"
                  className="h-7 w-7"
                  onClick={() => fetchMutation.mutate(coverMode)}
                  disabled={fetchMutation.isPending}
                  title="换一张"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="icon"
                variant="secondary"
                className="h-7 w-7"
                onClick={async () => {
                  const res = await articleApi.update(article.id, { cover_image: null, cover_mode: null })
                  onUpdated(res.data)
                  setCoverMode('search')
                }}
                title="移除封面"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="absolute bottom-2 left-2 text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">
              {coverMode === 'manual' ? '手动上传' : coverMode === 'ai' ? 'AI 生成' : '自动搜图'}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-dashed bg-muted/30 p-6 text-center text-xs text-muted-foreground">
            {fetchMutation.isPending ? (
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {coverMode === 'ai' ? 'AI 正在生成...' : '正在搜索图片...'}
              </div>
            ) : (
              <>暂无封面，选择上方模式添加</>
            )}
          </div>
        )}

        {fetchMutation.isError && (
          <div className="flex items-start gap-1.5 text-xs text-destructive bg-destructive/10 rounded-md p-2">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
            <span className="break-all leading-relaxed flex-1">{extractError(fetchMutation.error, coverMode)}</span>
            <button
              className="text-primary hover:underline flex-shrink-0"
              onClick={() => {
                if (coverMode === 'manual') {
                  const input = document.getElementById(`cover-file-input-${article.id}`) as HTMLInputElement
                  input?.click()
                } else {
                  fetchMutation.mutate(coverMode)
                }
              }}
            >
              重试
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ---------- Main Component ---------- */

export default function ArticleDetail({ article: initialArticle, onBack }: Props) {
  const queryClient = useQueryClient()
  const [article, setArticle] = useState<Article>(initialArticle)
  const [isEditing, setIsEditing] = useState(false)
  const [draftTitle, setDraftTitle] = useState(initialArticle.title)
  const [draftContent, setDraftContent] = useState(initialArticle.content)
  const [copied, setCopied] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])

  useEffect(() => {
    setArticle(initialArticle)
    setDraftTitle(initialArticle.title)
    setDraftContent(initialArticle.content)
    setIsEditing(false)
  }, [initialArticle])

  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: () => configApi.getPlatforms().then(r => r.data),
  })

  const { data: publishRecords, refetch: refetchRecords } = useQuery({
    queryKey: ['publish-records', article.id],
    queryFn: () => articleApi.getPublishRecords(article.id).then(r => r.data),
    refetchInterval: (query) => {
      const records = query.state.data
      if (!records) return false
      const hasPending = records.some(r => r.status === 'pending')
      return hasPending ? 2000 : false
    },
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      articleApi.update(article.id, { title: draftTitle, content: draftContent }),
    onSuccess: (res) => {
      setArticle(res.data)
      setIsEditing(false)
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
  })

  const publishMutation = useMutation({
    mutationFn: () => articleApi.publish(article.id, selectedPlatforms),
    onSuccess: () => {
      refetchRecords()
      queryClient.invalidateQueries({ queryKey: ['article', article.id] })
      setSelectedPlatforms([])
    },
  })

  const handleCopy = () => {
    navigator.clipboard.writeText(article.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const enterEdit = () => {
    setDraftTitle(article.title)
    setDraftContent(article.content)
    setIsEditing(true)
  }

  const cancelEdit = () => {
    setDraftTitle(article.title)
    setDraftContent(article.content)
    setIsEditing(false)
  }

  const hasChanges = draftTitle !== article.title || draftContent !== article.content

  const togglePlatform = (name: string) => {
    setSelectedPlatforms(prev =>
      prev.includes(name) ? prev.filter(p => p !== name) : [...prev, name]
    )
  }

  const platformLabels: Record<string, string> = {
    wechat: '微信公众号',
    juejin: '掘金',
    csdn: 'CSDN',
    zhihu: '知乎',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 flex items-center gap-3 text-sm text-muted-foreground">
          {article.llm_provider && (
            <span>{article.llm_provider}/{article.llm_model}</span>
          )}
          <span>·</span>
          <span>创建于 {new Date(article.created_at).toLocaleString('zh-CN')}</span>
          {article.cover_image && <span>·</span>}
          {article.cover_image && <span className="text-primary">已设置封面</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? '已复制' : '复制全文'}
          </Button>
          {!isEditing ? (
            <Button variant="outline" size="sm" onClick={enterEdit}>
              <Pencil className="h-3.5 w-3.5" />
              编辑文章
            </Button>
          ) : (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelEdit}
                disabled={saveMutation.isPending}
              >
                取消
              </Button>
              <Button
                size="sm"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending || !hasChanges}
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                保存
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Title */}
      {isEditing ? (
        <Input
          value={draftTitle}
          onChange={e => setDraftTitle(e.target.value)}
          placeholder="文章标题..."
          className="text-2xl font-bold h-12 border-none shadow-none focus-visible:ring-1 px-3 -ml-3"
        />
      ) : (
        <h1 className="text-3xl font-bold tracking-tight leading-tight">
          {article.title || '（无标题）'}
        </h1>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Content */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">正文</CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-0">
            {isEditing ? (
              <Textarea
                value={draftContent}
                onChange={e => setDraftContent(e.target.value)}
                rows={25}
                className="font-mono text-sm"
              />
            ) : article.content ? (
              <div className="prose prose-neutral max-w-none dark:prose-invert">
                <ReactMarkdown>{article.content}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                （暂无正文，点击右上角"编辑文章"开始撰写）
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Cover */}
          <CoverSection
            article={article}
            onUpdated={updated => {
              setArticle(updated)
              queryClient.invalidateQueries({ queryKey: ['articles'] })
            }}
          />

          {/* Publish */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Send className="h-4 w-4" />
                发布
              </CardTitle>
              <CardDescription>选择要发布的平台</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {platforms?.map(p => (
                <label
                  key={p.name}
                  className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                    selectedPlatforms.includes(p.name) ? 'border-primary bg-primary/5' : 'hover:bg-accent'
                  } ${!p.is_configured ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.includes(p.name)}
                    onChange={() => p.is_configured && togglePlatform(p.name)}
                    disabled={!p.is_configured}
                    className="rounded"
                  />
                  <span className="text-sm font-medium">{platformLabels[p.name] || p.name}</span>
                  {!p.is_configured && (
                    <span className="ml-auto text-xs text-muted-foreground">未配置</span>
                  )}
                </label>
              ))}

              <Button
                className="w-full mt-2"
                disabled={selectedPlatforms.length === 0 || publishMutation.isPending}
                onClick={() => publishMutation.mutate()}
              >
                {publishMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    发布中...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    发布到 {selectedPlatforms.length} 个平台
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Publish Records */}
          {publishRecords && publishRecords.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">发布记录</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 p-0">
                {publishRecords.map(record => (
                  <PublishRecordItem
                    key={record.id}
                    record={record}
                    label={platformLabels[record.platform] || record.platform}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
