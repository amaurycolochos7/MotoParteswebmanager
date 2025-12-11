# WhatsApp Backend Service

Backend service for managing WhatsApp integration with Motopartes Manager.

## Features

- 📱 WhatsApp Web connection via QR code
- 🔄 Real-time QR code updates (Server-Sent Events)
- ✉️ Automated message sending
- 💾 Session persistence with Supabase
- 🔌 RESTful API endpoints

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Configure environment variables:
```env
PORT=3001
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
ALLOWED_ORIGINS=http://localhost:5173,https://your-app.vercel.app
```

4. Run the server:
```bash
npm start
```

## API Endpoints

### `GET /api/health`
Health check endpoint.

### `GET /api/whatsapp/status`
Get current WhatsApp connection status.

Response:
```json
{
  "connected": true,
  "phone": "1234567890",
  "hasQR": false
}
```

### `GET /api/whatsapp/qr`
Server-Sent Events endpoint for real-time QR code updates.

Events:
- `loading` - Client is initializing
- `qr` - QR code available (base64 data URL)
- `ready` - WhatsApp connected

### `POST /api/whatsapp/send`
Send a WhatsApp message.

Request:
```json
{
  "phone": "1234567890",
  "message": "Hello from Motopartes!"
}
```

### `POST /api/whatsapp/disconnect`
Disconnect current WhatsApp session.

## Deployment

### Railway

1. Create new project on [Railway](https://railway.app)
2. Connect GitHub repository
3. Set environment variables
4. Deploy

### Render

1. Create new Web Service on [Render](https://render.com)
2. Connect GitHub repository
3. Set environment variables
4. Deploy

## Database Schema

Required Supabase table:

```sql
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number TEXT,
  is_connected BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ,
  disconnected_at TIMESTAMPTZ,
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
