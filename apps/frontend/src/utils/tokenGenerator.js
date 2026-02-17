import { nanoid } from 'nanoid';

/**
 * Generate a unique public token for client portal access
 * @returns {string} - 16 character unique token
 */
export const generatePublicToken = () => {
    return nanoid(16);
};

/**
 * Generate client portal link with token
 * @param {string} token - Public token
 * @returns {string} - Full URL to client portal
 */
export const generateClientLink = (token) => {
    const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;
    return `${baseUrl}/orden/${token}`;
};

/**
 * Calculate link expiration date (7 days from delivery)
 * @param {Date} deliveryDate - Date when order was delivered
 * @returns {Date} - Expiration date
 */
export const calculateLinkExpiration = (deliveryDate) => {
    const expirationDate = new Date(deliveryDate);
    expirationDate.setDate(expirationDate.getDate() + 7);
    return expirationDate;
};

/**
 * Check if a link has expired
 * @param {string|Date} expirationDate - Link expiration date
 * @returns {boolean} - True if expired
 */
export const isLinkExpired = (expirationDate) => {
    if (!expirationDate) return false;
    return new Date() > new Date(expirationDate);
};
