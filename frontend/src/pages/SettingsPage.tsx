import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Bot, Globe, Save, Loader2, Eye, EyeOff, RotateCcw, Check,
  AlertTriangle, Key, Link, FileText, Share2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { configApi, type Platform } from '@/lib/api'

/* ---------- types ---------- */

interface FieldDef {
  key: string
  label: string
  type: 'text' | 'password' | 'textarea' | 'model-select'
  icon: typeof Key | typeof Link | typeof FileText
  placeholder: string
  description?: string
  /** For model-select fields: which provider's model list to use */
  providerName?: string
}

interface SectionDef {
  id: string
  title: string
  description: string
  icon: typeof Bot | typeof Globe
  fields: FieldDef[]
  accent: string
}

/* ---------- section definitions ---------- */

const sections: SectionDef[] = [
  {
    id: 'openai',
    title: 'OpenAI',
    description: '配置 OpenAI API 密钥和模型参数',
    icon: Bot,
    accent: 'text-emerald-600',
    fields: [
      { key: 'OPENAI_API_KEY', label: 'API Key', type: 'password', icon: Key, placeholder: 'sk-...' },
      { key: 'OPENAI_BASE_URL', label: 'Base URL', type: 'text', icon: Link, placeholder: 'https://api.openai.com/v1', description: '留空使用默认地址' },
      { key: 'OPENAI_MODEL', label: '默认模型', type: 'model-select', icon: FileText, placeholder: 'gpt-4.1', providerName: 'openai' },
    ],
  },
  {
    id: 'anthropic',
    title: 'Anthropic',
    description: '配置 Anthropic Claude API',
    icon: Bot,
    accent: 'text-orange-600',
    fields: [
      { key: 'ANTHROPIC_API_KEY', label: 'API Key', type: 'password', icon: Key, placeholder: 'sk-ant-...' },
      { key: 'ANTHROPIC_MODEL', label: '默认模型', type: 'model-select', icon: FileText, placeholder: 'claude-sonnet-4-6', providerName: 'anthropic' },
    ],
  },
  {
    id: 'deepseek',
    title: 'DeepSeek',
    description: '配置 DeepSeek API',
    icon: Bot,
    accent: 'text-blue-600',
    fields: [
      { key: 'DEEPSEEK_API_KEY', label: 'API Key', type: 'password', icon: Key, placeholder: 'sk-...' },
      { key: 'DEEPSEEK_BASE_URL', label: 'Base URL', type: 'text', icon: Link, placeholder: 'https://api.deepseek.com' },
      { key: 'DEEPSEEK_MODEL', label: '默认模型', type: 'model-select', icon: FileText, placeholder: 'deepseek-chat', providerName: 'deepseek' },
    ],
  },
]

/* ---------- component ---------- */

export default function SettingsPage() {
  const queryClient = useQueryClient()
  const [dirtyFields, setDirtyFields] = useState<Record<string, string>>({})
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({})
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    // Auto-expand unconfigured sections
    const initial = new Set<string>()
    sections.forEach(s => {
      if (s.id === 'openai' || s.id === 'deepseek') initial.add(s.id)
    })
    return initial
  })
  const [defaultProvider, setDefaultProvider] = useState('openai')

  const { data: providers } = useQuery({
    queryKey: ['providers'],
    queryFn: () => configApi.getProviders().then(r => r.data),
  })

  const { data: platforms } = useQuery({
    queryKey: ['platforms'],
    queryFn: () => configApi.getPlatforms().then(r => r.data),
  })

  const { data: savedSettings } = useQuery({
    queryKey: ['settings'],
    queryFn: () => configApi.getSettings().then(r => r.data),
  })

  // Sync default provider from saved settings
  useEffect(() => {
    if (savedSettings?.DEFAULT_LLM_PROVIDER) {
      setDefaultProvider(savedSettings.DEFAULT_LLM_PROVIDER)
    }
  }, [savedSettings])

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => configApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['providers'] })
      queryClient.invalidateQueries({ queryKey: ['platforms'] })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
      setDirtyFields({})
    },
  })

  const handleChange = (key: string, value: string) => {
    setDirtyFields(prev => {
      if (value === '') {
        const next = { ...prev }
        delete next[key]
        return next
      }
      return { ...prev, [key]: value }
    })
  }

  const handleReset = (key: string) => {
    setDirtyFields(prev => {
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const togglePassword = (key: string) => {
    setShowPasswords(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSave = () => {
    const updates: Record<string, string> = {}
    for (const [key, value] of Object.entries(dirtyFields)) {
      const trimmed = value.trim()
      if (trimmed) updates[key] = trimmed
    }
    if (defaultProvider !== savedSettings?.DEFAULT_LLM_PROVIDER) {
      updates.DEFAULT_LLM_PROVIDER = defaultProvider
    }
    if (Object.keys(updates).length > 0) {
      saveMutation.mutate(updates)
    }
  }

  const hasChanges = Object.keys(dirtyFields).length > 0 || defaultProvider !== savedSettings?.DEFAULT_LLM_PROVIDER

  // Check if a section has configured fields
  const getSectionStatus = (sectionId: string) => {
    const provider = providers?.find(p => p.name === sectionId)
    if (provider?.is_configured) return 'configured'
    return 'empty'
  }

  const configuredProviders = providers?.filter(p => p.is_configured) || []

  // Platform-specific accent colors
  const platformAccents: Record<string, string> = {
    wechat: 'text-green-600',
    juejin: 'text-blue-600',
    csdn: 'text-red-600',
    zhihu: 'text-sky-600',
  }

  const renderPlatformCard = (platform: Platform) => {
    const isExpanded = expandedSections.has(`platform-${platform.name}`)
    const accent = platformAccents[platform.name] || 'text-violet-600'

    return (
      <Card key={platform.name}>
        <CardHeader
          className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
          onClick={() => toggleSection(`platform-${platform.name}`)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`rounded-lg bg-muted p-2 ${accent}`}>
                <Share2 className="h-4 w-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{platform.display_name}</CardTitle>
                  {platform.is_configured ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                      <Check className="h-3 w-3" /> 已配置
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                      未配置
                    </span>
                  )}
                </div>
                <CardDescription className="mt-0.5">
                  {platform.config_fields.length === 1 ? 'Cookie 认证' : 'App ID + Secret 认证'}
                </CardDescription>
              </div>
            </div>
            <button className="text-muted-foreground p-1">
              <svg
                className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </CardHeader>

        {isExpanded && (
          <CardContent className="pt-0">
            <div className="space-y-4">
              {platform.config_fields.map(field => {
                const isDirty = field.key in dirtyFields
                const currentValue = isDirty ? dirtyFields[field.key] : ''
                const savedValue = savedSettings?.[field.key]
                const isPassword = field.type === 'password'
                const showPw = showPasswords[field.key]

                return (
                  <div key={field.key} className="space-y-1.5">
                    <label className="flex items-center gap-1.5 text-sm font-medium">
                      <Key className="h-3.5 w-3.5 text-muted-foreground" />
                      {field.label}
                      {isDirty && (
                        <span className="text-xs text-amber-600 font-normal">(未保存)</span>
                      )}
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={isPassword && !showPw ? 'password' : 'text'}
                          placeholder={savedValue || field.placeholder}
                          value={currentValue}
                          onChange={e => handleChange(field.key, e.target.value)}
                          className={isDirty ? 'border-amber-400 focus-visible:ring-amber-400' : ''}
                        />
                        {isPassword && (
                          <button
                            type="button"
                            onClick={() => togglePassword(field.key)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          >
                            {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                      {isDirty && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 flex-shrink-0"
                          onClick={() => handleReset(field.key)}
                          title="撤销修改"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    {field.description && (
                      <p className="text-xs text-muted-foreground">{field.description}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        )}
      </Card>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">配置</h1>
          <p className="text-muted-foreground mt-1">管理 AI 模型和发布平台配置</p>
        </div>
        {hasChanges && (
          <Button onClick={handleSave} disabled={saveMutation.isPending} className="shadow-sm">
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <Save className="h-4 w-4 mr-1.5" />
            )}
            保存更改
          </Button>
        )}
      </div>

      {/* Save feedback */}
      {saveMutation.isSuccess && (
        <div className="flex items-center gap-2 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-700">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>配置已保存并立即生效。如需持久化请同步更新 <code className="bg-green-500/10 px-1 rounded text-xs">.env</code> 文件。</span>
        </div>
      )}
      {saveMutation.isError && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>保存失败：{(saveMutation.error as Error).message}</span>
        </div>
      )}

      {/* Default Provider Selector */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">默认模型</CardTitle>
          <CardDescription>选择创作页面默认使用的 AI 模型提供商</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={defaultProvider}
            onChange={e => setDefaultProvider(e.target.value)}
            className="max-w-xs"
          >
            {configuredProviders.length > 0 ? (
              configuredProviders.map(p => (
                <option key={p.name} value={p.name}>{p.display_name}</option>
              ))
            ) : (
              <option value="">请先配置至少一个模型提供商</option>
            )}
          </Select>
        </CardContent>
      </Card>

      {/* LLM Provider Sections */}
      {sections.map(section => {
        const isExpanded = expandedSections.has(section.id)
        const status = getSectionStatus(section.id)
        const Icon = section.icon

        return (
          <Card key={section.id}>
            <CardHeader
              className="cursor-pointer select-none hover:bg-muted/50 transition-colors"
              onClick={() => toggleSection(section.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg bg-muted p-2 ${section.accent}`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base">{section.title}</CardTitle>
                      {status === 'configured' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                          <Check className="h-3 w-3" /> 已配置
                        </span>
                      )}
                    </div>
                    <CardDescription className="mt-0.5">{section.description}</CardDescription>
                  </div>
                </div>
                <button className="text-muted-foreground p-1">
                  <svg
                    className={`h-5 w-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0">
                <div className="space-y-4">
                  {section.fields.map(field => {
                    const FieldIcon = field.icon
                    const isDirty = field.key in dirtyFields
                    const currentValue = isDirty ? dirtyFields[field.key] : ''
                    const savedValue = savedSettings?.[field.key]
                    const isPassword = field.type === 'password'
                    const isModelSelect = field.type === 'model-select'
                    const showPw = showPasswords[field.key]

                    // Get model options for model-select fields
                    const modelOptions = isModelSelect && field.providerName
                      ? providers?.find(p => p.name === field.providerName)?.models || []
                      : []

                    return (
                      <div key={field.key} className="space-y-1.5">
                        <label className="flex items-center gap-1.5 text-sm font-medium">
                          <FieldIcon className="h-3.5 w-3.5 text-muted-foreground" />
                          {field.label}
                          {isDirty && (
                            <span className="text-xs text-amber-600 font-normal">(未保存)</span>
                          )}
                        </label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            {isModelSelect ? (
                              <Select
                                value={currentValue || savedValue || ''}
                                onChange={e => handleChange(field.key, e.target.value)}
                                className={isDirty ? 'border-amber-400 focus-visible:ring-amber-400' : ''}
                              >
                                {modelOptions.map(m => (
                                  <option key={m} value={m}>{m}</option>
                                ))}
                              </Select>
                            ) : (
                              <Input
                                type={isPassword && !showPw ? 'password' : 'text'}
                                placeholder={savedValue || field.placeholder}
                                value={currentValue}
                                onChange={e => handleChange(field.key, e.target.value)}
                                className={isDirty ? 'border-amber-400 focus-visible:ring-amber-400' : ''}
                              />
                            )}
                            {isPassword && !isModelSelect && (
                              <button
                                type="button"
                                onClick={() => togglePassword(field.key)}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              >
                                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            )}
                          </div>
                          {isDirty && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 flex-shrink-0"
                              onClick={() => handleReset(field.key)}
                              title="撤销修改"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        {field.description && (
                          <p className="text-xs text-muted-foreground">{field.description}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}

      {/* Publishing Platforms */}
      {platforms && platforms.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">发布平台</h2>
          </div>
          {platforms.map(renderPlatformCard)}
        </>
      )}

      {/* MCP Integration */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">MCP 集成</CardTitle>
          <CardDescription>在 AI Agent 中通过 MCP 协议使用 WriteFlow</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted rounded-lg p-4 overflow-x-auto">
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
        </CardContent>
      </Card>
    </div>
  )
}
