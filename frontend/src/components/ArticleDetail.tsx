import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Send, Copy, Check, Save, Loader2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { articleApi, configApi } from '@/lib/api'
import type { Article } from '@/lib/api'

interface Props {
  article: Article
  onBack: () => void
}

export default function ArticleDetail({ article: initialArticle, onBack }: Props) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState(initialArticle.content)
  const [editTitle, setEditTitle] = useState(initialArticle.title)
  const [copied, setCopied] = useState(false)
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([])

  const { data: article } = useQuery({
    queryKey: ['article', initialArticle.id],
    queryFn: () => articleApi.get(initialArticle.id).then(r => r.data),
    initialData: initialArticle,
  })

  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: () => configApi.getPlatforms().then(r => r.data),
  })

  const { data: publishRecords, refetch: refetchRecords } = useQuery({
    queryKey: ['publish-records', article.id],
    queryFn: () => articleApi.getPublishRecords(article.id).then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: () => articleApi.update(article.id, { title: editTitle, content: editContent }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['article', article.id] })
      setEditing(false)
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
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">{article.title}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
            {article.llm_provider && (
              <Badge variant="secondary">{article.llm_provider}/{article.llm_model}</Badge>
            )}
            <span>{new Date(article.created_at).toLocaleString('zh-CN')}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? '已复制' : '复制'}
          </Button>
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditing(false)}>取消</Button>
              <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                保存
              </Button>
            </>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>编辑</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Content */}
        <Card className="lg:col-span-2">
          <CardContent className="p-6">
            {editing ? (
              <div className="space-y-3">
                <Input
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="标题"
                  className="text-lg font-bold"
                />
                <Textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={25}
                  className="font-mono text-sm"
                />
              </div>
            ) : (
              <div className="prose prose-neutral max-w-none dark:prose-invert">
                <ReactMarkdown>{article.content}</ReactMarkdown>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Sidebar: Publish */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
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
                    <Badge variant="outline" className="ml-auto text-xs">未配置</Badge>
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
              <CardContent className="space-y-2">
                {publishRecords.map(record => (
                  <div key={record.id} className="flex items-center justify-between text-sm">
                    <span>{platformLabels[record.platform] || record.platform}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={record.status === 'success' ? 'success' : 'destructive'}>
                        {record.status === 'success' ? '成功' : '失败'}
                      </Badge>
                      {record.platform_url && (
                        <a
                          href={record.platform_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline text-xs"
                        >
                          查看
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
