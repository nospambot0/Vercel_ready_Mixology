import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return neon(url);
}

function sendJson(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.end(JSON.stringify(body));
}

function getCookie(req: any, name: string): string | null {
  const cookieHeader = String(req.headers?.cookie ?? '');
  const part = cookieHeader.split(';').map((item: string) => item.trim()).find((item: string) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : null;
}

export default async function handler(req: any, res: any): Promise<void> {
  try {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    const sql = getDb();
    await sql`CREATE TABLE IF NOT EXISTS unique_visitors (
      visitor_id TEXT PRIMARY KEY,
      first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    let visitorId = getCookie(req, 'mixology_visitor');
    let isNewVisitor = false;

    if (!visitorId || !/^[a-f0-9-]{36}$/.test(visitorId)) {
      visitorId = randomUUID();
      isNewVisitor = true;
    }

    if (isNewVisitor) {
      await sql`INSERT INTO unique_visitors (visitor_id) VALUES (${visitorId}) ON CONFLICT (visitor_id) DO NOTHING`;
      res.setHeader('Set-Cookie', `mixology_visitor=${encodeURIComponent(visitorId)}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    }

    const rows = await sql`SELECT COUNT(*)::int AS count FROM unique_visitors`;
    sendJson(res, 200, { count: Number(rows[0]?.count ?? 0) });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Visitor counter error.' });
  }
}
