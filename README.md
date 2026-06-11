# WriteFlow

AI 驱动的自动化写作与发布平台。

## 功能

- **AI 自动创作** — 多模型支持（OpenAI / Claude / DeepSeek），多种写作风格
- **多平台发布** — 微信公众号（草稿模式）、掘金、CSDN、知乎
- **Web UI** — 文章管理、发布配置、状态监控
- **Agent 集成** — HTTP REST API + MCP 双协议

## 技术栈

- **后端**: Python + FastAPI + SQLAlchemy (async) + SQLite
- **前端**: React + TypeScript + TailwindCSS + shadcn/ui
- **AI**: OpenAI / Anthropic / DeepSeek SDK
- **协议**: REST API + MCP (Model Context Protocol)

## 快速开始

### 1. 后端

```bash
cd backend

# 创建虚拟环境
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # macOS/Linux

# 安装依赖
pip install -r requirements.txt

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 启动
uvicorn app.main:app --reload --port 8000
```

### 2. 前端

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问 http://localhost:5173

### 3. MCP 集成（可选）

在你的 Agent 配置中添加：

```json
{
  "mcpServers": {
    "writeflow": {
      "command": "python",
      "args": ["-m", "app.mcp_server"],
      "cwd": "/path/to/WriteFlow/backend"
    }
  }
}
```

MCP 提供的工具：
- `writeflow_generate` — AI 生成文章
- `writeflow_list_articles` — 列出文章
- `writeflow_publish` — 发布文章
- `writeflow_get_article` — 获取文章详情
- `writeflow_platforms` — 查看配置状态

## API 文档

启动后端后访问：http://localhost:8000/docs

### 主要接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/articles` | 文章列表 |
| POST | `/api/articles` | 创建文章 |
| POST | `/api/articles/generate` | AI 生成文章 |
| PUT | `/api/articles/{id}` | 更新文章 |
| DELETE | `/api/articles/{id}` | 删除文章 |
| POST | `/api/articles/{id}/publish` | 发布文章 |
| GET | `/api/llm/providers` | LLM 提供商列表 |
| GET | `/api/llm/platforms` | 发布平台列表 |

## 平台配置说明

### 微信公众号
需要在公众号后台获取 `APP_ID` 和 `APP_SECRET`。订阅号只支持草稿模式（自动创建草稿，手动发布）。

### 掘金 / CSDN / 知乎
需要从浏览器开发者工具中获取登录后的 Cookie。

## 项目结构

```
WriteFlow/
├── backend/
│   ├── app/
│   │   ├── api/            # API 路由
│   │   ├── models/         # 数据模型 & Pydantic schemas
│   │   ├── publishers/     # 各平台发布器
│   │   ├── services/       # 业务逻辑（LLM、发布）
│   │   ├── config.py       # 配置管理
│   │   ├── database.py     # 数据库连接
│   │   ├── main.py         # FastAPI 入口
│   │   └── mcp_server.py   # MCP 服务
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   ├── pages/          # 页面
│   │   ├── lib/            # 工具函数 & API 客户端
│   │   └── App.tsx         # 路由入口
│   └── package.json
└── README.md
```

## License

MIT
