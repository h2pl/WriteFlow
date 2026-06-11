import { useQuery } from '@tanstack/react-query'
import { CheckCircle, XCircle, Bot, Globe } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { configApi } from '@/lib/api'

export default function SettingsPage() {
  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => configApi.getProviders().then(r => r.data),
  })

  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: () => configApi.getPlatforms().then(r => r.data),
  })

  const platformLabels: Record<string, { name: string; desc: string }> = {
    wechat: { name: '微信公众号', desc: '需要配置 WECHAT_APP_ID 和 WECHAT_APP_SECRET' },
    juejin: { name: '掘金', desc: '需要配置 JUEJIN_COOKIE' },
    csdn: { name: 'CSDN', desc: '需要配置 CSDN_COOKIE' },
    zhihu: { name: '知乎', desc: '需要配置 ZHIHU_COOKIE' },
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">配置</h1>
        <p className="text-muted-foreground mt-1">查看 AI 模型和发布平台的配置状态</p>
      </div>

      {/* LLM Providers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            AI 模型
          </CardTitle>
          <CardDescription>
            在后端 <code className="bg-muted px-1.5 py-0.5 rounded text-xs">.env</code> 文件中配置 API Key
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {providers?.map(provider => (
              <div
                key={provider.name}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-3">
                  {provider.is_configured ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium">{provider.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      可用模型：{provider.models.join(', ')}
                    </p>
                  </div>
                </div>
                <Badge variant={provider.is_configured ? 'success' : 'outline'}>
                  {provider.is_configured ? '已配置' : '未配置'}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Publishing Platforms */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            发布平台
          </CardTitle>
          <CardDescription>
            在后端 <code className="bg-muted px-1.5 py-0.5 rounded text-xs">.env</code> 文件中配置平台凭证
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {platforms?.map(platform => {
              const info = platformLabels[platform.name] || { name: platform.name, desc: '' }
              return (
                <div
                  key={platform.name}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    {platform.is_configured ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                    )}
                    <div>
                      <p className="font-medium">{info.name}</p>
                      <p className="text-xs text-muted-foreground">{info.desc}</p>
                    </div>
                  </div>
                  <Badge variant={platform.is_configured ? 'success' : 'outline'}>
                    {platform.is_configured ? '已配置' : '未配置'}
                  </Badge>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Help */}
      <Card>
        <CardHeader>
          <CardTitle>配置说明</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-sm max-w-none dark:prose-invert">
          <ol className="text-sm space-y-2">
            <li>复制 <code>.env.example</code> 为 <code>.env</code></li>
            <li>填入对应的 API Key / Cookie</li>
            <li>重启后端服务使配置生效</li>
          </ol>
          <div className="mt-4 rounded-lg bg-muted p-4 text-sm">
            <p className="font-medium mb-2">MCP 集成</p>
            <p className="text-muted-foreground">
              WriteFlow 同时提供 MCP 协议支持，可在 Agent 配置中添加：
            </p>
            <pre className="mt-2 text-xs bg-background p-3 rounded">
{`{
  "mcpServers": {
    "writeflow": {
      "command": "python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "/path/to/WriteFlow/backend"
    }
  }
}`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
