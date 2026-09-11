@echo off
chcp 65001 >nul
rem GeoBox 开发预览启动器（自动配置 Node 环境并启动 Electron 开发模式）
set "PATH=%LOCALAPPDATA%\Programs\kimi-desktop\resources\resources\runtime\node;%PATH%"
cd /d %~dp0
echo 正在启动 GeoBox 开发预览（首次启动约需 10-20 秒）...
call npm.cmd run dev
pause
