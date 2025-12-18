# ✅ CHECKLIST: Primeros Pasos en Windows Server

## 📌 ORDEN DE INSTALACIÓN

Sigue estos pasos EN ORDEN una vez que tengas Windows Server instalado.

---

## PASO 1: Instalar Software Base

### 1.1 Instalar Node.js
- [ ] Descarga Node.js LTS desde: https://nodejs.org/
- [ ] Ejecuta el instalador (opciones por defecto)
- [ ] Verifica en CMD o PowerShell:
  ```cmd
  node --version
  npm --version
  ```

### 1.2 Instalar Git
- [ ] Descarga Git desde: https://git-scm.com/download/win
- [ ] Ejecuta el instalador (opciones por defecto)
- [ ] Verifica:
  ```cmd
  git --version
  ```

### 1.3 Instalar Google Chrome
- [ ] Descarga Chrome desde: https://www.google.com/chrome/
- [ ] Instala normalmente
- [ ] **Importante:** El backend de WhatsApp necesita Chrome para funcionar

---

## PASO 2: Habilitar IIS (Servidor Web)

- [ ] Abre **Server Manager**
- [ ] Click en **Manage** → **Add Roles and Features**
- [ ] Next, Next, Next hasta **Server Roles**
- [ ] Marca **Web Server (IIS)**
- [ ] Click **Add Features** cuando pregunte
- [ ] En **Role Services**, verifica que estén marcados:
  - ✅ Static Content
  - ✅ Default Document
  - ✅ HTTP Errors
  - ✅ HTTP Redirection
  - ✅ Application Initialization
  - ✅ WebSocket Protocol
- [ ] Click **Install** y espera
- [ ] Verifica abriendo navegador en `http://localhost` (debe mostrar página de IIS)

---

## PASO 3: Instalar URL Rewrite Module

- [ ] Descarga desde: https://www.iis.net/downloads/microsoft/url-rewrite
- [ ] Ejecuta el instalador
- [ ] Reinicia IIS:
  ```cmd
  iisreset
  ```

---

## PASO 4: Clonar el Proyecto

- [ ] Abre **PowerShell como Administrador**
- [ ] Navega a la carpeta de IIS:
  ```powershell
  cd C:\inetpub\wwwroot
  ```
- [ ] Clona tu repositorio (necesitas subir el proyecto a GitHub primero):
  ```powershell
  git clone https://github.com/CluberJunior/motopartes-manager.git
  cd motopartes-manager
  ```

**ALTERNATIVA si no tienes Git configurado aún:**
- [ ] Copia todo el proyecto desde tu computadora al servidor
- [ ] Pégalo en `C:\inetpub\wwwroot\motopartes-manager`

---

## PASO 5: Instalar Dependencias del Proyecto

- [ ] En PowerShell, dentro de la carpeta del proyecto:
  ```powershell
  npm run install:all
  ```
  Esto instala dependencias de frontend Y backend.

---

## PASO 6: Configurar Variables de Entorno

### 6.1 Obtener la IP del servidor
- [ ] En CMD o PowerShell:
  ```cmd
  ipconfig
  ```
- [ ] Anota la IP (ejemplo: `192.168.1.100`)

### 6.2 Actualizar archivos .env

- [ ] Edita `.env.production` en la raíz:
  ```env
  VITE_WHATSAPP_API_URL=http://TU_IP_AQUI:3001
  ```
  Reemplaza `TU_IP_AQUI` con la IP del paso anterior

- [ ] Edita `whatsapp-backend\.env.production`:
  ```env
  ALLOWED_ORIGINS=http://TU_IP_AQUI,http://localhost
  ```
  Reemplaza `TU_IP_AQUI` con tu IP

---

## PASO 7: Compilar el Frontend

- [ ] En PowerShell, en la raíz del proyecto:
  ```powershell
  npm run build:prod
  ```
- [ ] Verifica que se haya creado la carpeta `dist\` con archivos dentro

---

## PASO 8: Configurar PM2 (Backend de WhatsApp)

- [ ] Ejecuta el script de instalación como Administrador:
  ```powershell
  .\windows-server\install-pm2-service.ps1
  ```
- [ ] Presiona ENTER en todas las preguntas
- [ ] Verifica que esté corriendo:
  ```powershell
  pm2 list
  ```

---

## PASO 9: Configurar Firewall

- [ ] Ejecuta como Administrador:
  ```powershell
  .\windows-server\configure-firewall.ps1
  ```
- [ ] Esto abrirá los puertos necesarios automáticamente

---

## PASO 10: Configurar IIS para Servir tu Aplicación

### 10.1 Crear Sitio Web
- [ ] Abre **IIS Manager** (busca "IIS" en el menú de inicio)
- [ ] Click derecho en **Sites** → **Add Website**
- [ ] Configura:
  - **Site name**: `MotoPartes-Manager`
  - **Physical path**: `C:\inetpub\wwwroot\motopartes-manager\dist`
  - **Port**: `80`
- [ ] Click **OK**

### 10.2 Copiar web.config
- [ ] Copia el archivo `web.config` desde la raíz del proyecto
- [ ] Pégalo dentro de la carpeta `dist\`

### 10.3 Configurar Permisos
- [ ] Click derecho en `C:\inetpub\wwwroot\motopartes-manager\dist`
- [ ] Propiedades → Seguridad → Editar
- [ ] Agregar usuario `IIS_IUSRS` con permisos de Lectura

---

## PASO 11: Probar que Todo Funcione

### 11.1 Verificar Backend
- [ ] Abre navegador en el servidor
- [ ] Ve a: `http://localhost:3001/api/health`
- [ ] Debes ver: `{"status":"ok","timestamp":"..."}`

### 11.2 Verificar Frontend
- [ ] Abre: `http://localhost`
- [ ] Debes ver la aplicación MotoPartes Manager
- [ ] Intenta hacer login

### 11.3 Verificar desde otra computadora (en la misma red)
- [ ] Desde tu computadora de desarrollo
- [ ] Abre: `http://IP_DEL_SERVIDOR`
- [ ] Debes ver la aplicación

---

## PASO 12: Vincular WhatsApp

- [ ] Login como administrador en la aplicación
- [ ] Ve a configuración de WhatsApp
- [ ] Escanea el código QR con tu teléfono
- [ ] Debe conectarse y mostrar tu número

---

## ✅ VERIFICACIÓN FINAL

Si todo funciona:
- ✅ Frontend carga desde `http://IP_SERVIDOR`
- ✅ Puedes hacer login
- ✅ Backend responde en `/api/health`
- ✅ WhatsApp está conectado
- ✅ Puedes crear órdenes y enviar mensajes

---

## 🔄 Para Actualizaciones Futuras

Desde tu computadora de desarrollo:
1. Haces cambios
2. Ejecutas `push-changes.bat`

En el servidor:
3. Ejecutas `deploy-to-server.bat`

¡Listo! 🎉

---

## 📞 Si Algo Falla

Consulta: [WINDOWS_SERVER_DEPLOYMENT.md](./WINDOWS_SERVER_DEPLOYMENT.md) sección "Troubleshooting"

O ejecuta para ver logs:
```powershell
pm2 logs whatsapp-backend
```
