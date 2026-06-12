import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import ArticleDetail from '@/components/ArticleDetail'
import { articleApi } from '@/lib/api'

export default function ArticleDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const articleId = Number(id)

  const { data: article, isLoading, error } = useQuery({
    queryKey: ['article', articleId],
    queryFn: () => articleApi.get(articleId).then(r => r.data),
    enabled: !!articleId,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mr-3" />
        加载中...
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <p className="text-lg mb-4">文章不存在</p>
        <button
          className="text-primary hover:underline"
          onClick={() => navigate('/articles')}
        >
          返回文章列表
        </button>
      </div>
    )
  }

  return (
    <ArticleDetail
      article={article}
      onBack={() => {
        queryClient.invalidateQueries({ queryKey: ['articles'] })
        navigate('/articles')
      }}
    />
  )
}
