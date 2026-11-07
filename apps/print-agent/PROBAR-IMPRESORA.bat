@echo off
chcp 65001 >nul
title MotoPartes - Prueba de impresora
cd /d "%~dp0"
node agent.js --test-print
echo.
pause
