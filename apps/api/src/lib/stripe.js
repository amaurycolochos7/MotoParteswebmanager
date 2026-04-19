import Stripe from 'stripe';

// Singleton Stripe client. We instantiate lazily so the module can be imported
// by tests / the seed script without blowing up when STRIPE_SECRET_KEY is
// unset. In production STRIPE_SECRET_KEY must be set or any billing route
// will reject with a clear error.

let _stripe = null;

export function getStripe() {
    if (_stripe) return _stripe;
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error('STRIPE_SECRET_KEY env var is required for billing operations');
    }
    _stripe = new Stripe(key, {
        apiVersion: '2025-06-30.clover',
        appInfo: { name: 'motopartes-api', version: '1.0.0' },
    });
    return _stripe;
}

export function hasStripeKey() {
    return !!process.env.STRIPE_SECRET_KEY;
}

// The webhook signing secret, set separately (different from the API key).
// Stripe prefixes it with "whsec_".
export function getWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET || null;
}
