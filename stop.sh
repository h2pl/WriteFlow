#!/usr/bin/env bash
# WriteFlow 停止服务 (类 Unix / Git Bash / WSL)
# 用法: ./stop.sh

set +e
cd "$(dirname "$0")"
ROOT="$(pwd)"
LOG_DIR="$ROOT/.logs"

stopped=0

# 1. 用 PID 文件关（最准确）
for label in backend frontend; do
    pidfile="$LOG_DIR/$label.pid"
    if [ -f "$pidfile" ]; then
        pid=$(cat "$pidfile" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            echo "[$label] 终止 PID=$pid ..."
            # 优雅退出 → 强制退出
            kill "$pid" 2>/dev/null
            sleep 1
            kill -9 "$pid" 2>/dev/null
            stopped=$((stopped + 1))
        fi
        rm -f "$pidfile"
    fi
done

# 2. 兜底：用进程名兜一遍（应对 PID 文件丢失 / 多开的情况）
pkill -f "uvicorn app.main:app" 2>/dev/null && stopped=$((stopped + 1))
pkill -f "vite" 2>/dev/null && stopped=$((stopped + 1))

if [ $stopped -gt 0 ]; then
    echo "已停止 $stopped 个相关进程。"
else
    echo "没有正在运行的 WriteFlow 服务。"
fi

# 3. 清理 .logs 目录里超过 7 天的日志（可选）
if [ -d "$LOG_DIR" ]; then
    find "$LOG_DIR" -type f -name "*.log" -mtime +7 -delete 2>/dev/null || true
fi
