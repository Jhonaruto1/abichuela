// Prueba de diagnóstico: responde de inmediato sin tocar Blob.
// Si /api/ping responde y /api/ranking no, el problema está en el
// código/ruta de Blob, no en la infraestructura de funciones de Vercel.
//
// OJO: en el runtime Node de Vercel el handler es (req, res) => void.
// Devolver un Response se ignora y la invocación se cuelga 300 s.
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, at: new Date().toISOString() });
}
