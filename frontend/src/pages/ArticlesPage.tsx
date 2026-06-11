import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Trash2, Eye, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { articleApi } from '@/lib/api'
import type { Article } from '@/lib/api'
import ArticleDetail from '@/components/ArticleDetail'

const statusMap: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'success' | 'destructive' | 'warning' }> = {
  draft: { label: '草稿', variant: 'secondary' },
  generated: { label: '已生成', variant: 'outline' },
  reviewing: { label: '审核中', variant: 'warning' },
  approved: { label: '已审核', variant: 'success' },
  publishing: { label: '发布中', variant: 'warning' },
  published: { label: '已发布', variant: 'success' },
  failed: { label: '失败', variant: 'destructive' },
}

export default function ArticlesPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['articles', page, statusFilter],
    queryFn: () => articleApi.list(page, 20, statusFilter || undefined).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => articleApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      if (selectedArticle) setSelectedArticle(null)
    },
  })

  if (selectedArticle) {
    return (
      <ArticleDetail
        article={selectedArticle}
        onBack={() => {
          setSelectedArticle(null)
          queryClient.invalidateQueries({ queryKey: ['articles'] })
        }}
      />
    )
  }

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">文章管理</h1>
          <p className="text-muted-foreground mt-1">
            共 {data?.total ?? 0} 篇文章
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
            className="w-36"
          >
            <option value="">全部状态</option>
            <option value="draft">草稿</option>
            <option value="generated">已生成</option>
            <option value="published">已发布</option>
            <option value="failed">失败</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          加载中...
        </div>
      ) : !data?.items.length ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <FileText className="h-12 w-12 mb-4 opacity-20" />
            <p>暂无文章</p>
            <p className="text-xs mt-1">前往"AI 创作"页面生成第一篇文章吧</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map(article => {
            const status = statusMap[article.status] || { label: article.status, variant: 'outline' as const }
            return (
              <Card key={article.id} className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate">{article.title}</h3>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {article.llm_provider && (
                        <span>{article.llm_provider}/{article.llm_model}</span>
                      )}
                      <span>{new Date(article.created_at).toLocaleString('zh-CN')}</span>
                      {article.tags && <span>{article.tags}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-4">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="查看"
                      onClick={() => setSelectedArticle(article)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="删除"
                      onClick={() => {
                        if (confirm('确定删除这篇文章？')) {
                          deleteMutation.mutate(article.id)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4" />
                上一页
              </Button>
              <span className="text-sm text-muted-foreground px-3">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                下一页
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
