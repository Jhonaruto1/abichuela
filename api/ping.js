// Prueba de diagnóstico: responde de inmediato sin tocar Blob.
// Si /api/ping responde y /api/ranking no, el problema está en el
// código/ruta de Blob, no en la infraestructura de funciones de Vercel.
//
// Las funciones de Vercel usan Web Handler: se exportan los métodos
// HTTP por nombre (GET, POST) y se responde con Response. El estilo
// viejo (req, res) dejaba el GET funcionando pero los POST con cuerpo
// se colgaban, porque el stream de req ya venía consumido.
export function GET() {
  return Response.json(
    { ok: true, at: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
