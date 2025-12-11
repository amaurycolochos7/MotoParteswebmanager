const WHATSAPP_API_URL = import.meta.env.VITE_WHATSAPP_API_URL || 'http://localhost:3001';

/**
 * Get WhatsApp connection status
 * @returns {Promise<{connected: boolean, phone: string|null, hasQR: boolean}>}
 */
export async function getConnectionStatus() {
    try {
        console.log('[WhatsApp] Consultando estado en:', `${WHATSAPP_API_URL}/api/whatsapp/status`);
        const response = await fetch(`${WHATSAPP_API_URL}/api/whatsapp/status`);
        if (!response.ok) throw new Error('Failed to get status');
        const data = await response.json();
        console.log('[WhatsApp] Estado recibido:', data);
        return data;
    } catch (error) {
        console.error('[WhatsApp] Error getting status:', error);
        return { connected: false, phone: null, hasQR: false };
    }
}

/**
 * Subscribe to QR code updates via Server-Sent Events
 * @param {Function} onUpdate - Callback function(event)
 *   event.type: 'loading' | 'qr' | 'ready'
 *   event.data: QR code data URL (if type === 'qr')
 *   event.phone: Connected phone number (if type === 'ready')
 * @returns {EventSource} - EventSource instance
 */
export function subscribeToQR(onUpdate) {
    const eventSource = new EventSource(`${WHATSAPP_API_URL}/api/whatsapp/qr`);

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            onUpdate(data);
        } catch (error) {
            console.error('Error parsing SSE data:', error);
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        eventSource.close();
        onUpdate({ type: 'error' });
    };

    return eventSource;
}

/**
 * Send WhatsApp message via backend
 * @param {string} phone - Phone number
 * @param {string} message - Message to send
 * @param {Object} media - Optional media object { data: base64, mimetype: string, filename: string }
 * @returns {Promise<{success: boolean, phone?: string, error?: string}>}
 */
export async function sendMessage(phone, message, media = null) {
    try {
        const body = { phone, message };

        // Add media if provided
        if (media) {
            body.media = media;
        }

        const response = await fetch(`${WHATSAPP_API_URL}/api/whatsapp/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const data = await response.json();

        if (!response.ok) {
            // Return error with code if available
            return {
                success: false,
                error: data.error || 'Failed to send message',
                errorCode: data.error, // NO_CHAT_FOUND or other error codes
                message: data.message,
                phone: data.phone
            };
        }

        return data;
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}

/**
 * Disconnect WhatsApp session
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function disconnect() {
    try {
        const response = await fetch(`${WHATSAPP_API_URL}/api/whatsapp/disconnect`, {
            method: 'POST',
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to disconnect');
        }

        return data;
    } catch (error) {
        console.error('Error disconnecting WhatsApp:', error);
        return {
            success: false,
            error: error.message,
        };
    }
}
