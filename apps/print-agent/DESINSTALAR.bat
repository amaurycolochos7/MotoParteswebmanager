@echo off
chcp 65001 >nul
title MotoPartes - Quitar agente de impresion
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-autostart.ps1"
echo.
pause
