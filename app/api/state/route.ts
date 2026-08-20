import { env } from "cloudflare:workers";

async function ensureTable() {
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS app_state (id INTEGER PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL)").run();
}
export async function GET() {
  try { await ensureTable(); const row = await env.DB.prepare("SELECT payload FROM app_state WHERE id = 1").first<{payload:string}>(); return Response.json({ state: row ? JSON.parse(row.payload) : null }); }
  catch { return Response.json({ state: null }); }
}
export async function PUT(request: Request) {
  try { const body = await request.json() as {state:unknown}; await ensureTable(); await env.DB.prepare("INSERT INTO app_state (id,payload,updated_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, updated_at=excluded.updated_at").bind(JSON.stringify(body.state),new Date().toISOString()).run(); return Response.json({ok:true}); }
  catch { return Response.json({ok:false},{status:500}); }
}
