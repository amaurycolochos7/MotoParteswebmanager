# 🚀 Guía Completa de Deployment en Windows Server

Esta guía te ayudará a instalar y configurar MotoPartes Manager en Windows Server con un flujo de trabajo dev → producción.

## 📘 ¿Qué es IIS?

**IIS (Internet Information Services)** es el servidor web que viene incluido en Windows Server. Es el equivalente de Apache o Nginx pero hecho por Microsoft.

**¿Para qué lo usamos?**
- Servir el frontend React (archivos HTML, CSS, JS)
- Hacer proxy reverso al backend de WhatsApp (puerto 3001)
- Manejar SSL/HTTPS cuando lo necesites

---

## 📋 Pre-requisitos

### En el Windows Server:
- [ ] Windows Server 2016 o superior
- [ ] Conexión a Internet
- [ ] Permisos de administrador
- [ ] Puerto 80 y 3001 disponibles

### En tu computadora de desarrollo:
- [ ] Git instalado
- [ ] Node.js v18+ instalado
- [ ] Acceso al repositorio Git del proyecto

---

## 🎯 Flujo de Trabajo (Cómo Funciona)

```
TU COMPUTADORA (Desarrollo)          WINDOWS SERVER (Producción)
      │                                      │
      │ 1. Haces cambios                     │
      │ 2. Pruebas localmente                │
      │ 3. Git commit + push ─────────────►  │
      │                                      │
      │                     4. Git pull ◄────┤
      │                     5. Rebuild       │
      │                     6. Restart       │
      │                                      │
      └─────────── Todo sincronizado ────────┘
```

---

## 🔧 PARTE 1: Configuración Inicial del Servidor

### Paso 1: Instalar Software Requerido

#### 1.1 Instalar Node.js

1. Descarga Node.js LTS desde: https://nodejs.org/
2. Ejecuta el instalador
3. Verifica instalación:
   ```cmd
   node --version
   npm --version
   ```

#### 1.2 Instalar Git

1. Descarga Git desde: https://git-scm.com/download/win
2. Ejecuta el instalador (opciones por defecto)
3. Verifica:
   ```cmd
   git --version
   ```

#### 1.3 Habilitar IIS

1. Abre **Server Manager**
2. Click en **Manage** → **Add Roles and Features**
3. Next hasta **Server Roles**
4. Marca **Web Server (IIS)**
5. En **Role Services**, asegúrate de tener:
   - ✅ Static Content
   - ✅ Default Document
   - ✅ HTTP Errors
   - ✅ HTTP Redirection
   - ✅ Application Initialization
   - ✅ WebSocket Protocol (importante para SSE)
6. Click **Install**
7. Verifica abriendo navegador en: `http://localhost` (debería mostrar página de IIS)

#### 1.4 Instalar URL Rewrite Module (para React Router)

1. Descarga desde: https://www.iis.net/downloads/microsoft/url-rewrite
2. Ejecuta el instalador
3. Reinicia IIS:
   ```cmd
   iisreset
   ```

### Paso 2: Clonar el Proyecto

1. Abre PowerShell como Administrador
2. Navega a donde quieres el proyecto:
   ```powershell
   cd C:\inetpub\wwwroot
   ```
3. Clona el repositorio:
   ```powershell
   git clone https://github.com/TU-USUARIO/motopartes-manager.git
   cd motopartes-manager
   ```

### Paso 3: Instalar Dependencias

```powershell
# Frontend
npm install

# Backend
cd whatsapp-backend
npm install
cd ..
```

### Paso 4: Configurar Variables de Entorno

#### Frontend: `.env.production`
Crea el archivo `C:\inetpub\wwwroot\motopartes-manager\.env.production`:

```env
VITE_SUPABASE_URL=https://kdhdfrptggiclhupaszc.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_LiqtAH21ejTAM6ibLB4vjA_tOepsh4B
VITE_WHATSAPP_API_URL=http://localhost:3001
```

> **Nota:** Más adelante cambiarás `localhost` por la IP del servidor

#### Backend: `whatsapp-backend\.env.production`
Crea `C:\inetpub\wwwroot\motopartes-manager\whatsapp-backend\.env.production`:

```env
PORT=3001
SUPABASE_URL=https://kdhdfrptggiclhupaszc.supabase.co
SUPABASE_ANON_KEY=sb_publishable_LiqtAH21ejTAM6ibLB4vjA_tOepsh4B
ALLOWED_ORIGINS=http://localhost,http://TU_IP_SERVIDOR
```

### Paso 5: Compilar el Frontend

```powershell
npm run build
```

Esto creará la carpeta `dist/` con el frontend compilado.

---

## 🌐 PARTE 2: Configurar IIS

### Paso 1: Crear Sitio Web en IIS

1. Abre **IIS Manager** (busca "IIS" en el menú de inicio)
2. Click derecho en **Sites** → **Add Website**
3. Configura:
   - **Site name**: MotoPartes-Manager
   - **Physical path**: `C:\inetpub\wwwroot\motopartes-manager\dist`
   - **Port**: 80
4. Click **OK**

### Paso 2: Configurar URL Rewrite (para React Router)

1. En IIS Manager, selecciona tu sitio **MotoPartes-Manager**
2. Doble click en **URL Rewrite**
3. Click en **Add Rule(s)** → **Blank rule**
4. Configura:
   - **Name**: React Router
   - **Match URL**:
     - Requested URL: Matches the Pattern
     - Using: Regular Expressions
     - Pattern: `^(.*)$`
   - **Conditions**:
     - Click **Add**
     - Condition input: `{REQUEST_FILENAME}`
     - Check if input string: Is Not a File
     - Click **Add** otra vez
     - Condition input: `{REQUEST_FILENAME}`
     - Check if input string: Is Not a Directory
   - **Action**:
     - Action type: Rewrite
     - Rewrite URL: `/index.html`
5. Click **Apply**

### Paso 3: Configurar Proxy Reverso (para WhatsApp API)

1. En IIS Manager, selecciona tu sitio
2. Click en **URL Rewrite** → **Add Rule(s)** → **Reverse Proxy**
3. Si te pide instalar Application Request Routing (ARR):
   - Descarga desde: https://www.iis.net/downloads/microsoft/application-request-routing
   - Instala y reinicia IIS Manager
4. Configura:
   - **Inbound rule**: `api/(.*)`
   - **Server address**: `localhost:3001/{R:1}`
   - ✅ Enable SSL Offloading (desmarca si no usas HTTPS)
5. Click **OK**

---

## 🔄 PARTE 3: Configurar WhatsApp Backend como Servicio

### Opción A: Usar PM2 (Recomendado)

#### 1. Instalar PM2 globalmente
```powershell
npm install -g pm2
npm install -g pm2-windows-service
```

#### 2. Configurar PM2 como servicio de Windows
```powershell
pm2-service-install -n PM2
```
Presiona Enter en todas las preguntas (valores por defecto).

#### 3. Iniciar el backend con PM2
```powershell
cd C:\inetpub\wwwroot\motopartes-manager\whatsapp-backend
pm2 start server.js --name "whatsapp-backend" --env production
pm2 save
```

#### 4. Verificar que esté corriendo
```powershell
pm2 list
pm2 logs whatsapp-backend
```

### Opción B: Servicio de Windows Nativo (Avanzado)

Si prefieres no usar PM2, puedes usar NSSM (Non-Sucking Service Manager):

1. Descarga NSSM: https://nssm.cc/download
2. Extrae y ejecuta:
   ```cmd
   nssm install WhatsAppBackend
   ```
3. Configura:
   - **Path**: `C:\Program Files\nodejs\node.exe`
   - **Startup directory**: `C:\inetpub\wwwroot\motopartes-manager\whatsapp-backend`
   - **Arguments**: `server.js`
   - **Environment**: `NODE_ENV=production`
4. Click **Install service**
5. Inicia el servicio:
   ```cmd
   nssm start WhatsAppBackend
   ```

---

## 🔥 PARTE 4: Configurar Firewall

### Permitir puertos en Firewall de Windows

```powershell
# Permitir HTTP (puerto 80)
New-NetFirewallRule -DisplayName "IIS HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow

# Permitir backend (puerto 3001) solo localmente
New-NetFirewallRule -DisplayName "WhatsApp Backend Local" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -RemoteAddress LocalSubnet
```

---

## 🚀 PARTE 5: Workflow de Desarrollo → Producción

### En Tu Computadora (Desarrollo)

1. **Haz cambios al código**
2. **Prueba localmente:**
   ```bash
   npm run dev
   ```
3. **Cuando esté listo, commit y push:**
   ```bash
   git add .
   git commit -m "Descripción de cambios"
   git push origin main
   ```

### En el Servidor (Producción)

1. **Conéctate al servidor** (Remote Desktop)
2. **Ejecuta el script de deployment:**
   ```powershell
   cd C:\inetpub\wwwroot\motopartes-manager
   .\deploy-to-server.bat
   ```

El script automáticamente:
- ✅ Hace pull de los cambios
- ✅ Instala nuevas dependencias
- ✅ Rebuild del frontend
- ✅ Reinicia el backend
- ✅ Verifica que todo esté funcionando

---

## 🔍 Verificación

### 1. Verificar Frontend
Abre navegador en: `http://localhost` o `http://IP_DEL_SERVIDOR`

Deberías ver la aplicación MotoPartes Manager.

### 2. Verificar Backend
Abre: `http://localhost/api/health`

Deberías ver: `{"status":"ok","timestamp":"..."}`

### 3. Verificar WhatsApp
1. Login como admin
2. Ve a configuración de WhatsApp
3. Escanea el QR
4. Debería conectarse correctamente

---

## 🛠️ Comandos Útiles

### IIS
```powershell
# Reiniciar IIS
iisreset

# Ver sitios activos
Get-IISSite

# Detener sitio
Stop-IISSite -Name "MotoPartes-Manager"

# Iniciar sitio
Start-IISSite -Name "MotoPartes-Manager"
```

### PM2
```powershell
# Ver procesos
pm2 list

# Ver logs en tiempo real
pm2 logs whatsapp-backend

# Reiniciar backend
pm2 restart whatsapp-backend

# Detener backend
pm2 stop whatsapp-backend

# Información detallada
pm2 show whatsapp-backend
```

### Verificar Puertos
```powershell
# Ver qué está usando el puerto 80
netstat -ano | findstr :80

# Ver qué está usando el puerto 3001
netstat -ano | findstr :3001
```

---

## 🐛 Troubleshooting

### ❌ No se ve el sitio en el navegador

1. Verifica que IIS esté corriendo:
   ```powershell
   Get-Service W3SVC
   ```
2. Verifica que el sitio esté iniciado en IIS Manager
3. Verifica firewall:
   ```powershell
   Get-NetFirewallRule -DisplayName "IIS HTTP"
   ```

### ❌ Error 500 en el sitio

1. Verifica que `dist/` exista y tenga archivos
2. Rebuild:
   ```powershell
   npm run build
   ```
3. Verifica permisos:
   ```powershell
   icacls "C:\inetpub\wwwroot\motopartes-manager\dist" /grant "IIS_IUSRS:(OI)(CI)F"
   ```

### ❌ API no responde (/api/health da error)

1. Verifica que PM2 esté corriendo:
   ```powershell
   pm2 list
   ```
2. Si no está, inicia:
   ```powershell
   cd C:\inetpub\wwwroot\motopartes-manager\whatsapp-backend
   pm2 start server.js --name "whatsapp-backend"
   ```
3. Revisa logs:
   ```powershell
   pm2 logs whatsapp-backend --lines 100
   ```

### ❌ WhatsApp no se conecta

1. Verifica que Chrome esté instalado (Puppeteer lo necesita)
2. Revisa logs del backend:
   ```powershell
   pm2 logs whatsapp-backend
   ```
3. Reinicia el backend:
   ```powershell
   pm2 restart whatsapp-backend
   ```
4. Borra sesión y reconecta:
   ```powershell
   cd C:\inetpub\wwwroot\motopartes-manager\whatsapp-backend
   Remove-Item -Recurse -Force .wwebjs_auth
   Remove-Item -Recurse -Force .wwebjs_cache
   pm2 restart whatsapp-backend
   ```

### ❌ Git pull falla con permisos

1. Ejecuta PowerShell como Administrador
2. Configura Git:
   ```powershell
   git config --global credential.helper wincred
   ```
3. Reinicia el pull

---

## 🔐 Seguridad (Implementar después)

### 1. Agregar HTTPS
- Obtener certificado SSL (Let's Encrypt o comercial)
- Configurar binding HTTPS en IIS
- Forzar redirect HTTP → HTTPS

### 2. Cambiar puertos por defecto
- Frontend: puerto personalizado en lugar de 80
- Backend: puerto diferente a 3001

### 3. Acceso remoto seguro
- Configurar VPN para acceso al servidor
- Deshabilitar Remote Desktop desde Internet
- Usar autenticación de dos factores

---

## 📊 Monitoreo

### Ver uso de recursos
```powershell
# CPU y Memoria
pm2 monit

# Logs en tiempo real
pm2 logs --lines 50
```

### Logs de IIS
Ubicación: `C:\inetpub\logs\LogFiles\`

---

## 🎉 ¡Listo!

Tu aplicación debería estar corriendo en Windows Server con:
- ✅ Frontend servido por IIS
- ✅ Backend como servicio de Windows
- ✅ WhatsApp funcionando automáticamente
- ✅ Workflow de deployment configurado

**Para actualizar en el futuro:**
1. Haces cambios en tu PC
2. Git push
3. En el servidor ejecutas `deploy-to-server.bat`
4. ¡Todo actualizado!
