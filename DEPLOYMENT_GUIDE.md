# 🚀 Guía de Deployment - WhatsApp Integration

## Pre-requisitos

- [ ] Cuenta de Railway.app o Render.com (gratuita)
- [ ] Proyecto Supabase configurado
- [ ] Aplicación frontend en Vercel
- [ ] Teléfono con WhatsApp para vincular

---

## Paso 1: Configurar Supabase

### 1.1 Ejecutar migración SQL

1. Ve a tu proyecto en [Supabase](https://supabase.com)
2. Abre el **SQL Editor**
3. Ejecuta el archivo `whatsapp-backend/supabase_migration.sql`:

```sql
-- Create whatsapp_sessions table
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone_number TEXT,
    is_connected BOOLEAN DEFAULT false,
    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    last_heartbeat TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_is_connected ON whatsapp_sessions(is_connected);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_last_heartbeat ON whatsapp_sessions(last_heartbeat);

-- Enable RLS
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON whatsapp_sessions
    FOR ALL
    USING (true);
```

4. Verifica que la tabla se creó correctamente en **Table Editor**

---

## Paso 2: Deploy Backend en Railway

### 2.1 Crear cuenta y proyecto

1. Ve a [railway.app](https://railway.app)
2. Inicia sesión con GitHub
3. Click en **"New Project"**
4. Selecciona **"Deploy from GitHub repo"**

### 2.2 Configurar el proyecto

1. Busca y selecciona tu repositorio `motopartes-manager`
2. Railway detectará automáticamente el proyecto Node.js
3. **IMPORTANTE**: Cambia el **Root Directory** a `whatsapp-backend`
   - Settings → Root Directory → `whatsapp-backend`

### 2.3 Configurar variables de entorno

En **Variables**, agrega:

```
PORT=3001
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key_aqui
ALLOWED_ORIGINS=http://localhost:5173,https://tu-app.vercel.app
```

**🔑 Obtener credenciales de Supabase:**
- Ve a tu proyecto en Supabase
- Settings → API
- Copia **Project URL** y **anon public** key

### 2.4 Deploy

1. Railway automáticamente hará el deploy
2. Espera a que termine (3-5 minutos)
3. Una vez completado, ve a **Settings → Domains**
4. Click en **Generate Domain**
5. **Copia la URL generada** (ej: `https://whatsapp-backend-production.up.railway.app`)

---

## Paso 3: Actualizar Frontend

### 3.1 Configurar variable de entorno en Vercel

1. Ve a tu proyecto en [Vercel](https://vercel.com)
2. Settings → Environment Variables
3. Agrega nueva variable:
   - **Name**: `VITE_WHATSAPP_API_URL`
   - **Value**: La URL de Railway (ej: `https://whatsapp-backend-production.up.railway.app`)
   - **Environment**: Production, Preview, Development

### 3.2 Redeploy

1. En Vercel, ve a **Deployments**
2. Click en los tres puntos de la última deployment
3. **Redeploy**
4. Espera a que termine

---

## Paso 4: Probar Localmente (Opcional pero Recomendado)

### 4.1 Configurar entorno local

1. Crea archivo `.env` en la raíz del proyecto:
```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu_anon_key
VITE_WHATSAPP_API_URL=http://localhost:3001
```

2. Crea archivo `whatsapp-backend/.env`:
```env
PORT=3001
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_ANON_KEY=tu_anon_key
ALLOWED_ORIGINS=http://localhost:5173
```

### 4.2 Instalar dependencias del backend

```bash
cd whatsapp-backend
npm install
```

### 4.3 Iniciar backend

```bash
npm start
```

Deberías ver:
```
🚀 WhatsApp backend running on port 3001
📡 CORS enabled for: http://localhost:5173
🔄 Initializing WhatsApp client...
```

### 4.4 Iniciar frontend (en otra terminal)

```bash
cd ..
npm run dev
```

### 4.5 Probar vinculación

1. Ve a `http://localhost:5173`
2. Inicia sesión como admin
3. Ve a **Panel de Admin → Vincular WhatsApp**
4. Deberías ver el código QR
5. Escanéalo con tu teléfono
6. ✅ Debería conectarse exitosamente

---

## Paso 5: Verificar Producción

### 5.1 Acceder a la app en producción

1. Ve a tu URL de Vercel (ej: `https://tu-app.vercel.app`)
2. Inicia sesión como administrador
3. Ve a **Panel de Admin**
4. Click en **"Vincular WhatsApp"**

### 5.2 Vincular WhatsApp

1. Debería aparecer el código QR
2. Abre WhatsApp en tu teléfono
3. Ve a **Configuración → Dispositivos vinculados**
4. **Vincular un dispositivo**
5. Escanea el código QR
6. ✅ Debería mostrar "WhatsApp Conectado" con tu número

### 5.3 Probar envío automático

1. Ve a cualquier orden de servicio
2. Haz click en el botón de WhatsApp
3. ✅ El mensaje debería enviarse **automáticamente** sin abrir WhatsApp Web
4. Verifica en tu teléfono que el mensaje llegó

---

## Troubleshooting

### ❌ "Error de Conexión" en la página de WhatsApp

**Solución:**
1. Verifica que el backend esté corriendo en Railway
2. Revisa los logs en Railway Dashboard
3. Confirma que `VITE_WHATSAPP_API_URL` en Vercel apunta a la URL correcta de Railway

### ❌ QR no aparece

**Solución:**
1. Abre la consola del navegador (F12)
2. Busca errores de CORS
3. Verifica que la URL de tu frontend esté en `ALLOWED_ORIGINS` en Railway

### ❌ "Failed to send message" al intentar enviar

**Solución:**
1. Verifica que WhatsApp esté conectado (estado verde)
2. Revisa los logs del backend en Railway
3. Confirma que el número de teléfono esté en formato correcto

### ❌ Railway se desconecta después de un tiempo

**Solución:**
- Railway free tier tiene 500 horas/mes
- Si se agota, considera:
  - Usar Render.com (también tiene free tier)
  - Optimizar para que solo corra cuando sea necesario
  - Upgrade a plan de pago ($5/mes)

---

## 📊 Monitoreo

### Verificar estado del backend

```bash
curl https://tu-backend.railway.app/api/health
```

Respuesta esperada:
```json
{"status":"ok","timestamp":"2024-12-09T..."}
```

### Verificar conexión de WhatsApp

```bash
curl https://tu-backend.railway.app/api/whatsapp/status
```

Respuesta esperada:
```json
{"connected":true,"phone":"1234567890","hasQR":false}
```

---

## 🎉 ¡Listo!

Tu sistema de WhatsApp debería estar completamente funcional. Los mensajes se enviarán automáticamente cuando WhatsApp esté conectado, y caerán de vuelta a WhatsApp Web si no lo está.

**Próximos pasos recomendados:**
- Monitorear los logs de Railway regularmente
- Probar el envío de mensajes en diferentes escenarios
- Configurar alertas si el backend se desconecta
