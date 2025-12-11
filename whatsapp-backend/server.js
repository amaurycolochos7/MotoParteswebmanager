import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import express from 'express';
import cors from 'cors';
import QRCode from 'qrcode';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Supabase client
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));

app.use(express.json());

// WhatsApp client state
let client = null;
let qrCodeData = null;
let isReady = false;
let connectedPhone = null;
let qrListeners = [];

// Initialize WhatsApp client
function initializeClient() {
    console.log('🔄 Initializing WhatsApp client...');

    client = new Client({
        authStrategy: new LocalAuth({
            clientId: 'motopartes-whatsapp',
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ]
        }
    });

    // QR Code generation
    client.on('qr', async (qr) => {
        console.log('📱 QR Code received');
        try {
            qrCodeData = await QRCode.toDataURL(qr);

            // Notify all SSE listeners
            qrListeners.forEach(listener => {
                listener.write(`data: ${JSON.stringify({ type: 'qr', data: qrCodeData })}\n\n`);
            });

            // Update Supabase
            await updateSessionStatus(false, null);
        } catch (err) {
            console.error('Error generating QR:', err);
        }
    });

    // Client ready
    client.on('ready', async () => {
        console.log('✅ WhatsApp client is ready!');
        isReady = true;
        qrCodeData = null;

        const info = client.info;
        connectedPhone = info.wid.user;

        console.log(`📞 Connected to: ${connectedPhone}`);

        // Notify SSE listeners
        qrListeners.forEach(listener => {
            listener.write(`data: ${JSON.stringify({ type: 'ready', phone: connectedPhone })}\n\n`);
        });

        // Update Supabase
        await updateSessionStatus(true, connectedPhone);
    });

    // Authenticated
    client.on('authenticated', () => {
        console.log('🔐 Client authenticated');
    });

    // Auth failure
    client.on('auth_failure', async (msg) => {
        console.error('❌ Authentication failure:', msg);
        isReady = false;
        connectedPhone = null;
        await updateSessionStatus(false, null);
    });

    // Disconnected
    client.on('disconnected', async (reason) => {
        console.log('⚠️ Client disconnected:', reason);
        isReady = false;
        connectedPhone = null;
        qrCodeData = null;
        await updateSessionStatus(false, null);
    });

    // Initialize client
    client.initialize().catch(err => {
        console.error('Failed to initialize client:', err);
    });
}

// Update session status in Supabase
async function updateSessionStatus(connected, phone) {
    try {
        const sessionData = {
            is_connected: connected,
            phone_number: phone,
            last_heartbeat: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        if (connected) {
            sessionData.connected_at = new Date().toISOString();
            sessionData.disconnected_at = null;
        } else {
            sessionData.disconnected_at = new Date().toISOString();
        }

        // Check if session exists
        const { data: existing } = await supabase
            .from('whatsapp_sessions')
            .select('id')
            .limit(1)
            .single();

        if (existing) {
            // Update existing
            await supabase
                .from('whatsapp_sessions')
                .update(sessionData)
                .eq('id', existing.id);
        } else {
            // Insert new
            await supabase
                .from('whatsapp_sessions')
                .insert({
                    ...sessionData,
                    created_at: new Date().toISOString()
                });
        }
    } catch (error) {
        console.error('Error updating session status:', error);
    }
}

// Routes

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get connection status
app.get('/api/whatsapp/status', (req, res) => {
    res.json({
        connected: isReady,
        phone: connectedPhone,
        hasQR: !!qrCodeData
    });
});

// SSE endpoint for QR code updates
app.get('/api/whatsapp/qr', (req, res) => {
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial status
    if (isReady) {
        res.write(`data: ${JSON.stringify({ type: 'ready', phone: connectedPhone })}\n\n`);
    } else if (qrCodeData) {
        res.write(`data: ${JSON.stringify({ type: 'qr', data: qrCodeData })}\n\n`);
    } else {
        res.write(`data: ${JSON.stringify({ type: 'loading' })}\n\n`);
    }

    // Add to listeners
    qrListeners.push(res);

    // Remove listener on close
    req.on('close', () => {
        qrListeners = qrListeners.filter(listener => listener !== res);
    });
});

// Send message
app.post('/api/whatsapp/send', async (req, res) => {
    try {
        if (!isReady) {
            return res.status(503).json({
                success: false,
                error: 'WhatsApp is not connected'
            });
        }

        const { phone, message, media } = req.body;

        if (!phone || !message) {
            return res.status(400).json({
                success: false,
                error: 'Phone and message are required'
            });
        }

        // Format phone number (remove non-digits)
        let formattedPhone = phone.replace(/\D/g, '');

        // Add country code if not present (México celular = 521)
        if (!formattedPhone.startsWith('521') && formattedPhone.length === 10) {
            formattedPhone = '521' + formattedPhone;
            console.log(`📞 Agregado código de país para celular: ${formattedPhone}`);
        }

        // Add @c.us for WhatsApp format
        let chatId = `${formattedPhone}@c.us`;

        console.log(`📤 Preparando envío a ${chatId}`);

        // Try to get the proper WhatsApp ID for this number
        try {
            console.log(`🔍 Obteniendo ID de WhatsApp para el número...`);
            const numberId = await client.getNumberId(formattedPhone);

            if (numberId) {
                // Use the serialized ID which WhatsApp recognizes better
                chatId = numberId._serialized;
                console.log(`✅ ID de WhatsApp obtenido:`, chatId);
            } else {
                console.warn(`⚠️ Número no encontrado en WhatsApp o no existe chat previo`);
                return res.status(400).json({
                    success: false,
                    error: 'NO_CHAT_FOUND',
                    message: 'No existe un chat previo con este número. Envía un mensaje manual primero.',
                    phone: formattedPhone
                });
            }
        } catch (idError) {
            console.warn(`⚠️ Error al obtener ID: ${idError.message}`);
            return res.status(400).json({
                success: false,
                error: 'NO_CHAT_FOUND',
                message: 'No existe un chat previo con este número. Envía un mensaje manual primero.',
                phone: formattedPhone
            });
        }

        // Check if we need to send media (PDF)
        if (media && media.data) {
            console.log(`📎 Detectado archivo adjunto: ${media.filename}, tipo: ${media.mimetype}`);
            console.log(`📏 Tamaño base64: ${media.data.length} caracteres`);

            // Import MessageMedia
            const { MessageMedia } = pkg;

            // Create MessageMedia from base64
            const messageMedia = new MessageMedia(
                media.mimetype || 'application/pdf',
                media.data,
                media.filename || 'documento.pdf'
            );

            console.log(`💾 MessageMedia creado, enviando...`);

            // Send message with media
            await client.sendMessage(chatId, messageMedia, {
                caption: message
            });

            console.log(`✉️ Message with PDF sent to ${formattedPhone}`);
        } else {
            console.log(`📝 Enviando mensaje de texto simple a ${chatId}...`);
            // Send text message only
            await client.sendMessage(chatId, message);
            console.log(`✉️ Message sent to ${formattedPhone}`);
        }

        res.json({
            success: true,
            phone: formattedPhone
        });
    } catch (error) {
        console.error('❌ Error sending message:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Disconnect WhatsApp
app.post('/api/whatsapp/disconnect', async (req, res) => {
    try {
        if (client) {
            await client.logout();
            await client.destroy();
            client = null;
            isReady = false;
            connectedPhone = null;
            qrCodeData = null;

            await updateSessionStatus(false, null);

            // Reinitialize for new connection
            setTimeout(() => {
                initializeClient();
            }, 2000);

            res.json({ success: true });
        } else {
            res.json({ success: true, message: 'No active connection' });
        }
    } catch (error) {
        console.error('Error disconnecting:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 WhatsApp backend running on port ${PORT}`);
    console.log(`📡 CORS enabled for: ${allowedOrigins.join(', ')}`);

    // Initialize WhatsApp client
    initializeClient();

    // Heartbeat to Supabase every 30 seconds
    setInterval(async () => {
        if (isReady) {
            await updateSessionStatus(true, connectedPhone);
        }
    }, 30000);
});
