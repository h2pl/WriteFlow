#!/usr/bin/env bash
# WriteFlow 一键启动 (类 Unix / Git Bash / WSL)
# 用法: ./start.sh

# 不开 set -e：希望脚本继续跑（写完日志、给出明确错误）而不是直接 exit

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

# Windows Git Bash 后台进程会被父 shell SIGHUP 杀掉——重定向 stdin/stdout/stderr
# 并用 nohup 包裹（兼容 Unix 环境）。父 shell 退出时子进程不退出。
detach() {
    if command -v nohup >/dev/null 2>&1; then
        nohup "$@" </dev/null >/dev/null 2>&1 &
    else
        "$@" </dev/null >/dev/null 2>&1 &
    fi
}

# 3. 启动后端 (后台)
echo
echo "[1/2] 启动后端 (端口 8000)..."
( cd "$ROOT/backend" && "$PY" -m uvicorn app.main:app --reload --port 8000 ) \
    </dev/null >"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
disown 2>/dev/null || true
echo "        PID=$BACKEND_PID  日志=$LOG_DIR/backend.log"

# 4. 启动前端 (后台)
echo "[2/2] 启动前端 (端口 5173)..."
( cd "$ROOT/frontend" && "$NPM_CMD" run dev ) \
    </dev/null >"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
disown 2>/dev/null || true
echo "        PID=$FRONTEND_PID  日志=$LOG_DIR/frontend.log"

# 5. 写 PID 文件，方便 stop.sh 关掉
echo "$BACKEND_PID"  > "$ROOT/.logs/backend.pid"
echo "$FRONTEND_PID" > "$ROOT/.logs/frontend.pid"

# 6. 等待几秒让服务起来
sleep 4

# 7. 自检端口是否真的监听
check_port() {
    local port=$1
    local name=$2
    # Git Bash 自带 nc.exe；优先用 nc，没有就用 powershell
    if command -v nc >/dev/null 2>&1; then
        if nc -z 127.0.0.1 "$port" 2>/dev/null; then
            echo "  ✓ $name :$port"
            return 0
        fi
    fi
    # fallback: 用 powershell 检测
    powershell.exe -NoProfile -Command "Test-NetConnection -ComputerName 127.0.0.1 -Port $port -InformationLevel Quiet" 2>/dev/null | grep -q "True" \
        && { echo "  ✓ $name :$port"; return 0; }
    echo "  ✗ $name :$port  未就绪"
    return 1
}

echo
echo "========================================"
echo "  启动完成"
echo "========================================"
check_port 8000 "后端"
backend_ok=$?
check_port 5173 "前端"
frontend_ok=$?
echo "========================================"

if [ $backend_ok -ne 0 ] || [ $frontend_ok -ne 0 ]; then
    echo
    echo "⚠️  有服务未起来。常见原因："
    echo "  - 端口被占用: netstat -ano | findstr :8000"
    echo "  - 依赖未装:  cd backend  && pip install -r requirements.txt"
    echo "                cd frontend && npm install"
    echo "  - Python 找不到: 这台机器上 python3/python 都不在 PATH"
    echo "                    解决: 装 Python 后重开 Git Bash, 或设 PYTHON=py"
    echo
    echo "  详细错误: tail -50 $LOG_DIR/backend.log"
    echo "            tail -50 $LOG_DIR/frontend.log"
    echo
fi

echo
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:8000"
echo "  API 文档: http://localhost:8000/docs"
echo
echo "日志: $LOG_DIR/backend.log / $LOG_DIR/frontend.log"
echo "停止: ./stop.sh"
echo
echo "按 Ctrl+C 退出本提示（服务在后台继续运行）"
