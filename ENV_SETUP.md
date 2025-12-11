# Environment Variables Template

## Frontend (.env in root)
```env
# Supabase
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# WhatsApp API Backend URL
VITE_WHATSAPP_API_URL=http://localhost:3001
# For production, change to your Railway/Render URL:
# VITE_WHATSAPP_API_URL=https://your-whatsapp-backend.railway.app
```

## Backend (whatsapp-backend/.env)
```env
PORT=3001
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
ALLOWED_ORIGINS=http://localhost:5173,https://your-vercel-app.vercel.app
```

## Setup Instructions

1. Create `.env` file in project root (for frontend)
2. Create `.env` file in `whatsapp-backend/` directory
3. Copy the values from your Supabase dashboard
4. Update `ALLOWED_ORIGINS` with your production Vercel URL when deploying
