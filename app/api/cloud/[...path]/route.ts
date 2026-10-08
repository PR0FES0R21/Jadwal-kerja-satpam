import {getChatGPTUser,chatGPTSignInPath} from '@/app/chatgpt-auth';
export const dynamic='force-dynamic';
const allowed=new Set(['auth/me','auth/setup','auth/recover','auth/login','auth/logout','state','versions','versions/restore']);
const cookieName='__Host-jaga_session';
async function proxy(request:Request,context:{params:Promise<{path:string[]}>}){
  const path=(await context.params).path.join('/');
  if(!allowed.has(path))return Response.json({error:'Tidak ditemukan.'},{status:404});
  const backend=process.env.JAGA_BACKEND_URL,secret=process.env.JAGA_API_KEY,owner=process.env.JAGA_OWNER_EMAIL;
  if(!backend||!secret||!owner)return path==='auth/me'?Response.json({configured:false},{headers:{'cache-control':'no-store'}}):Response.json({error:'Penyimpanan lintas perangkat belum diaktifkan.'},{status:503});
  const origin=request.headers.get('origin');
  if(request.method!=='GET'&&(!origin||origin!==new URL(request.url).origin))return Response.json({error:'Permintaan tidak diizinkan.'},{status:403});
  const user=path==='auth/me'||path==='auth/setup'||path==='auth/recover'?await getChatGPTUser():null;
  const ownerVerified=!!user&&user.email.toLowerCase()===owner.toLowerCase();
  if((path==='auth/setup'||path==='auth/recover')&&!ownerVerified)return Response.json({error:'Masuk melalui akun ChatGPT pemilik dahulu.'},{status:403});
  const session=request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
  const headers:Record<string,string>={'authorization':`Bearer ${secret}`,'content-type':'application/json','x-jaga-client':request.headers.get('cf-connecting-ip')||'unknown'};
  if(session&&/^[A-Za-z0-9_-]{43}$/.test(session))headers['x-jaga-session']=session;
  if(ownerVerified)headers['x-jaga-owner']=owner;
  try{
    const body=request.method==='GET'?undefined:await request.text();
    if(body&&new TextEncoder().encode(body).length>8*1024*1024)return Response.json({error:'Data terlalu besar.'},{status:413});
    const result=await fetch(new URL('/'+path,backend),{method:request.method,headers,body,signal:AbortSignal.timeout(65000)});
    const payload=await result.json() as Record<string,unknown>;
    const token=payload.sessionToken;delete payload.sessionToken;
    if(path==='auth/me'&&result.ok){payload.ownerVerified=ownerVerified;payload.setupSignIn=chatGPTSignInPath('/');}
    const outgoing=new Headers({'cache-control':'no-store'});
    if(result.ok&&(typeof token==='string'||session&&payload.user))outgoing.set('set-cookie',`${cookieName}=${typeof token==='string'?token:session}; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax`);
    if(path==='auth/logout'&&result.ok)outgoing.set('set-cookie',`${cookieName}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
    return Response.json(payload,{status:result.status,headers:outgoing});
  }catch{return Response.json({error:'Server belum merespons. Isian dan catatan lama tetap tersedia. Coba lagi.'},{status:503,headers:{'cache-control':'no-store'}});}
}
export const GET=proxy;
export const POST=proxy;
export const PUT=proxy;
