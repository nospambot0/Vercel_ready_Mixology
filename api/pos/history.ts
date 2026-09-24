import { neon } from '@neondatabase/serverless';
import { isValidSession } from '../manage/_auth';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return neon(url);
}

function getSession(req: any): boolean {
  const header = req.headers?.cookie ?? '';
  const cookie = String(header).split(';').map((x: string) => x.trim()).find((x: string) => x.startsWith('hillview_manage_session='));
  return isValidSession(cookie ? decodeURIComponent(cookie.slice('hillview_manage_session='.length)) : undefined);
}

export default async function handler(req: any, res: any): Promise<void> {
  if (!getSession(req)) { res.statusCode = 401; res.end(JSON.stringify({ error: 'Staff authentication required' })); return; }
  try {
    const sql = getDb();
    await sql`CREATE TABLE IF NOT EXISTS billing_history (
      id TEXT PRIMARY KEY,
      amount NUMERIC(12,2) NOT NULL,
      remark TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL,
      status TEXT NOT NULL DEFAULT 'PAID'
    )`;

    if (req.method === 'GET') {
      const rows = await sql`SELECT id, amount::float8 AS amount, remark, created_at AS "createdAt", status FROM billing_history ORDER BY created_at DESC LIMIT 100`;
      res.statusCode = 200; res.end(JSON.stringify({ bills: rows })); return;
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
      const bill = body.bill ?? {};
      const amount = Number(bill.amount);
      if (!bill.id || !Number.isFinite(amount) || amount <= 0) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Invalid bill.' })); return; }
      await sql`INSERT INTO billing_history (id, amount, remark, created_at, status)
        VALUES (${String(bill.id)}, ${amount}, ${String(bill.remark ?? '')}, ${new Date(bill.createdAt || Date.now())}, 'PAID')
        ON CONFLICT (id) DO UPDATE SET amount=EXCLUDED.amount, remark=EXCLUDED.remark, created_at=EXCLUDED.created_at, status='PAID'`;
      res.statusCode = 200; res.end(JSON.stringify({ saved: true })); return;
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM billing_history`;
      res.statusCode = 200; res.end(JSON.stringify({ cleared: true })); return;
    }

    res.statusCode = 405; res.end(JSON.stringify({ error: 'Method not allowed' }));
  } catch (error) {
    res.statusCode = 500; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Billing database error.' }));
  }
}
