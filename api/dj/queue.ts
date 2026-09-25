import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

type Source = 'youtube';

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return neon(url);
}

function json(res: any, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function parseSource(raw: string): { source: Source; normalized: string; videoId: string } | null {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';
    if (host === 'youtu.be') id = url.pathname.slice(1).split('/')[0] ?? '';
    else if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      if (url.pathname.startsWith('/watch')) id = url.searchParams.get('v') ?? '';
      else if (url.pathname.startsWith('/shorts/')) id = url.pathname.split('/')[2] ?? '';
    }
    if (/^[A-Za-z0-9_-]{11}$/.test(id)) return { source: 'youtube', normalized: `https://www.youtube.com/watch?v=${id}`, videoId: id };
    return null;
  } catch { return null; }
}

function titleFor() { return 'YouTube song request'; }

function looksDisturbing(title: string): boolean {
  const blocked = [
    // Graphic/disturbing content
    /\bgore\b/i, /\bgraphic\b/i, /\btorture\b/i, /\bkill(?:ing|ed)?\b/i,
    /\bmurder\b/i, /\bexecution\b/i, /\bdeath\s+video\b/i, /\bsnuff\b/i,
    /\bviolence\b/i, /\bbeheading\b/i, /\bdecapitat/i, /\bself[- ]harm\b/i,
    /\bsuicide\b/i, /\bwar\s+footage\b/i, /\bgraphic\s+accident\b/i,

    // Volume 1: common explicit/profane/slur-like Hindi/Hinglish terms unsuitable for the public DJ queue.
    /\bchoot(?:ad|iya|i)?\b/i, /\bchutiya\b/i, /\bchutiye\b/i,
    /\bchut\b/i, /\bbhos(?:d|di|da|de)\b/i, /\bbhosda\b/i,
    /\bbhosdi\b/i, /\bbhosdike\b/i, /\bmadarchod\b/i, /\bmc\b/i,
    /\bbehenchod\b/i, /\bbc\b/i, /\bgand\b/i, /\bgandu\b/i,
    /\bgandfat\b/i, /\blauda\b/i, /\blaude\b/i, /\blaudi\b/i,
    /\blund\b/i, /\blundaa\b/i, /\bgaand\b/i, /\bharami\b/i,
    /\bharamzada\b/i, /\bkamine\b/i, /\bkameena\b/i, /\bkamini\b/i,
    /\bsaala\b/i, /\bsaali\b/i, /\bsaale\b/i, /\bchakka\b/i,
    /\brandi\b/i, /\bwhore\b/i, /\bfuck\b/i, /\bfucker\b/i,
    /\bshit\b/i, /\bbitch\b/i, /\basshole\b/i, /\bcunt\b/i,

    // Previously requested flagged terms.
    /\bbanda\b/i, /\bgawk\b/i, /\bmoaning\b/i, /\bprank\b/i, /\bbia\b/i,
    /\bmaghia\b/i
  ];
  return blocked.some((pattern) => pattern.test(title));
}



async function fetchTrackTitle(url: string, source: Source): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
    const response: any = await fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return titleFor();
    const data = await response.json() as { title?: unknown };
    const title = typeof data.title === 'string' ? data.title.trim() : '';
    return title.slice(0, 300) || titleFor();
  } catch {
    return titleFor();
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureTable(sql: any) {
  await sql`CREATE TABLE IF NOT EXISTS dj_queue (id TEXT PRIMARY KEY, source TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, requester_name TEXT NOT NULL DEFAULT 'Guest', requester_url TEXT, status TEXT NOT NULL DEFAULT 'queued', created_at TIMESTAMPTZ NOT NULL)`;
  await sql`ALTER TABLE dj_queue ADD COLUMN IF NOT EXISTS requester_name TEXT NOT NULL DEFAULT 'Guest'`;
  await sql`ALTER TABLE dj_queue ADD COLUMN IF NOT EXISTS requester_url TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS dj_queue_status_created_idx ON dj_queue (status, created_at)`;
}

export default async function handler(req: any, res: any): Promise<void> {
  try {
    const sql = db();
    await ensureTable(sql);
    if (req.method === 'GET') {
      const rows = await sql`SELECT id, source, url, title, requester_name AS "requesterName", requester_url AS "requesterUrl", status, created_at AS "createdAt" FROM dj_queue WHERE source = 'youtube' AND status IN ('queued','playing') ORDER BY CASE WHEN status='playing' THEN 0 ELSE 1 END, created_at ASC LIMIT 100`;
      // Backfill titles for songs that were added before title lookup was enabled.
      for (const row of rows as any[]) {
        const fallback = titleFor();
        if (row.title === fallback) {
          const title = await fetchTrackTitle(row.url, row.source as Source);
          if (title !== fallback) {
            row.title = title;
            await sql`UPDATE dj_queue SET title = ${title} WHERE id = ${row.id}`;
          }
        }
      }
      json(res, 200, { current: rows.find((row:any) => row.status === 'playing') ?? null, queue: rows.filter((row:any) => row.status === 'queued') });
      return;
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
      const raw = typeof body.url === 'string' ? body.url.trim() : '';
      const requesterName = typeof body.requesterName === 'string' ? body.requesterName.trim().slice(0, 80) : '';
      const requesterUrlRaw = typeof body.requesterUrl === 'string' ? body.requesterUrl.trim().slice(0, 500) : '';
      let requesterUrl: string | null = null;
      if (requesterUrlRaw) {
        try {
          const parsedRequesterUrl = new URL(requesterUrlRaw);
          if (parsedRequesterUrl.protocol !== 'http:' && parsedRequesterUrl.protocol !== 'https:') throw new Error();
          requesterUrl = parsedRequesterUrl.toString();
        } catch {
          json(res, 400, { error: 'Please enter a valid http(s) URL for your optional link.' });
          return;
        }
      }
      if (!requesterUrl || !raw || raw.length > 500) { json(res, 400, { error: 'Paste a valid YouTube song link.' }); return; }
      const parsed = parseSource(raw);
      if (!parsed) { json(res, 400, { error: 'Only YouTube video links are accepted.' }); return; }
      const countRows = await sql`SELECT COUNT(*)::int AS count FROM dj_queue WHERE status IN ('queued','playing')`;
      if ((countRows[0]?.count ?? 0) >= 100) { json(res, 429, { error: 'The DJ queue is full. Please try again later.' }); return; }
      const duplicate = await sql`SELECT id FROM dj_queue WHERE url = ${parsed.normalized} AND status IN ('queued','playing') LIMIT 1`;
      if (duplicate.length) { json(res, 409, { error: 'That song is already in the queue.' }); return; }
      const id = randomUUID();
      const title = await fetchTrackTitle(parsed.normalized, parsed.source);
      if (looksDisturbing(title)) { json(res, 400, { error: 'That video does not appear to be suitable for the DJ queue.' }); return; }
      await sql`INSERT INTO dj_queue (id, source, url, title, requester_name, requester_url, status, created_at) VALUES (${id}, ${parsed.source}, ${parsed.normalized}, ${title}, ${requesterName}, ${requesterUrl}, 'queued', NOW())`;
      json(res, 201, { added: true, id });
      return;
    }
    json(res, 405, { error: 'Method not allowed' });
  } catch (error) { json(res, 500, { error: error instanceof Error ? error.message : 'DJ queue database error.' }); }
}
