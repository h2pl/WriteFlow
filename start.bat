@echo off
chcp 65001 >nul
title WriteFlow

echo ========================================
echo   WriteFlow 一键启动脚本
echo ========================================
echo.

if not exist "backend\.env" (
    if exist "backend\.env.example" (
        echo [INFO] 未找到 .env，正在从 .env.example 复制...
        copy "backend\.env.example" "backend\.env" >nul
        echo [OK] 已生成 backend\.env，请稍后填入你的 API Key
        echo.
    )
) else (
    echo [OK] backend\.env 已存在
)

echo.
echo [1/2] 启动后端 (端口 8000)...
start "WriteFlow-Backend" /B cmd /c "cd /d e:\Projects\WriteFlow\backend && uvicorn app.main:app --reload --port 8000 > backend.log 2>&1"

echo [2/2] 启动前端 (端口 5173)...
start "WriteFlow-Frontend" /B cmd /c "cd /d e:\Projects\WriteFlow\frontend && npm run dev > frontend.log 2>&1"

echo.
echo ========================================
echo   启动完成
echo ========================================
echo   前端: http://localhost:5173
echo   后端: http://localhost:8000
echo   API 文档: http://localhost:8000/docs
echo ========================================
echo.
echo 日志: backend.log / frontend.log
echo 停止: stop.bat
echo.
timeout /t 5
