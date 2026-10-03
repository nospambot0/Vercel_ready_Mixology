import history from '../../lib/server/pos/history';
import email from '../../lib/server/pos/email';

function json(res:any,status:number,body:unknown){res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));}

export default async function handler(req:any,res:any):Promise<void>{
  const pathname=String(req.url||'').split('?')[0].replace(/\\/g,'/');
  const route=pathname.split('/').filter(Boolean).pop()||'';
  try {
    if(route==='history') return await history(req,res);
    if(route==='email') return await email(req,res);
    return json(res,404,{error:'Unknown POS API route.'});
  } catch(error) {
    return json(res,500,{error:error instanceof Error?error.message:'POS API error.'});
  }
}
