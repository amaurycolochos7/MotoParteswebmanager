@echo off
chcp 65001 >nul
title MotoPartes - Agente de impresion
cd /d "%~dp0"
echo Agente de impresion de MotoPartes. Deja esta ventana abierta ^(o usa INSTALAR.bat para que corra solo^).
echo Para detenerlo presiona Ctrl+C.
echo.
"%~dp0MotoPartes-Impresion.exe" run
echo.
pause
