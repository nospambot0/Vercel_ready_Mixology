import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { isValidSession } from '../../../api/manage/_auth';

type Req = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined>; query?: Record<string, string | string[] | undefined> };
type Res = { statusCode: number; setHeader(name: string, value: string | string[]): void; end(body?: string): void };

const MOODS = ['Chill', 'Romantic', 'Lounge', 'Party', 'Phonk', 'Afro House', 'Bollywood', 'Ambient'] as const;
const MOOD_FOLDERS: Record<string, string> = {
  Chill: 'https://drive.google.com/drive/folders/1gO2ujdgIX7v4HU56TKFIMFMnylqrpUzZ',
};
let schemaReady: Promise<void> | null = null;
let folderCache: { expiresAt: number; tracks: Array<{ id: string; title: string; url: string; mood: string; source: string }> } | null = null;

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
function cleanText(value: unknown, max: number) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function validDriveUrl(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return ['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com'].includes(url.hostname.toLowerCase());
  } catch { return false; }
}
function decodeHtml(value: string) {
  return value.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
function stripHtml(value: string) { return decodeHtml(value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')).trim(); }

async function resolveChillFolder(): Promise<Array<{ id: string; title: string; url: string; mood: string; source: string }>> {
  if (folderCache && folderCache.expiresAt > Date.now()) return folderCache.tracks;
  const folderUrl = MOOD_FOLDERS.Chill;
  const folderId = '1gO2ujdgIX7v4HU56TKFIMFMnylqrpUzZ';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#list`, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MixologyMoodPlayer/1.0)', 'Accept': 'text/html' },
    });
    if (!response.ok) throw new Error('Google Drive folder is not publicly readable.');
    const html = await response.text();
    const found = new Map<string, string>();
    // Google Drive's embedded folder view exposes file IDs in its item links/data attributes.
    const patterns = [
      /<a\b[^>]*href=["'][^"']*\/file\/d\/([A-Za-z0-9_-]{10,})[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
      /data-id=["']([A-Za-z0-9_-]{10,})["'][^>]*>[\s\S]{0,500}?(?:aria-label|title)=["']([^"']+)["']/gi,
      /data-id=["']([A-Za-z0-9_-]{10,})["'][\s\S]{0,600}?class=["'][^"']*(?:flip-entry-title|file-name)[^"']*["'][^>]*>([\s\S]*?)<\//gi,
    ];
    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(html))) {
        const id = match[1];
        const label = stripHtml(match[2] || '');
        if (!found.has(id) && /\.(mp3|m4a|aac|ogg|oga|wav|flac|mp4|webm)(?:\s|$)/i.test(label)) found.set(id, label);
      }
    }
    const tracks = [...found.entries()].map(([id, title]) => ({
      id: `drive-${id}`, title: title.replace(/\.(mp3|m4a|aac|ogg|oga|wav|flac|mp4|webm)$/i, '').slice(0, 120) || 'Chill track',
      url: `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`, mood: 'Chill', source: 'Google Drive folder',
    }));
    folderCache = { expiresAt: Date.now() + 45_000, tracks };
    return tracks;
  } catch {
    // Do not cache a failure for long; an owner may fix the folder's sharing permissions.
    folderCache = { expiresAt: Date.now() + 8_000, tracks: [] };
    return [];
  } finally { clearTimeout(timeout); }
}
function ensureSchema(sql: any): Promise<void> {
  if (!schemaReady) schemaReady = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS dj_mood_tracks (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT NOT NULL, mood TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`CREATE INDEX IF NOT EXISTS dj_mood_tracks_mood_idx ON dj_mood_tracks (mood, created_at)`;
    await sql`CREATE TABLE IF NOT EXISTS dj_mood_settings (id TEXT PRIMARY KEY, active_mood TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`ALTER TABLE dj_mood_settings ADD COLUMN IF NOT EXISTS active_track_id TEXT`;
    await sql`ALTER TABLE dj_mood_settings ADD COLUMN IF NOT EXISTS active_track_url TEXT`;
    await sql`ALTER TABLE dj_mood_settings ADD COLUMN IF NOT EXISTS active_track_title TEXT`;
    await sql`INSERT INTO dj_mood_settings (id, active_mood) VALUES ('venue', 'Chill') ON CONFLICT (id) DO NOTHING`;
  })().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

export default async function handler(req: Req, res: Res) {
  try {
    const sql = db();
    await ensureSchema(sql);
    if (req.method === 'GET') {
      const [manualTracks, settings, folderTracks] = await Promise.all([
        sql`SELECT id, title, url, mood, created_at AS "createdAt" FROM dj_mood_tracks ORDER BY created_at DESC`,
        sql`SELECT active_mood AS "activeMood", active_track_id AS "activeTrackId", active_track_url AS "activeTrackUrl", active_track_title AS "activeTrackTitle", updated_at AS "updatedAt" FROM dj_mood_settings WHERE id = 'venue' LIMIT 1`,
        resolveChillFolder(),
      ]);
      const tracks = [...folderTracks, ...manualTracks];
      const setting = settings[0] ?? {};
      json(res, 200, { tracks, activeMood: setting.activeMood ?? 'Chill', activeTrackId: setting.activeTrackId ?? null, activeTrackUrl: setting.activeTrackUrl ?? null, activeTrackTitle: setting.activeTrackTitle ?? null, updatedAt: setting.updatedAt ?? null, moods: MOODS, folders: MOOD_FOLDERS, folderStatus: folderTracks.length ? 'ready' : 'unavailable' });
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
      if (id.startsWith('drive-')) { json(res, 400, { error: 'Drive-folder tracks are managed in Google Drive; remove the file there instead.' }); return; }
      await sql`DELETE FROM dj_mood_tracks WHERE id = ${id}`;
      json(res, 200, { ok: true });
      return;
    }
    if (action === 'set-mood' || action === 'play-track') {
      const requestedMood = cleanText(body.mood, 32);
      const trackId = cleanText(body.id, 64);
      if (action === 'set-mood' && !(MOODS as readonly string[]).includes(requestedMood)) { json(res, 400, { error: 'Choose a supported mood.' }); return; }
      const [manualTracks, folderTracks] = await Promise.all([
        sql`SELECT id, title, url, mood FROM dj_mood_tracks ORDER BY created_at DESC`,
        resolveChillFolder(),
      ]);
      const allTracks = [...folderTracks, ...manualTracks];
      const candidates = action === 'set-mood' ? allTracks.filter((track) => track.mood === requestedMood) : allTracks;
      const selected = action === 'play-track' ? candidates.find((track) => track.id === trackId) : candidates[0];
      if (action === 'play-track' && !selected) { json(res, 404, { error: 'That mood track is no longer available.' }); return; }
      const moodToSave = action === 'set-mood' ? requestedMood : (selected?.mood ?? requestedMood);
      await sql`UPDATE dj_mood_settings SET active_mood = ${moodToSave}, active_track_id = ${selected?.id ?? null}, active_track_url = ${selected?.url ?? null}, active_track_title = ${selected?.title ?? null}, updated_at = NOW() WHERE id = 'venue'`;
      json(res, 200, { ok: true, activeMood: moodToSave, activeTrackId: selected?.id ?? null, activeTrackUrl: selected?.url ?? null, activeTrackTitle: selected?.title ?? null });
      return;
    }
    json(res, 400, { error: 'Unknown mood action.' });
  } catch (error) {
    json(res, 500, { error: error instanceof Error ? error.message : 'Mood music API error.' });
  }
}
