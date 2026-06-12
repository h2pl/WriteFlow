#!/usr/bin/env bash
# WriteFlow 一键启动 (类 Unix / Git Bash / WSL)
# 用法: ./start.sh

set -e

# 切到脚本所在目录（这样无论从哪调都能找到 backend/ frontend/）
cd "$(dirname "$0")"
ROOT="$(pwd)"

echo "========================================"
echo "  WriteFlow 一键启动脚本"
echo "========================================"

# 1. 自动从 .env.example 复制 .env
if [ ! -f "backend/.env" ]; then
    if [ -f "backend/.env.example" ]; then
        echo "[INFO] 未找到 .env，正在从 .env.example 复制..."
        cp "backend/.env.example" "backend/.env"
        echo "[OK] 已生成 backend/.env，请稍后填入你的 API Key"
        echo
    fi
else
    echo "[OK] backend/.env 已存在"
fi

# 2. 选择启动器：检测 python3 / python；node / npm
PY="${PYTHON:-python3}"
command -v "$PY" >/dev/null 2>&1 || PY="${PYTHON:-python}"
command -v "$PY" >/dev/null 2>&1 || { echo "[ERR] 找不到 python 或 python3"; exit 1; }

NPM_CMD="npm"
command -v "$NPM_CMD" >/dev/null 2>&1 || { echo "[ERR] 找不到 npm，请安装 Node.js 18+"; exit 1; }

mkdir -p .logs
LOG_DIR="$ROOT/.logs"

# 3. 启动后端 (后台)
echo
echo "[1/2] 启动后端 (端口 8000)..."
( cd "$ROOT/backend" && "$PY" -m uvicorn app.main:app --reload --port 8000 ) \
    > "$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "        PID=$BACKEND_PID  日志=$LOG_DIR/backend.log"

# 4. 启动前端 (后台)
echo "[2/2] 启动前端 (端口 5173)..."
( cd "$ROOT/frontend" && "$NPM_CMD" run dev ) \
    > "$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "        PID=$FRONTEND_PID  日志=$LOG_DIR/frontend.log"

# 5. 写 PID 文件，方便 stop.sh 关掉
echo "$BACKEND_PID"  > "$ROOT/.logs/backend.pid"
echo "$FRONTEND_PID" > "$ROOT/.logs/frontend.pid"

# 6. 等待几秒让服务起来
sleep 3

echo
echo "========================================"
echo "  启动完成"
echo "========================================"
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:8000"
echo "  API 文档: http://localhost:8000/docs"
echo "========================================"
echo
echo "日志: $LOG_DIR/backend.log / $LOG_DIR/frontend.log"
echo "停止: ./stop.sh"
echo
echo "按 Ctrl+C 退出本提示（服务在后台继续运行）"
