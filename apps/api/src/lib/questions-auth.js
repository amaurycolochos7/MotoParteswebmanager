// ============================================================================
// MotoPartes Questions — autenticación por PIN (aislada del login principal)
// ----------------------------------------------------------------------------
// - Los PINs viven SOLO en variables de entorno (como JWT_SECRET). Nunca en la
//   base de datos en texto plano, nunca en logs, nunca en respuestas del API.
// - La comparación es de tiempo constante (crypto.timingSafeEqual sobre el
//   digest SHA-256) para no filtrar información por longitud ni por timing.
// - Se emite un JWT con scope 'questions' independiente; no toca middleware/auth.
// ============================================================================

import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'motopartes-secret-key-change-in-production';
const TOKEN_TTL = process.env.MOTOPARTES_QUESTIONS_TOKEN_TTL || '3h';
const SCOPE = 'questions';

export const PARTICIPANTS = {
  ELIHU: { key: 'ELIHU', display_name: 'ELIHU' },
  MACIEL: { key: 'MACIEL', display_name: 'MACIEL' },
};

// Comparación de tiempo constante. Hashea ambos lados a un buffer de 32 bytes
// para que timingSafeEqual reciba longitudes iguales aunque los PINs difieran.
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length === 0 || b.length === 0) {
    return false;
  }
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// Devuelve la configuración de PINs desde el entorno. Un PIN vacío/no definido
// deshabilita ese acceso (no hay defaults inseguros).
function pinConfig() {
  return {
    ELIHU: process.env.MOTOPARTES_QUESTIONS_ELIHU_PIN || '',
    MACIEL: process.env.MOTOPARTES_QUESTIONS_MACIEL_PIN || '',
    ADMIN: process.env.MOTOPARTES_QUESTIONS_ADMIN_PIN || '',
  };
}

// true si al menos un PIN está configurado (módulo operativo).
export function isConfigured() {
  const c = pinConfig();
  return !!(c.ELIHU || c.MACIEL || c.ADMIN);
}

// Resuelve un PIN a {role, participant}. Evalúa SIEMPRE las tres comparaciones
// (sin cortocircuito) para no dar pistas por timing sobre cuál coincidió.
// Devuelve null si no coincide ninguno.
export function matchPin(pin) {
  const c = pinConfig();
  const isElihu = c.ELIHU ? safeEqual(pin, c.ELIHU) : false;
  const isMaciel = c.MACIEL ? safeEqual(pin, c.MACIEL) : false;
  const isAdmin = c.ADMIN ? safeEqual(pin, c.ADMIN) : false;

  if (isAdmin) return { role: 'admin', participant: null };
  if (isElihu) return { role: 'participant', participant: 'ELIHU' };
  if (isMaciel) return { role: 'participant', participant: 'MACIEL' };
  return null;
}

export function signQuestionsToken({ role, participant }) {
  return jwt.sign({ scope: SCOPE, role, participant: participant || null }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

export function verifyQuestionsToken(token) {
  const payload = jwt.verify(token, JWT_SECRET);
  if (payload.scope !== SCOPE) {
    throw new Error('Token fuera de scope');
  }
  return payload;
}

export default { PARTICIPANTS, isConfigured, matchPin, signQuestionsToken, verifyQuestionsToken };
