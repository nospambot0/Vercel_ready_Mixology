import { neon } from '@neondatabase/serverless';
import { isValidSession, getStaffOtpEmails } from './_auth';

function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return neon(url);
}

function authenticated(req: any): boolean {
  const header = Array.isArray(req.headers?.cookie) ? req.headers.cookie.join(';') : req.headers?.cookie ?? '';
  const cookies = Object.fromEntries(header.split(';').flatMap((part: string) => {
    const separator = part.indexOf('=');
    if (separator < 0) return [];
    return [[part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())]];
  }));
  return isValidSession(cookies.hillview_manage_session);
}

export default async function handler(req: any, res: any): Promise<void> {
  if (!authenticated(req)) {
    json(res, 401, { message: 'Staff authentication required.' });
    return;
  }

  try {
    const sql = db();
    const method = req.method ?? 'GET';
    await sql`CREATE TABLE IF NOT EXISTS manage_access_emails (email TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await getStaffOtpEmails();

    if (method === 'GET') {
      json(res, 200, { emails: await getStaffOtpEmails() });
      return;
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
    const email = normalizeEmail(body.email);
    if (!validEmail(email)) {
      json(res, 400, { message: 'Enter a valid email address.' });
      return;
    }

    if (method === 'POST') {
      await sql`INSERT INTO manage_access_emails (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
      json(res, 200, { emails: await getStaffOtpEmails() });
      return;
    }

    if (method === 'DELETE') {
      const current = await getStaffOtpEmails();
      if (current.length <= 1) {
        json(res, 400, { message: 'Keep at least one staff access email.' });
        return;
      }
      await sql`DELETE FROM manage_access_emails WHERE email = ${email}`;
      json(res, 200, { emails: await getStaffOtpEmails() });
      return;
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    json(res, 405, { message: 'Method not allowed.' });
  } catch (error) {
    json(res, 500, { message: error instanceof Error ? error.message : 'Could not update staff access emails.' });
  }
}
