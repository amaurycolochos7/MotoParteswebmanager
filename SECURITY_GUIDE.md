# 🔐 Guía de Seguridad - Motopartes Manager

## ⚠️ IMPORTANTE: Credenciales Expuestas

Las credenciales de Supabase fueron expuestas anteriormente en el historial de Git. 

### Acción Requerida:

1. **Regenerar API Keys de Supabase** (OBLIGATORIO)
   - Ve a: https://supabase.com/dashboard
   - Selecciona tu proyecto
   - Ve a **Settings → API**
   - Haz clic en **Regenerate** en la sección de API Keys
   - Copia las nuevas keys

2. **Actualizar tus archivos .env locales**
   - Abre `.env.development` y actualiza con las nuevas keys
   - Abre `.env.production` si lo usas

---

## 📁 Estructura de Archivos de Entorno

| Archivo | Propósito | ¿Subir a Git? |
|---------|-----------|---------------|
| `.env.example` | Plantilla con placeholders | ✅ SÍ |
| `.env` | Credenciales locales | ❌ NO |
| `.env.development` | Credenciales desarrollo | ❌ NO |
| `.env.production` | Credenciales producción | ❌ NO |
| `.env.local` | Override local | ❌ NO |

---

## 🚀 Configuración para Deploy

### En Vercel:
1. Ve a tu proyecto en Vercel Dashboard
2. Settings → Environment Variables
3. Agrega:
   - `VITE_SUPABASE_URL` = tu URL de Supabase
   - `VITE_SUPABASE_ANON_KEY` = tu Anon Key de Supabase

### En Netlify:
1. Site settings → Build & deploy → Environment
2. Agrega las mismas variables

---

## 🔒 Buenas Prácticas

1. **NUNCA** commitear archivos `.env` con credenciales reales
2. **SIEMPRE** usar variables de entorno en el servidor de producción
3. **REGENERAR** las keys si sospechas que fueron expuestas
4. **REVISAR** el `.gitignore` antes de hacer push a un nuevo repositorio

---

## ✅ Estado Actual

- [x] `.gitignore` actualizado para ignorar todos los `.env.*`
- [x] Archivos sensibles removidos del índice de Git
- [x] `.env.example` creado con placeholders seguros
- [ ] **PENDIENTE:** Regenerar API Keys en Supabase Dashboard

---

*Última actualización: Diciembre 2024*
