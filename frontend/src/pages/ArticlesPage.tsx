import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Trash2, ChevronLeft, ChevronRight, Search, CheckSquare, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { articleApi } from '@/lib/api'

export default function ArticlesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  const { data, isLoading } = useQuery({
    queryKey: ['articles', page, searchQuery],
    queryFn: () => articleApi.list(page, 20, undefined, searchQuery || undefined).then(r => r.data),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => articleApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
    },
  })

  const batchDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => articleApi.batchDelete(ids),
    onSuccess: (res) => {
      setSelectedIds(new Set())
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      if (res.data.missing.length > 0) {
        alert(`已删除 ${res.data.deleted} 篇，${res.data.missing.length} 篇未找到`)
      }
    },
  })

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!data?.items) return
    setSelectedIds(prev => {
      if (data.items.every(a => prev.has(a.id))) {
        return new Set()
      }
      return new Set(data.items.map(a => a.id))
    })
  }

  const allSelected = data?.items?.length > 0 && data.items.every(a => selectedIds.has(a.id))
  const someSelected = !allSelected && data?.items?.some(a => selectedIds.has(a.id))

  const totalPages = data ? Math.ceil(data.total / data.page_size) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">文章管理</h1>
          <p className="text-muted-foreground mt-1">
            共 {data?.total ?? 0} 篇文章
            {selectedIds.size > 0 && <span className="ml-2 text-primary">· 已选 {selectedIds.size} 篇</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="搜索文章..."
              value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setPage(1) }}
              className="w-64 pl-9"
            />
          </div>
        </div>
      </div>

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm">
            已选中 <span className="font-semibold text-primary">{selectedIds.size}</span> 篇
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              取消选择
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={batchDeleteMutation.isPending}
              onClick={() => {
                if (confirm(`确定删除选中的 ${selectedIds.size} 篇文章？`)) {
                  batchDeleteMutation.mutate(Array.from(selectedIds))
                }
              }}
            >
              <Trash2 className="h-4 w-4" />
              批量删除
            </Button>
          </div>
        </div>
      )}

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
          {/* Select-all header */}
          {data.items.length > 0 && (
            <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-muted-foreground">
              <button
                className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                onClick={toggleSelectAll}
                title={allSelected ? '取消全选' : '全选'}
              >
                {allSelected ? (
                  <CheckSquare className="h-4 w-4 text-primary" />
                ) : someSelected ? (
                  <CheckSquare className="h-4 w-4 text-primary/50" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                {allSelected ? '已全选' : someSelected ? '部分选中' : '全选'}
              </button>
            </div>
          )}

          {data.items.map(article => {
            const isSelected = selectedIds.has(article.id)
            return (
              <Card
                key={article.id}
                className={`hover:shadow-md hover:border-primary/40 transition-all group ${
                  isSelected ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <CardContent className="flex items-center gap-3 p-4">
                  {/* Checkbox */}
                  <button
                    className="flex-shrink-0 p-1 -ml-1 rounded hover:bg-muted"
                    onClick={e => {
                      e.stopPropagation()
                      toggleSelect(article.id)
                    }}
                    title={isSelected ? '取消选择' : '选择'}
                  >
                    {isSelected ? (
                      <CheckSquare className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                    )}
                  </button>

                  {/* Clickable area */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/articles/${article.id}`)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        navigate(`/articles/${article.id}`)
                      }
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium truncate group-hover:text-primary transition-colors">
                        {article.title}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {article.llm_provider && (
                        <span>{article.llm_provider}/{article.llm_model}</span>
                      )}
                      <span>{new Date(article.created_at).toLocaleString('zh-CN')}</span>
                      {article.tags && <span>{article.tags}</span>}
                    </div>
                  </div>

                  {/* Always-visible delete button */}
                  <Button
                    variant="outline"
                    size="icon"
                    title="删除"
                    onClick={e => {
                      e.stopPropagation()
                      if (confirm('确定删除这篇文章？')) {
                        deleteMutation.mutate(article.id)
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
