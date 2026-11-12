// Prueba de diagnóstico: responde de inmediato sin tocar Blob.
// Si /api/ping responde y /api/ranking no, el problema está en el
// código/ruta de Blob, no en la infraestructura de funciones de Vercel.
export default async function handler() {
  return new Response(JSON.stringify({ ok: true, at: new Date().toISOString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
