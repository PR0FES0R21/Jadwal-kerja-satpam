import {createServer} from 'node:http';
import {Readable} from 'node:stream';
import {createAPI} from './api.mjs';
import {browserRequest} from './browser.mjs';
const handle=createAPI({uri:process.env.MONGODB_URI,database:process.env.MONGODB_DATABASE||'jaga',apiKey:process.env.JAGA_API_KEY});
const server=createServer(async(req,res)=>{
  const headers=new Headers();for(const [key,value]of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
  const init={method:req.method,headers};if(req.method!=='GET'&&req.method!=='HEAD'){init.body=Readable.toWeb(req);init.duplex='half';}
  try{const request=new Request(new URL(req.url,'http://'+(req.headers.host||'localhost')),init);const result=req.url.startsWith('/api/cloud/')?await browserRequest(request,handle,process.env.JAGA_API_KEY,req.socket.remoteAddress):await handle(request);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}
  catch{res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({error:'Server belum tersedia.'}));}
});
server.requestTimeout=30000;
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('Jaga API listening'));
process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),10000).unref();});
