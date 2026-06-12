@echo off
chcp 65001 >nul
echo 正在停止 WriteFlow 服务...
taskkill /F /FI "WINDOWTITLE eq WriteFlow-Backend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq WriteFlow-Frontend*" >nul 2>&1
taskkill /F /IM uvicorn.exe >nul 2>&1
taskkill /F /IM node.exe /FI "MEMUSAGE gt 50000" >nul 2>&1
echo 已停止。
timeout /t 3
