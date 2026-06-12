# WriteFlow 一键启动

双击 `start.bat` 即可同时启动前后端。

## 启动后的访问地址

- **前端**: http://localhost:5173
- **后端 API**: http://localhost:8000
- **API 文档**: http://localhost:8000/docs

## 使用说明

1. 首次运行会自动从 `.env.example` 复制生成 `backend\.env`
2. 编辑 `backend\.env` 填入 LLM API Key（至少填一个）
3. 脚本会打开两个独立的命令行窗口分别运行后端和前端
4. 关闭对应窗口即可停止对应服务

## 环境要求

- Python 3.10+ （已测试 3.14）
- Node.js 18+ （已测试 24）
- 后端依赖：`pip install -r backend/requirements.txt`
- 前端依赖：`npm install`（在 `frontend/` 目录下）

## 注意事项

- 端口 8000（后端）和 5173（前端）需保持空闲
- 修改后端代码会自动 reload（uvicorn --reload）
- 修改前端代码会自动热更新（Vite HMR）
