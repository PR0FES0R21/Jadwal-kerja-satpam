import {createServer} from 'node:http';
import {MongoClient} from 'mongodb';
import {emptyData,validateBackup} from '../lib/jaga.ts';
import {credentials,hashPassword,verifyPassword,token,digest,safeEqual} from './security.mjs';

const MAX_BYTES=8*1024*1024,SESSION_MS=90*86400000;
const config={uri:process.env.MONGODB_URI,database:process.env.MONGODB_DATABASE||'jaga',apiKey:process.env.JAGA_API_KEY,ownerEmail:process.env.OWNER_EMAIL};
let connection;
async function db(){
  if(!config.uri||!config.apiKey||!config.ownerEmail)throw Object.assign(Error('Konfigurasi server belum lengkap.'),{status:503});
  if(!connection)connection=(async()=>{
    const client=new MongoClient(config.uri,{maxPoolSize:5,serverSelectionTimeoutMS:10000,connectTimeoutMS:10000,writeConcern:{w:'majority'}});
    await client.connect();const database=client.db(config.database);
    await database.collection('sessions').createIndex({expiresAt:1},{expireAfterSeconds:0});
    await database.collection('login_attempts').createIndex({expiresAt:1},{expireAfterSeconds:0});
    await database.collection('versions').createIndex({userId:1,revision:-1},{unique:true});
    return {client,database};
  })().catch(e=>{connection=undefined;console.error('Database unavailable:',e.name,e.code??'');throw Object.assign(Error('Database belum dapat dihubungi. Catatan tidak diubah.'),{status:503});});
  return connection;
}
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
async function body(req){let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>MAX_BYTES)fail(413,'Data terlalu besar. Unduh cadangan dan hubungi pengelola.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail(400,'Format permintaan tidak valid.');}}
function send(res,status,value){res.writeHead(status,{'content-type':'application/json;charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(value));}
async function createSession(database,username){const value=token();await database.collection('sessions').insertOne({_id:digest(value),userId:'owner',username,expiresAt:new Date(Date.now()+SESSION_MS),createdAt:new Date()});return value;}
async function authenticate(req,database){const value=req.headers['x-jaga-session'];if(typeof value!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(value))fail(401,'Silakan masuk kembali.');const session=await database.collection('sessions').findOne({_id:digest(value),expiresAt:{$gt:new Date()}});if(!session)fail(401,'Sesi telah berakhir. Silakan masuk kembali.');if(session.expiresAt.getTime()-Date.now()<SESSION_MS-86400000)await database.collection('sessions').updateOne({_id:session._id},{$set:{expiresAt:new Date(Date.now()+SESSION_MS)}});return session;}
async function limitLogin(req,database,username){const ip=String(req.headers['x-jaga-client']||'unknown');const id=digest(ip+':'+String(username).toLowerCase());const now=new Date();const attempts=database.collection('login_attempts');await attempts.updateOne({_id:id,expiresAt:{$lte:now}},{$set:{count:0,expiresAt:new Date(Date.now()+15*60000)}});const entry=await attempts.findOneAndUpdate({_id:id},{$inc:{count:1},$setOnInsert:{expiresAt:new Date(Date.now()+15*60000)}},{upsert:true,returnDocument:'after'});if(entry.count>12)fail(429,'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');return id;}
async function writeState(database,client,next,expected,operationId){
  if(!Number.isSafeInteger(expected)||expected<0||typeof operationId!=='string'||! /^[a-f0-9]{64}$/.test(operationId))fail(400,'Versi data tidak valid.');
  try{validateBackup(next);}catch(e){fail(400,e.message);}
  if(next.revision!==expected+1)fail(400,'Versi baru tidak valid.');
  const session=client.startSession();let result;
  try{await session.withTransaction(async()=>{
    const duplicate=await database.collection('operations').findOne({_id:operationId},{session});
    if(duplicate){result=duplicate.data;return;}
    const current=await database.collection('states').findOne({_id:'owner'},{session});
    if(!current||current.data.revision!==expected)fail(409,'Catatan berubah di perangkat lain. Muat versi terbaru sebelum menyimpan.');
    await database.collection('versions').insertOne({userId:'owner',revision:current.data.revision,data:current.data,savedAt:new Date()},{session});
    const updated=await database.collection('states').updateOne({_id:'owner','data.revision':expected},{$set:{data:next,updatedAt:new Date()}},{session});
    if(updated.matchedCount!==1)fail(409,'Versi data telah berubah.');
    await database.collection('operations').insertOne({_id:operationId,data:next,createdAt:new Date()},{session});
    result=next;
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary',maxCommitTimeMS:10000});return result;}finally{await session.endSession();}
}

const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname,method=req.method;
    if(path==='/health'){send(res,200,{status:'running'});return;}
    if(!safeEqual(req.headers['authorization'],`Bearer ${config.apiKey||''}`)||!config.apiKey)fail(401,'Tidak diizinkan.');
    const {database,client}=await db();
    if(path==='/ready'){await database.command({ping:1});send(res,200,{ready:true});return;}
    if(path==='/auth/me'&&method==='GET'){
      const owner=await database.collection('users').findOne({_id:'owner'});let session;
      try{session=await authenticate(req,database);}catch(e){if(e.status!==401)throw e;}
      send(res,200,{user:session?{username:session.username}:null,initialized:!!owner});return;
    }
    if((path==='/auth/setup'||path==='/auth/recover')&&method==='POST'){
      if(!safeEqual(req.headers['x-jaga-owner'],config.ownerEmail))fail(403,'Masuk melalui akun ChatGPT pemilik untuk menyiapkan atau memulihkan akun.');
      const input=await body(req),username=credentials(input.username,input.password),passwordHash=await hashPassword(input.password);
      if(path==='/auth/setup'){
        const session=client.startSession();try{await session.withTransaction(async()=>{
          if(await database.collection('users').findOne({_id:'owner'},{session}))fail(409,'Akun sudah dibuat. Silakan masuk.');
          await database.collection('users').insertOne({_id:'owner',username,passwordHash,createdAt:new Date()},{session});
          await database.collection('states').insertOne({_id:'owner',data:emptyData(),updatedAt:new Date()},{session});
        },{writeConcern:{w:'majority'}});}finally{await session.endSession();}
      }else{
        const result=await database.collection('users').updateOne({_id:'owner'},{$set:{username,passwordHash,passwordChangedAt:new Date()}});
        if(!result.matchedCount)fail(404,'Akun belum dibuat.');
        await database.collection('sessions').deleteMany({userId:'owner'});
      }
      send(res,200,{user:{username},sessionToken:await createSession(database,username)});return;
    }
    if(path==='/auth/login'&&method==='POST'){
      const input=await body(req);if(typeof input.username!=='string'||typeof input.password!=='string')fail(400,'Isi username dan password.');
      const attemptId=await limitLogin(req,database,input.username),owner=await database.collection('users').findOne({_id:'owner',username:input.username.toLowerCase()});
      if(!owner||!await verifyPassword(input.password,owner.passwordHash))fail(401,'Username atau password salah.');
      await database.collection('login_attempts').deleteOne({_id:attemptId});
      send(res,200,{user:{username:owner.username},sessionToken:await createSession(database,owner.username)});return;
    }
    const auth=await authenticate(req,database);
    if(path==='/auth/logout'&&method==='POST'){await database.collection('sessions').deleteOne({_id:auth._id});send(res,200,{ok:true});return;}
    if(path==='/state'&&method==='GET'){const current=await database.collection('states').findOne({_id:'owner'});if(!current)fail(503,'Catatan belum siap.');send(res,200,{data:current.data});return;}
    if(path==='/state'&&method==='PUT'){const input=await body(req);send(res,200,{data:await writeState(database,client,input.data,input.expectedRevision,input.operationId)});return;}
    if(path==='/versions'&&method==='GET'){const versions=await database.collection('versions').find({userId:'owner'},{projection:{_id:0,revision:1,savedAt:1,'data.events':1,'data.people':1}}).sort({revision:-1}).limit(30).toArray();send(res,200,{versions:versions.map(v=>({revision:v.revision,savedAt:v.savedAt,events:v.data.events.length,people:v.data.people.length}))});return;}
    if(path==='/versions/restore'&&method==='POST'){
      const input=await body(req);if(!Number.isInteger(input.revision))fail(400,'Pilih versi yang valid.');
      const version=await database.collection('versions').findOne({userId:'owner',revision:input.revision});if(!version)fail(404,'Versi tidak ditemukan.');
      const next={...version.data,revision:input.expectedRevision+1,audit:[...version.data.audit,{id:token(),at:new Date().toISOString(),action:'restore_version',before:null,after:{revision:input.revision},reason:'Pemulihan versi'}]};
      send(res,200,{data:await writeState(database,client,next,input.expectedRevision,digest(JSON.stringify(input)))});return;
    }
    fail(404,'Halaman tidak ditemukan.');
  }catch(e){send(res,e.status||503,{error:e.status?e.message:'Penyimpanan belum tersedia. Catatan tidak diubah.'});if(!e.status)console.error('API failure:',e.name,e.code??'');}
});
server.requestTimeout=30000;
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('Jaga API listening'));
process.on('SIGTERM',()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),10000).unref();});
