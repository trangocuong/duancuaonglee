@echo off
chcp 65001 > nul
title TechOps LAN Server (Offline 100%%)

echo ==================================================================
echo   Đang khởi động Máy chủ TechOps mạng LAN nội bộ...
echo ==================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LỖI] Không tìm thấy Node.js trên máy tính này!
    echo Vui lòng cài đặt Node.js phiên bản 22 trở lên để chạy máy chủ.
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"
node server.mjs

if %errorlevel% neq 0 (
    echo.
    echo [LỖI] Máy chủ đã dừng lại với mã lỗi %errorlevel%!
    pause
)

