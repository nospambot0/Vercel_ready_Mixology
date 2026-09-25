import { neon } from '@neondatabase/serverless';
import { isValidSession } from '../manage/_auth';

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return neon(url);
}

function cookies(header: string | string[] | undefined): Record<string,string> {
  const value = Array.isArray(header) ? header.join(';') : header ?? '';
  return Object.fromEntries(value.split(';').flatMap((part) => { const i=part.indexOf('='); if(i<0)return []; return [[part.slice(0,i).trim(), decodeURIComponent(part.slice(i+1).trim())]]; }));
}

function json(res:any,status:number,body:unknown) {
  res.statusCode=status; res.setHeader('Content-Type','application/json; charset=utf-8'); res.setHeader('Cache-Control','no-store'); res.end(JSON.stringify(body));
}

async function ensureTable(sql:any) {
  await sql`CREATE TABLE IF NOT EXISTS dj_queue (id TEXT PRIMARY KEY, source TEXT NOT NULL, url TEXT NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', created_at TIMESTAMPTZ NOT NULL)`;
}

async function state(sql:any) {
  const rows=await sql`SELECT id, source, url, title, status, created_at AS "createdAt" FROM dj_queue WHERE status IN ('queued','playing') ORDER BY CASE WHEN status='playing' THEN 0 ELSE 1 END, created_at ASC LIMIT 100`;
  return { current: rows.find((row:any)=>row.status==='playing') ?? null, queue: rows.filter((row:any)=>row.status==='queued') };
}

export default async function handler(req:any,res:any):Promise<void> {
  if(!isValidSession(cookies(req.headers?.cookie)['hillview_manage_session'])) { json(res,401,{error:'Staff authentication required'}); return; }
  try {
    const sql=db(); await ensureTable(sql);
    if(req.method!=='POST'){ json(res,405,{error:'Method not allowed'}); return; }
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body??{});
    const action=typeof body.action==='string'?body.action:''; const id=typeof body.id==='string'?body.id:'';
    if(action==='play') {
      if(!id){json(res,400,{error:'A queue item is required.'});return;}
      await sql`UPDATE dj_queue SET status='played' WHERE status='playing'`;
      await sql`UPDATE dj_queue SET status='playing' WHERE id=${id} AND status='queued'`;
    } else if(action==='next') {
      await sql`UPDATE dj_queue SET status='played' WHERE status='playing'`;
      await sql`UPDATE dj_queue SET status='playing' WHERE id=(SELECT id FROM dj_queue WHERE status='queued' ORDER BY created_at ASC LIMIT 1)`;
    } else if(action==='stop') {
      await sql`UPDATE dj_queue SET status='played' WHERE status='playing'`;
    } else if(action==='remove') {
      if(!id){json(res,400,{error:'A queue item is required.'});return;}
      await sql`DELETE FROM dj_queue WHERE id=${id} AND status='queued'`;
    } else { json(res,400,{error:'Unknown DJ action.'}); return; }
    json(res,200,await state(sql));
  } catch(error) { json(res,500,{error:error instanceof Error?error.message:'DJ control database error.'}); }
}
