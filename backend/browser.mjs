const allowed=new Set(['auth/me','auth/register','auth/login','auth/logout','auth/recover','auth/recovery-key','state','versions','versions/restore']);
const cookieName='__Host-jaga_session';
// Browser authentication stays on the same origin. Internal headers supplied
// by visitors are discarded; only the server adds the service credential.
export async function browserRequest(req,handle,apiKey,ip='unknown'){
  const url=new URL(req.url),path=url.pathname.slice('/api/cloud/'.length);
  if(!allowed.has(path))return Response.json({error:'Tidak ditemukan.'},{status:404});
  if(req.method!=='GET'&&req.headers.get('origin')!==url.origin)return Response.json({error:'Permintaan tidak diizinkan.'},{status:403});
  const value=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const headers=new Headers({'authorization':`Bearer ${apiKey||''}`,'content-type':'application/json','x-jaga-client':ip});
  if(value&&/^[A-Za-z0-9_-]{43}$/.test(value))headers.set('x-jaga-session',value);
  const options={method:req.method,headers};
  if(req.method!=='GET'){options.body=req.body;options.duplex='half';}
  const result=await handle(new Request(new URL('/'+path,url),options));
  const payload=await result.json(),sessionToken=payload.sessionToken;delete payload.sessionToken;
  const outgoing=new Headers({'cache-control':'no-store','x-content-type-options':'nosniff'});
  if(result.ok&&(typeof sessionToken==='string'||value&&payload.user))outgoing.set('set-cookie',`${cookieName}=${sessionToken||value}; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax`);
  if(result.ok&&path==='auth/logout')outgoing.set('set-cookie',`${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
  return Response.json(payload,{status:result.status,headers:outgoing});
}
