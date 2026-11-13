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

import { put, list } from '@vercel/blob';

const KEY = 'ranking.json';
const MAX_ENTRIES = 200;
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

// El token se pasa explícito en cada llamada al SDK para que no use la
// ruta OIDC (VERCEL_OIDC_TOKEN + BLOB_STORE_ID).
// Además, cada operación de Blob lleva un límite duro de 8 s: si el
// almacén no responde, la función devuelve 500 rápido en vez de
// colgarse hasta el límite de 300 s del runtime.
//
// OJO (2026-11-12): el cuelgue de 300 s NO era el Blob ni el OIDC.
// Los Runtime Logs mostraron "WARN: default export returned a Response":
// en el runtime Node de Vercel el handler es (req, res) => void y un
// Response devuelto se ignora, así que res nunca se cerraba. Por eso
// todas las respuestas salen por res.status().json().
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Tiempo agotado: ' + label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function json(res, status, obj) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(obj);
}

// Vercel ya parsea el cuerpo JSON cuando el Content-Type es
// application/json (req.body es el objeto). Si llega como texto o
// stream, se lee a mano.
function readBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body !== undefined) {
      if (typeof req.body === 'string') {
        try {
          resolve(JSON.parse(req.body));
        } catch (e) {
          reject(e);
        }
      } else {
        resolve(req.body || {});
      }
      return;
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
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

export default async function handler(req, res) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return json(res, 500, { error: 'El ranking no está configurado en el servidor.' });
  }

  try {
    if (req.method === 'GET') {
      const entries = await loadEntries();
      return json(res, 200, publicList(entries));
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Método no permitido.' });
    }

    let body = {};
    try {
      body = await readBody(req);
    } catch {
      return json(res, 400, { error: 'El cuerpo tiene que ser JSON.' });
    }

    const action = body.action;

    if (action === 'list') {
      const entries = await loadEntries();
      return json(res, 200, publicList(entries));
    }

    if (action === 'claim') {
      const name = normName(body.name);
      const token = body.token;
      if (!validName(name)) {
        return json(res, 400, { error: 'El apodo tiene que tener entre 1 y 24 caracteres.' });
      }
      if (!validToken(token)) {
        return json(res, 400, { error: 'Falta la clave del dispositivo.' });
      }
      const entries = await loadEntries();
      const key = name.toLowerCase();
      const existing = entries.find((e) => e.key === key);
      if (existing) {
        if (existing.token !== token) {
          return json(res, 409, { error: 'Ese apodo ya lo tiene otro jugador.' });
        }
        // Reclamo idempotente: el mismo celular vuelve a confirmar su apodo.
        return json(res, 200, { ok: true, name: existing.name });
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
      return json(res, 200, { ok: true, name });
    }

    if (action === 'submit') {
      const name = normName(body.name);
      const token = body.token;
      const score = body.score;
      if (!validName(name)) {
        return json(res, 400, { error: 'El apodo tiene que tener entre 1 y 24 caracteres.' });
      }
      if (!validToken(token)) {
        return json(res, 400, { error: 'Falta la clave del dispositivo.' });
      }
      if (!validScore(score)) {
        return json(res, 400, { error: 'El puntaje no es válido.' });
      }
      const entries = await loadEntries();
      const entry = entries.find((e) => e.key === name.toLowerCase());
      if (!entry || entry.token !== token) {
        return json(res, 403, { error: 'Ese apodo no está reclamado por este dispositivo.' });
      }
      entry.best = Math.max(entry.best, score);
      entry.games += 1;
      entry.updatedAt = Date.now();
      await saveEntries(entries);
      const sorted = sortEntries(entries);
      const rank = sorted.findIndex((e) => e.key === entry.key) + 1;
      return json(res, 200, { ok: true, best: entry.best, rank });
    }

    if (action === 'rename') {
      const newName = normName(body.newName);
      const token = body.token;
      if (!validName(newName)) {
        return json(res, 400, { error: 'El apodo nuevo tiene que tener entre 1 y 24 caracteres.' });
      }
      if (!validToken(token)) {
        return json(res, 400, { error: 'Falta la clave del dispositivo.' });
      }
      const entries = await loadEntries();
      const entry = entries.find((e) => e.token === token);
      if (!entry) {
        return json(res, 403, { error: 'Este dispositivo todavía no tiene apodo reclamado.' });
      }
      const newKey = newName.toLowerCase();
      const taken = entries.find((e) => e.key === newKey && e.token !== token);
      if (taken) {
        return json(res, 409, { error: 'Ese apodo ya lo tiene otro jugador.' });
      }
      entry.name = newName;
      entry.key = newKey;
      entry.updatedAt = Date.now();
      await saveEntries(entries);
      return json(res, 200, { ok: true, name: newName });
    }

    return json(res, 400, { error: 'Acción no válida.' });
  } catch (err) {
    console.error('ranking error:', err);
    return json(res, 500, { error: 'No se pudo guardar el ranking. Inténtalo de nuevo.' });
  }
}
