// Ranking compartido de "Abichuela el Juego" en Vercel Blob.
//
// Guarda un solo archivo público, ranking.json, con esta forma:
//   [{ name, key, token, best, games, updatedAt }]
// - name: apodo tal como lo escribió el jugador (1-24 caracteres).
// - key: apodo en minúsculas, para que "Jhonaruto1" y "jhonaruto1" sean el mismo.
// - token: clave secreta del celular que reclamó el apodo (nunca se devuelve
//   en las respuestas; solo se usa para comprobar que quien puntúa o renombra
//   es el dueño del apodo).
// - best: mejor puntaje. games: partidas jugadas con ese apodo.
//
// Necesita la variable de entorno BLOB_READ_WRITE_TOKEN (se crea sola al
// vincular un Blob store en el proyecto de Vercel: Storage -> Create -> Blob).
// Sin esa variable todas las rutas devuelven 500 con un mensaje en español.
//
// Las funciones de Vercel usan Web Handler: se exportan los métodos HTTP
// por nombre (GET, POST) y se responde con Response. El primer intento
// usó `export default` devolviendo Response (el runtime lo ignoraba y la
// función se colgaba 300 s) y el segundo usó el estilo viejo (req, res):
// el GET funcionaba pero los POST con cuerpo se colgaban porque el
// stream de req ya venía consumido por el runtime. Con GET/POST por
// nombre el cuerpo se lee con request.json() y todo responde en ~1 s.

import { put, list } from '@vercel/blob';

const KEY = 'ranking.json';
const MAX_ENTRIES = 200;
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// El token se pasa explícito en cada llamada al SDK para que no use la
// ruta OIDC (VERCEL_OIDC_TOKEN + BLOB_STORE_ID).
// Además, cada operación de Blob lleva un límite duro de 8 s: si el
// almacén no responde, la función devuelve 500 rápido en vez de
// colgarse hasta el límite de 300 s del runtime.
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Tiempo agotado: ' + label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function json(status, obj) {
  return Response.json(obj, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function normName(value) {
  return String(value ?? '').trim().slice(0, 24);
}

function validName(name) {
  // 1-24 caracteres, sin caracteres de control.
  return name.length >= 1 && name.length <= 24 && !/[\u0000-\u001f\u007f]/.test(name);
}

function validToken(token) {
  return typeof token === 'string' && token.length >= 1 && token.length <= 128;
}

function validScore(score) {
  return Number.isInteger(score) && score >= 0 && score <= 10000;
}

function sortEntries(entries) {
  return [...entries].sort((a, b) => b.best - a.best || a.updatedAt - b.updatedAt);
}

async function loadEntries() {
  const { blobs } = await withTimeout(
    list({ prefix: KEY, limit: 10, token: TOKEN }),
    8000,
    'list',
  );
  const blob = blobs.find((b) => b.pathname === KEY);
  if (!blob) return [];
  const res = await fetch(blob.url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data.filter(
    (e) =>
      e &&
      typeof e.name === 'string' &&
      typeof e.key === 'string' &&
      typeof e.token === 'string' &&
      Number.isInteger(e.best) &&
      Number.isInteger(e.games),
  );
}

async function saveEntries(entries) {
  await withTimeout(
    put(KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)), {
      access: 'public',
      contentType: 'application/json',
      addRandomSuffix: false,
      token: TOKEN,
    }),
    8000,
    'put',
  );
}

function publicList(entries) {
  const sorted = sortEntries(entries);
  return {
    entries: sorted.slice(0, 20).map((e) => ({ name: e.name, best: e.best, games: e.games })),
    total: sorted.length,
  };
}

function tokenConfigured() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

export async function GET() {
  if (!tokenConfigured()) {
    return json(500, { error: 'El ranking no está configurado en el servidor.' });
  }
  try {
    const entries = await loadEntries();
    return json(200, publicList(entries));
  } catch (err) {
    console.error('ranking error:', err);
    return json(500, { error: 'No se pudo leer el ranking. Inténtalo de nuevo.' });
  }
}

export async function POST(request) {
  if (!tokenConfigured()) {
    return json(500, { error: 'El ranking no está configurado en el servidor.' });
  }
  let body = {};
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'El cuerpo tiene que ser JSON.' });
  }
  try {
    return await handleAction(body);
  } catch (err) {
    console.error('ranking error:', err);
    return json(500, { error: 'No se pudo guardar el ranking. Inténtalo de nuevo.' });
  }
}

async function handleAction(body) {
  const action = body.action;

  if (action === 'list') {
    const entries = await loadEntries();
    return json(200, publicList(entries));
  }

  if (action === 'claim') {
    const name = normName(body.name);
    const token = body.token;
    if (!validName(name)) {
      return json(400, { error: 'El apodo tiene que tener entre 1 y 24 caracteres.' });
    }
    if (!validToken(token)) {
      return json(400, { error: 'Falta la clave del dispositivo.' });
    }
    const entries = await loadEntries();
    const key = name.toLowerCase();
    const existing = entries.find((e) => e.key === key);
    if (existing) {
      if (existing.token !== token) {
        return json(409, { error: 'Ese apodo ya lo tiene otro jugador.' });
      }
      // Reclamo idempotente: el mismo celular vuelve a confirmar su apodo.
      return json(200, { ok: true, name: existing.name });
    }
    entries.push({
      name,
      key,
      token,
      best: 0,
      games: 0,
      updatedAt: Date.now(),
    });
    await saveEntries(entries);
    return json(200, { ok: true, name });
  }

  if (action === 'submit') {
    const name = normName(body.name);
    const token = body.token;
    const score = body.score;
    if (!validName(name)) {
      return json(400, { error: 'El apodo tiene que tener entre 1 y 24 caracteres.' });
    }
    if (!validToken(token)) {
      return json(400, { error: 'Falta la clave del dispositivo.' });
    }
    if (!validScore(score)) {
      return json(400, { error: 'El puntaje no es válido.' });
    }
    const entries = await loadEntries();
    const entry = entries.find((e) => e.key === name.toLowerCase());
    if (!entry || entry.token !== token) {
      return json(403, { error: 'Ese apodo no está reclamado por este dispositivo.' });
    }
    entry.best = Math.max(entry.best, score);
    entry.games += 1;
    entry.updatedAt = Date.now();
    await saveEntries(entries);
    const sorted = sortEntries(entries);
    const rank = sorted.findIndex((e) => e.key === entry.key) + 1;
    return json(200, { ok: true, best: entry.best, rank });
  }

  if (action === 'rename') {
    const newName = normName(body.newName);
    const token = body.token;
    if (!validName(newName)) {
      return json(400, { error: 'El apodo nuevo tiene que tener entre 1 y 24 caracteres.' });
    }
    if (!validToken(token)) {
      return json(400, { error: 'Falta la clave del dispositivo.' });
    }
    const entries = await loadEntries();
    const entry = entries.find((e) => e.token === token);
    if (!entry) {
      return json(403, { error: 'Este dispositivo todavía no tiene apodo reclamado.' });
    }
    const newKey = newName.toLowerCase();
    const taken = entries.find((e) => e.key === newKey && e.token !== token);
    if (taken) {
      return json(409, { error: 'Ese apodo ya lo tiene otro jugador.' });
    }
    entry.name = newName;
    entry.key = newKey;
    entry.updatedAt = Date.now();
    await saveEntries(entries);
    return json(200, { ok: true, name: newName });
  }

  return json(400, { error: 'Acción no válida.' });
}
