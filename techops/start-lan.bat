@echo off
title TechOps LAN Server
cd /d "%~dp0"

echo ==================================================================
echo   Dang khoi dong May chu TechOps mang LAN noi bo...
echo ==================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [LOI] Khong tim thay Node.js tren may tinh nay!
    echo Vui long cai dat Node.js phien ban 22 tro len de chay may chu.
    echo.
    pause
    exit /b 1
)

node server.mjs

if %errorlevel% neq 0 (
    echo.
    echo [LOI] May chu da dung lai voi ma loi %errorlevel%!
    pause
)
