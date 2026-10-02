import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return neon(url);
}

function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(JSON.stringify(body));
}

async function ensureTable(sql: any) {
  await sql`CREATE TABLE IF NOT EXISTS dj_custom_announcements (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL
  )`;
  await sql`CREATE INDEX IF NOT EXISTS dj_custom_announcements_created_idx ON dj_custom_announcements (created_at DESC)`;
}

export default async function handler(req: any, res: any): Promise<void> {
  try {
    const sql = db();
    await ensureTable(sql);
    if (req.method === 'GET') {
      const rows = await sql`SELECT id, text, created_at AS "createdAt" FROM dj_custom_announcements WHERE created_at > NOW() - INTERVAL '30 seconds' ORDER BY created_at DESC LIMIT 1`;
      json(res, 200, { trigger: rows[0] ?? null });
      return;
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body ?? {});
      const text = typeof body.text === 'string' ? body.text.trim().slice(0, 500) : '';
      if (!text) { json(res, 400, { error: 'Announcement text is required.' }); return; }
      const id = randomUUID();
      await sql`INSERT INTO dj_custom_announcements (id, text, created_at) VALUES (${id}, ${text}, NOW())`;
      json(res, 201, { triggered: true, id });
      return;
    }
    json(res, 405, { error: 'Method not allowed' });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Announcement error.' });
  }
}
