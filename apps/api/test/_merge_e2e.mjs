// Fusión de conversaciones duplicadas (mismo wa_chat_id) sin perder mensajes. Contra la BD local.
//   cd apps/api && DATABASE_URL=... node test/_merge_e2e.mjs
import assert from 'node:assert/strict';
import prisma from '../src/lib/prisma.js';
import { mergeDuplicateConversations } from '../src/lib/wa-inbox.js';

const ws = await prisma.workspace.findFirst({ where: { whatsapp_session_profile_id: { not: null } }, select: { id: true } });
const CHAT = '555000111222333@lid';
let pass = 0; const ok = (c, m) => { assert.ok(c, m); pass += 1; console.log('  PASS ', m); };
const clean = async () => {
  const cs = await prisma.waConversation.findMany({ where: { workspace_id: ws.id, wa_chat_id: CHAT } });
  for (const c of cs) { await prisma.waMessage.deleteMany({ where: { conversation_id: c.id } }); await prisma.waConversation.delete({ where: { id: c.id } }); }
};
await clean();

const real = await prisma.waConversation.create({ data: { workspace_id: ws.id, phone: '9958880001', wa_chat_id: CHAT, display_name: null, unread_count: 1 } });
const fake = await prisma.waConversation.create({ data: { workspace_id: ws.id, phone: '555000111222333', wa_chat_id: CHAT, display_name: 'Rosa Duplicada', unread_count: 2 } });
const mk = (conv, i, at) => prisma.waMessage.create({ data: { workspace_id: ws.id, conversation_id: conv.id, wa_message_id: `mrg-${i}`, direction: i % 2 ? 'in' : 'out', origin: i % 2 ? 'client' : 'phone', body: `mensaje ${i}`, status: 'sent', created_at: new Date(at) } });
await mk(real, 1, '2026-10-01T10:00:00Z'); await mk(real, 2, '2026-10-01T10:05:00Z');
await mk(fake, 3, '2026-10-02T09:00:00Z'); await mk(fake, 4, '2026-10-03T09:00:00Z'); await mk(fake, 5, '2026-10-04T09:00:00Z');

console.log('== fusión');
const n = await mergeDuplicateConversations(ws.id);
ok(n === 1, 'fusiona 1 duplicada');
const left = await prisma.waConversation.findMany({ where: { workspace_id: ws.id, wa_chat_id: CHAT } });
ok(left.length === 1, 'queda una sola conversación');
ok(left[0].phone === '9958880001', 'se conserva la que tiene el teléfono real');
ok(left[0].display_name === 'Rosa Duplicada', 'hereda el nombre de la otra');
ok(left[0].unread_count === 3, 'suma los no leídos (1 + 2)');
ok((await prisma.waMessage.count({ where: { conversation_id: left[0].id } })) === 5, 'conserva los 5 mensajes de ambas');
ok(left[0].last_message_preview === 'mensaje 5', 'el último mensaje es el más reciente');
console.log('== idempotente');
ok((await mergeDuplicateConversations(ws.id)) === 0, 'una segunda corrida no hace nada');

await clean(); await prisma.$disconnect();
console.log(`\n${pass} PASS, 0 FAIL`);
