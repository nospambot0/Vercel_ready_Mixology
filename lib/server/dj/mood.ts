import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { isValidSession } from '../../manage/_auth';

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type Res = { statusCode: number; setHeader(name: string, value: string | string[]): void; end(body?: string): void };

function json(res: Res, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function cookies(header: string | string[] | undefined): Record<string, string> {
  const value = Array.isArray(header) ? header.join(';') : header ?? '';
  return Object.fromEntries(value.split(';').flatMap((part) => {
    const i = part.indexOf('=');
    if (i < 0) return [];
    const k = part.slice(0, i).trim();
    const v = decodeURIComponent(part.slice(i + 1).trim());
    return k ? [[k, v]] : [];
  }));
}
function staff(req: Req) { return isValidSession(cookies(req.headers.cookie).hillview_manage_session); }
function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return neon(url);
}
function bodyOf(req: Req): Record<string, unknown> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body) as Record<string, unknown>; } catch { return {}; } }
  return {};
}
const MOODS = ['Chill', 'Romantic', 'Lounge', 'Party', 'Phonk', 'Afro House', 'Bollywood', 'Ambient'] as const;
let schemaReady: Promise<void> | null = null;
function ensureSchema(sql: any): Promise<void> {
  if (!schemaReady) schemaReady = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS dj_mood_tracks (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, mood TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`CREATE INDEX IF NOT EXISTS dj_mood_tracks_mood_idx ON dj_mood_tracks (mood, created_at)`;
    await sql`CREATE TABLE IF NOT EXISTS dj_mood_settings (id TEXT PRIMARY KEY, active_mood TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`INSERT INTO dj_mood_settings (id, active_mood) VALUES ('venue', 'Chill') ON CONFLICT (id) DO NOTHING`;
  })().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}
function cleanText(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function validDriveUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com'].includes(url.hostname.toLowerCase());
  } catch { return false; }
}

export default async function handler(req: Req, res: Res) {
  try {
    const sql = db();
    await ensureSchema(sql);
    if (req.method === 'GET') {
      const tracks = await sql`SELECT id, title, url, mood, created_at AS "createdAt" FROM dj_mood_tracks ORDER BY created_at DESC`;
      const settings = await sql`SELECT active_mood AS "activeMood" FROM dj_mood_settings WHERE id = 'venue' LIMIT 1`;
      json(res, 200, { tracks, activeMood: settings[0]?.activeMood ?? 'Chill', moods: MOODS });
      return;
    }
    if (req.method !== 'POST') { json(res, 405, { error: 'Method not allowed.' }); return; }
    if (!staff(req)) { json(res, 401, { error: 'Staff authentication required.' }); return; }
    const body = bodyOf(req);
    const action = cleanText(body.action, 24);
    if (action === 'add') {
      const title = cleanText(body.title, 120);
      const url = cleanText(body.url, 1000);
      const mood = cleanText(body.mood, 32);
      if (!title) { json(res, 400, { error: 'Enter a song title.' }); return; }
      if (!validDriveUrl(url)) { json(res, 400, { error: 'Use a valid HTTPS Google Drive song link.' }); return; }
      if (!(MOODS as readonly string[]).includes(mood)) { json(res, 400, { error: 'Choose a supported mood.' }); return; }
      const id = randomUUID();
      await sql`INSERT INTO dj_mood_tracks (id, title, url, mood) VALUES (${id}, ${title}, ${url}, ${mood})`;
      json(res, 201, { id, title, url, mood });
      return;
    }
    if (action === 'delete') {
      const id = cleanText(body.id, 64);
      if (!id) { json(res, 400, { error: 'Track ID is required.' }); return; }
      await sql`DELETE FROM dj_mood_tracks WHERE id = ${id}`;
      json(res, 200, { ok: true });
      return;
    }
    if (action === 'set-mood') {
      const mood = cleanText(body.mood, 32);
      if (!(MOODS as readonly string[]).includes(mood)) { json(res, 400, { error: 'Choose a supported mood.' }); return; }
      await sql`UPDATE dj_mood_settings SET active_mood = ${mood}, updated_at = NOW() WHERE id = 'venue'`;
      json(res, 200, { ok: true, activeMood: mood });
      return;
    }
    json(res, 400, { error: 'Unknown mood action.' });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Mood music API error.' });
  }
}
