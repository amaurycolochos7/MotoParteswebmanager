@echo off
echo ========================================
echo 🚀 Iniciando Motopartes Manager
echo ========================================
echo.

echo 📦 Verificando configuración...

REM Verificar archivo .env del frontend
if not exist ".env" (
    echo ❌ Error: Archivo .env no encontrado en la raíz del proyecto
    echo Por favor, crea el archivo .env siguiendo SETUP_LOCAL.md
    pause
    exit /b 1
)

REM Verificar archivo .env del backend
if not exist "whatsapp-backend\.env" (
    echo ❌ Error: Archivo whatsapp-backend\.env no encontrado
    echo Por favor, crea el archivo siguiendo SETUP_LOCAL.md
    pause
    exit /b 1
)

echo ✅ Configuración verificada
echo.
echo 🔧 Iniciando servicios...
echo.
echo 📱 Backend WhatsApp: http://localhost:3001
echo 🌐 Frontend: http://localhost:5173
echo.
echo ⚠️  Presiona Ctrl+C para detener ambos servicios
echo.

REM Iniciar backend en una nueva ventana
start "WhatsApp Backend" cmd /k "cd whatsapp-backend && npm start"

REM Esperar 3 segundos para que el backend inicie
timeout /t 3 /nobreak > nul

REM Iniciar frontend en la ventana actual
npm run dev

pause
