# Abichuela el Juego — versión pública con ranking (Vercel)

Juego completo copiado de la versión publicada en GitHub Pages (mismo
`index.html`, mismos `assets/`), más ranking compartido con servidor.

## Qué cambia respecto a GitHub Pages

- **Nombre obligatorio:** el botón JUGAR empieza bloqueado. Cada jugador tiene
  que escribir su apodo y tocar **Usar este apodo**; el apodo se reclama en el
  servidor con una clave secreta guardada en ese celular (`localStorage`
  `abichuela-device`). Si el apodo ya lo tiene otro jugador, el servidor
  responde 409 y toca elegir otro. **Cambiar mi apodo** mueve el mismo
  renglón (conserva récord y partidas) si el nombre nuevo está libre.
- **Ranking compartido:** botón **🏆 RANKING** en el menú; consulta
  `GET /api/ranking` y muestra el top 20 ordenado, con tu renglón marcado
  y tu lugar. Al terminar cada partida se envía el puntaje con
  `POST /api/ranking` (`action: "submit"`); si no hay conexión, el récord
  queda guardado solo en el celular y se avisa en la pantalla de fin.
- Lo demás queda igual: fondo de Guadalajara, cara de la amiga, tuberías
  con tierra, 3 poderes de 10 s, un ítem aleatorio cada 15 tuberías
  (corregido desde los 4-6 del paquete base, que era la versión vieja),
  tonito chiptune y cámara de reacción.
- **Modo local si no hay servidor:** si `/api/ranking` no existe (por
  ejemplo, este mismo archivo servido desde GitHub Pages), el nombre se
  exige igual antes de jugar, pero queda guardado solo en el celular y se
  avisa que el ranking compartido está en la versión de Vercel. Así el
  juego nunca queda bloqueado por falta de servidor.

## Archivos

- `index.html` — juego + ranking (frontend).
- `assets/` — `cara-amiga-pixel.png`, `cara-amiga.png`, `fondo-gdl.png`.
- `api/ranking.js` — función serverless (Node, ESM) con Vercel Blob.
- `package.json` — solo depende de `@vercel/blob`.

## Despliegue en Vercel (desde el repo de GitHub)

1. Sube esta carpeta al repo `Jhonaruto1/abichuela` (o a un repo nuevo) y
   crea el proyecto en Vercel importándolo desde GitHub.
2. En el proyecto de Vercel: **Storage → Create → Blob** y vincúlalo al
   proyecto. Eso crea la variable `BLOB_READ_WRITE_TOKEN` (sin esa
   variable la API responde 500 "El ranking no está configurado").
3. Despliega. El ranking vive en el archivo público `ranking.json` del
   Blob store; la primera vez la lista está vacía y se llena al jugar.

## Desarrollo local

```bash
npm install
npx vercel dev   # sirve index.html y /api/ranking con el token de tu .env.local
```

Sin `BLOB_READ_WRITE_TOKEN` la página carga y el botón JUGAR queda
bloqueado hasta reclamar un apodo; si el reclamo falla porque el servidor
no está configurado, el juego entra en modo local (nombre obligatorio,
récord solo en el celular) en lugar de quedarse bloqueado.
