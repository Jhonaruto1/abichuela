# Abichuela el Juego — build para GitHub/Vercel

Build estático del juego (React, compilado con Bun) + funciones serverless
de `/api`. Es la versión completa que hoy vive en el artefacto de Muse,
portada para publicarse desde el repo de GitHub en Vercel.

## Contenido

- `index.html` + `assets/` — el juego compilado (menú, ranking, ciclo de día,
  monedas, estilos, logros, reto diario, poderes, música).
- `api/ranking.js` — ranking compartido en Vercel Blob (`GET /api/ranking`,
  `POST {action: 'claim'|'submit'|'rename'}`). Sin cambios respecto a la
  versión que ya funciona en producción.
- `api/ping.js` — diagnóstico simple del servidor (no toca el ranking).
- `package.json` / `package-lock.json` — solo `@vercel/blob` (lo que usan
  las funciones) y Node 22.x.

## Qué trae esta versión

- Ciclo de día: día → 3 atardeceres → 3 noches → día, con fundido de ~2.5 s.
  El fondo cambia **cada 15 tuberías** (`?fondoCada=N` lo cambia para pruebas,
  1..100).
- Monedas entre tuberías, estilos Clásico / Dorado (100) / Neón (250),
  5 logros, reto diario con +20 monedas, botón compartir récord.
- Luciérnagas y estrellas fugaces de noche; menú compacto con caritas de
  dificultad (😊😐😡) y cajita de logros con scroll interno.
- Poderes de 10 s, ítem aleatorio cada 15 tuberías, dificultades y música
  8-bit. Todo el estado local (monedas, estilos, logros, reto) se guarda en
  el celular; el ranking compartido vive en Vercel Blob.

## Despliegue

Publicar esta carpeta como raíz del proyecto en Vercel (o copiar su
contenido al repo `Jhonaruto1/abichuela`, rama main). Requiere la variable
`BLOB_READ_WRITE_TOKEN`, que se crea sola al vincular el Blob store
`abichuela-ranking` al proyecto (Storage → Blob). Sin ella, `/api/ranking`
responde 500 y el juego sigue en modo local.

## Reconstruir

El código fuente del puerto está en `src/` (junto a esta carpeta):
`bun install && bun ./client/build.mjs` genera `src/client/dist/`, del que
salen `index.html` + `assets/` de aquí.
