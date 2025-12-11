# WhatsApp Integration - Motopartes Manager

Esta funcionalidad permite vincular el WhatsApp de la empresa al sistema para enviar mensajes automáticos a los clientes.

## 📁 Estructura de Archivos

### Backend (whatsapp-backend/)
```
whatsapp-backend/
├── server.js              # Servidor Express con whatsapp-web.js
├── package.json           # Dependencias del backend
├── .env.example          # Variables de entorno ejemplo
├── .gitignore            # Archivos a ignorar
├── supabase_migration.sql # Script SQL para crear tabla
└── README.md             # Documentación del backend
```

### Frontend (src/)
```
src/
├── services/
│   └── whatsappService.js       # Servicio para comunicarse con backend
├── pages/admin/
│   └── WhatsAppConnection.jsx   # Página de vinculación QR
└── utils/
    └── whatsappHelper.js        # Funciones mejoradas con envío automático
```

## 🔧 Funcionalidades

### 1. Vinculación de WhatsApp
- Página en admin: `/admin/whatsapp`
- Generación de código QR en tiempo real
- Indicadores visuales de estado (🔴 Desconectado / 🟢 Conectado)
- Persistencia de sesión

### 2. Envío Automático de Mensajes
- Si WhatsApp está conectado → Envío automático via backend
- Si no está conectado → Fallback a WhatsApp Web
- Función: `sendAutomatedMessage(phone, message)`

### 3. Gestión de Sesión
- Almacenamiento de sesión en Supabase
- Heartbeat cada 30 segundos
- Reconexión automática si es necesario

## 🚀 Quick Start

### 1. Configurar Supabase
```sql
-- Ejecutar whatsapp-backend/supabase_migration.sql en SQL Editor
```

### 2. Instalar dependencias del backend
```bash
cd whatsapp-backend
npm install
```

### 3. Configurar variables de entorno
```bash
# whatsapp-backend/.env
cp .env.example .env
# Editar .env con tus credenciales
```

### 4. Iniciar backend localmente
```bash
npm start
```

### 5. Configurar frontend
```bash
# En raíz del proyecto, crear .env
VITE_WHATSAPP_API_URL=http://localhost:3001
```

### 6. Probar
1. Ir a `/admin/whatsapp`
2. Escanear QR con WhatsApp
3. ¡Listo!

## 📚 Documentación Completa

- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)** - Guía paso a paso para deploy en Railway/Render
- **[ENV_SETUP.md](./ENV_SETUP.md)** - Configuración de variables de entorno
- **[whatsapp-backend/README.md](./whatsapp-backend/README.md)** - Documentación técnica del backend

## 🔗 API Endpoints

### `GET /api/whatsapp/status`
Obtener estado de conexión

### `GET /api/whatsapp/qr`
Server-Sent Events para actualizaciones de QR en tiempo real

### `POST /api/whatsapp/send`
Enviar mensaje automáticamente
```json
{
  "phone": "1234567890",
  "message": "Hola desde Motopartes"
}
```

### `POST /api/whatsapp/disconnect`
Desconectar sesión de WhatsApp

## 📋 Checklist de Deployment

- [ ] Ejecutar migración SQL en Supabase
- [ ] Crear proyecto en Railway/Render
- [ ] Configurar variables de entorno en Railway
- [ ] Obtener URL del backend deployado
- [ ] Configurar `VITE_WHATSAPP_API_URL` en Vercel
- [ ] Redeploy frontend
- [ ] Probar vinculación de WhatsApp
- [ ] Probar envío automático de mensajes

## 💡 Uso en el Código

### Envío manual (WhatsApp Web)
```javascript
import { sendViaWhatsApp } from './utils/whatsappHelper';

sendViaWhatsApp(phone, message);
```

### Envío automático (backend si está conectado, sino WhatsApp Web)
```javascript
import { sendAutomatedMessage } from './utils/whatsappHelper';

const result = await sendAutomatedMessage(phone, message);
if (result.automated) {
  console.log('Mensaje enviado automáticamente');
} else {
  console.log('Abrió WhatsApp Web');
}
```

## 🆘 Soporte

Si encuentras problemas, revisa primero:
1. Logs del backend en Railway
2. Consola del navegador (F12)
3. Estado de conexión en `/admin/whatsapp`
4. Sección de Troubleshooting en `DEPLOYMENT_GUIDE.md`
