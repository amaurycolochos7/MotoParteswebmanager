// Pure, DB-free search logic for clients. Kept separate from the route so it
// can be unit-tested without a Postgres instance (see test/client-search.test.js).
//
// ELIHU's #1 ask: "buscar clientes por nombre" — partial, case/accent-insensitive,
// while keeping the existing phone lookup working. We also match motorcycle
// plates when the relation is loaded.
//
// ponytail: we build a Prisma `where` for the cheap DB-side filter (name/phone
// contains, insensitive) and additionally expose `matchesClient` for accent-
// insensitive ranking/refinement in JS, because Postgres `mode:'insensitive'`
// handles case but NOT accents (á vs a). Upgrade path: a Postgres `unaccent`
// expression index if this ever gets slow.

/** Strip accents and lowercase. Safe on null/undefined. */
export function normalize(str) {
    if (str == null) return '';
    return String(str)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // combining diacritics
        .toLowerCase()
        .trim();
}

/** Keep only digits — used to compare phone numbers regardless of formatting. */
export function digitsOnly(str) {
    return String(str ?? '').replace(/\D/g, '');
}

/**
 * Build a Prisma `where` clause for a client search query, scoped to a
 * workspace. Returns null when the query is too short to search (caller should
 * then fall back to the full list or an empty result).
 *
 * Matches: full_name (contains, insensitive), phone (digits contains),
 * and motorcycle plates (contains, insensitive).
 */
export function buildClientSearchWhere(rawQuery, { minLength = 2 } = {}) {
    const q = (rawQuery ?? '').trim();
    if (q.length < minLength) return null;

    const digits = digitsOnly(q);
    const or = [
        { full_name: { contains: q, mode: 'insensitive' } },
    ];

    // Only add a phone clause when the query actually contains digits, so a
    // name like "Ana" doesn't match an empty digit string (which `contains: ''`
    // would treat as "match everything").
    if (digits.length > 0) {
        or.push({ phone: { contains: digits } });
    }

    // Plates live on the related Motorcycle. `some` keeps it a single query.
    or.push({ motorcycles: { some: { plates: { contains: q, mode: 'insensitive' } } } });

    return { OR: or };
}

/**
 * Accent-insensitive client match used to refine/rank DB results in JS.
 * `client` is expected to optionally carry a `motorcycles` array.
 */
export function matchesClient(client, rawQuery) {
    const q = normalize(rawQuery);
    if (!q) return true;
    const qDigits = digitsOnly(rawQuery);

    if (normalize(client.full_name).includes(q)) return true;
    if (qDigits.length > 0 && digitsOnly(client.phone).includes(qDigits)) return true;
    if (Array.isArray(client.motorcycles)) {
        for (const m of client.motorcycles) {
            if (normalize(m.plates).includes(q)) return true;
            if (normalize(`${m.brand} ${m.model}`).includes(q)) return true;
        }
    }
    return false;
}

/**
 * Rank score for ordering results: exact name match > prefix > contains >
 * plate/other. Higher is better. Pure function, easy to test.
 */
export function rankScore(client, rawQuery) {
    const q = normalize(rawQuery);
    const name = normalize(client.full_name);
    if (!q) return 0;
    if (name === q) return 100;
    if (name.startsWith(q)) return 80;
    if (name.includes(q)) return 60;
    const qDigits = digitsOnly(rawQuery);
    if (qDigits.length > 0 && digitsOnly(client.phone).includes(qDigits)) return 40;
    return 10;
}
