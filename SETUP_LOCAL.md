# 🚀 Guía de Configuración Local

Esta guía te ayudará a configurar y ejecutar el proyecto Motopartes Manager en tu entorno local.

## 📋 Pre-requisitos

- Node.js v18 o superior (tienes v24.11.1 ✅)
- npm
- Cuenta de Supabase

## ⚙️ Configuración Paso a Paso

### 1. Configuración de la Base de Datos (Supabase)

Primero, verifica que la tabla `whatsapp_sessions` exista en tu proyecto de Supabase:

1. Ve a tu proyecto en [Supabase Dashboard](https://supabase.com/dashboard/project/kdhdfrptggiclhupaszc)
2. Navega a **SQL Editor**
3. Ejecuta el script que se encuentra en `whatsapp-backend/supabase_migration.sql`

### 2. Configuración de Variables de Entorno

#### Frontend (`.env` en la raíz del proyecto)

El archivo `.env` ya está configurado con:
```env
VITE_SUPABASE_URL=https://kdhdfrptggiclhupaszc.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_LiqtAH21ejTAM6ibLB4vjA_tOepsh4B
VITE_WHATSAPP_API_URL=http://localhost:3001
```

#### Backend (`whatsapp-backend/.env`)

El archivo `whatsapp-backend/.env` **ya existe** y debe estar configurado con:
```env
PORT=3001
SUPABASE_URL=https://kdhdfrptggiclhupaszc.supabase.co
SUPABASE_ANON_KEY=sb_publishable_LiqtAH21ejTAM6ibLB4vjA_tOepsh4B
ALLOWED_ORIGINS=http://localhost:5173
```

> **Nota:** El archivo `.env` del backend está en `.gitignore` por seguridad.

### 3. Instalación de Dependencias

Las dependencias ya están instaladas ✅
- Frontend: 20 paquetes
- Backend: 23 paquetes

Si necesitas reinstalar:
```bash
# Frontend
npm install

# Backend
cd whatsapp-backend
npm install
```

## 🏃 Ejecutar el Proyecto

### Opción 1: Ejecutar ambos servicios manualmente

**Terminal 1 - Backend WhatsApp:**
```bash
cd whatsapp-backend
npm start
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

### Opción 2: Script automatizado (recomendado)

Crearé un script que ejecute ambos servicios simultáneamente.

## 🔍 Verificación

1. **Backend en funcionamiento:**
   - Abre: http://localhost:3001/api/health
   - Deberías ver: `{"status":"ok"}`

2. **Frontend en funcionamiento:**
   - Abre: http://localhost:5173
   - Deberías ver la aplicación Motopartes Manager

3. **Conexión WhatsApp:**
   - Ve a la sección de Admin → WhatsApp Connection
   - Escanea el código QR con tu WhatsApp
   - El estado debería cambiar a "Conectado"

## 🐛 Solución de Problemas

### Puerto 3001 ya en uso
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F
```

### Error de CORS
Verifica que `ALLOWED_ORIGINS` en el backend incluya `http://localhost:5173`

### Error de Supabase
Verifica que las URLs y las claves sean correctas en ambos archivos `.env`

## 📝 Notas Adicionales

- El backend almacena las sesiones de WhatsApp en Supabase
- Las sesiones persisten entre reinicios del servidor
- El QR se actualiza en tiempo real usando Server-Sent Events (SSE)
