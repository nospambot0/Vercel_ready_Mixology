import control from '../../lib/server/dj/control';
import queue from '../../lib/server/dj/queue';
import adv from '../../lib/server/dj/adv';
import hkv from '../../lib/server/dj/hkv';
import announcement from '../../lib/server/dj/announcement';
import tts from '../../lib/server/dj/tts';

function json(res:any,status:number,body:unknown){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}

export default async function handler(req:any,res:any):Promise<void>{
  const pathname=String(req.url||'').split('?')[0].replace(/\\/g,'/');
  const route=pathname.split('/').filter(Boolean).pop()||'';
  try {
    if(route==='control') return await control(req,res);
    if(route==='queue') return await queue(req,res);
    if(route==='adv') return await adv(req,res);
    if(route==='hkv') return await hkv(req,res);
    if(route==='announcement') return await announcement(req,res);
    if(route==='tts') return await tts(req,res);
    return json(res,404,{error:'Unknown DJ API route.'});
  } catch(error) {
    return json(res,500,{error:error instanceof Error?error.message:'DJ API error.'});
  }
}
