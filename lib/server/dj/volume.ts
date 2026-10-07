import { neon } from 'neon-serverless';
import { isValidSession } from '../../../api/manage/_auth';

function db() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not configured.');
  return neon(url);
}

function json(res:any,status:number,body:unknown) {
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(body));
}

function cookies(header:string|string[]|undefined):Record<string,string> {
  const value=Array.isArray(header)?header.join(';'):header??'';
  return Object.fromEntries(value.split(';').flatMap((part)=>{const i=part.indexOf('=');if(i<0)return [];return [[part.slice(0,i).trim(),decodeURIComponent(part.slice(i+1).trim())]];}));
}

async function ensureTable(sql:any) {
  await sql`CREATE TABLE IF NOT EXISTS dj_settings (id INTEGER PRIMARY KEY, volume INTEGER NOT NULL DEFAULT 50)`;
  await sql`INSERT INTO dj_settings (id, volume) VALUES (1, 50) ON CONFLICT (id) DO NOTHING`;
  await sql`ALTER TABLE dj_settings ADD COLUMN IF NOT EXISTS default_migrated BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`UPDATE dj_settings SET volume = 50, default_migrated = TRUE WHERE id = 1 AND default_migrated = FALSE`;
}

export default async function handler(req:any,res:any):Promise<void> {
  try {
    const sql=db();
    await ensureTable(sql);
    if(req.method==='GET') {
      const rows=await sql`SELECT volume FROM dj_settings WHERE id=1 LIMIT 1`;
      const volume=Math.max(0,Math.min(100,Number(rows[0]?.volume??50)));
      json(res,200,{volume});
      return;
    }
    if(req.method==='POST') {
      if(!isValidSession(cookies(req.headers?.cookie)['hillview_manage_session'])) {
        json(res,401,{error:'Staff authentication required'});
        return;
      }
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body??{});
      const raw=Number(body.volume);
      if(!Number.isFinite(raw)){json(res,400,{error:'A valid volume is required.'});return;}
      const volume=Math.max(0,Math.min(100,Math.round(raw)));
      await sql`UPDATE dj_settings SET volume=${volume}, default_migrated=TRUE WHERE id=1`;
      json(res,200,{volume});
      return;
    }
    json(res,405,{error:'Method not allowed'});
  } catch(error) {
    json(res,500,{error:error instanceof Error?error.message:'DJ volume error.'});
  }
}