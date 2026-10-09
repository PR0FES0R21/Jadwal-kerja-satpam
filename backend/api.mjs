import {MongoClient} from 'mongodb';
import {emptyProfile,profileFields} from '../lib/profile.ts';
import {emptyData,validateBackup} from '../lib/jaga.ts';
import {credentials,hashPassword,verifyPassword,token,digest,safeEqual} from './security.mjs';

const MAX_BYTES=4*1024*1024,SESSION_MS=90*86400000;
export function createAPI(config){
let connection;
async function db(){
  if(!config.uri||!config.apiKey)throw Object.assign(Error('Konfigurasi server belum lengkap.'),{status:503});
  if(!connection)connection=(async()=>{
    if(config.connectDatabase)return config.connectDatabase();
    const client=new MongoClient(config.uri,{maxPoolSize:5,maxIdleTimeMS:10000,serverSelectionTimeoutMS:10000,connectTimeoutMS:10000,writeConcern:{w:'majority'}});
    try{await client.connect();const database=client.db(config.database);
    await database.collection('users').createIndex({username:1},{unique:true});
    await database.collection('sessions').createIndex({expiresAt:1},{expireAfterSeconds:0});
    await database.collection('login_attempts').createIndex({expiresAt:1},{expireAfterSeconds:0});
    await database.collection('versions').createIndex({userId:1,revision:-1},{unique:true});
    return {client,database};}catch(e){await client.close().catch(()=>{});throw e;}
  })().catch(e=>{connection=undefined;console.error('Database unavailable:',e.name,e.code??'');throw Object.assign(Error('Database belum dapat dihubungi. Catatan tidak diubah.'),{status:503});});
  return connection;
}
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
async function body(req){let size=0,chunks=[];for await(const chunk of req.body||[]){size+=chunk.length;if(size>MAX_BYTES)fail(413,'Data terlalu besar. Unduh cadangan dan hubungi pengelola.');chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{fail(400,'Format permintaan tidak valid.');}}
function send(status,value){return Response.json(value,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});}
async function createSession(database,userId,username){const value=token();await database.collection('sessions').insertOne({_id:digest(value),userId,username,expiresAt:new Date(Date.now()+SESSION_MS),createdAt:new Date()});return value;}
async function authenticate(req,database){const value=req.headers.get('x-jaga-session');if(typeof value!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(value))fail(401,'Silakan masuk kembali.');const session=await database.collection('sessions').findOne({_id:digest(value),expiresAt:{$gt:new Date()}});if(!session)fail(401,'Sesi telah berakhir. Silakan masuk kembali.');if(session.expiresAt.getTime()-Date.now()<SESSION_MS-86400000)await database.collection('sessions').updateOne({_id:session._id},{$set:{expiresAt:new Date(Date.now()+SESSION_MS)}});return session;}
async function limitLogin(req,database,username){const ip=String(req.headers.get('x-jaga-client')||'unknown');const id=digest(ip+':'+String(username).toLowerCase());const now=new Date();const attempts=database.collection('login_attempts');await attempts.updateOne({_id:id,expiresAt:{$lte:now}},{$set:{count:0,expiresAt:new Date(Date.now()+15*60000)}});const entry=await attempts.findOneAndUpdate({_id:id},{$inc:{count:1},$setOnInsert:{expiresAt:new Date(Date.now()+15*60000)}},{upsert:true,returnDocument:'after'});if(entry.count>12)fail(429,'Terlalu banyak percobaan. Coba lagi dalam 15 menit.');return id;}
async function writeState(database,client,userId,next,expected,operationId,requestFingerprint=digest(JSON.stringify(next))){
  if(!Number.isSafeInteger(expected)||expected<0||typeof operationId!=='string'||! /^[a-f0-9]{64}$/.test(operationId))fail(400,'Versi data tidak valid.');
  try{validateBackup(next);}catch(e){fail(400,e.message);}
  if(next.revision!==expected+1)fail(400,'Versi baru tidak valid.');
  const session=client.startSession();let result;
  try{await session.withTransaction(async()=>{
    const operationKey=userId+':'+operationId;
    const duplicate=await database.collection('operations').findOne({_id:operationKey,userId},{session});
    if(duplicate){if(duplicate.requestFingerprint!==requestFingerprint)fail(409,'Permintaan simpan berbeda memakai ID yang sama.');result=duplicate.data;return;}
    const current=await database.collection('states').findOne({_id:userId},{session});
    if(!current||current.data.revision!==expected)fail(409,'Catatan berubah di perangkat lain. Muat versi terbaru sebelum menyimpan.');
    await database.collection('versions').insertOne({userId,revision:current.data.revision,data:current.data,savedAt:new Date()},{session});
    const updated=await database.collection('states').updateOne({_id:userId,'data.revision':expected},{$set:{data:next,updatedAt:new Date()}},{session});
    if(updated.matchedCount!==1)fail(409,'Versi data telah berubah.');
    await database.collection('operations').insertOne({_id:operationKey,userId,requestFingerprint,data:next,createdAt:new Date()},{session});
    result=next;
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary',maxCommitTimeMS:10000});return result;}finally{await session.endSession();}
}

return async function handleRequest(req){
  try{
    const path=new URL(req.url).pathname,method=req.method;
    if(path==='/health'){return send(200,{status:'running'});}
    if(!safeEqual(req.headers.get('authorization'),`Bearer ${config.apiKey||''}`)||!config.apiKey)fail(401,'Tidak diizinkan.');
    const {database,client}=await db();
    if(path==='/ready'){await database.command({ping:1});return send(200,{ready:true});}
    if(path==='/auth/me'&&method==='GET'){
      let session;try{session=await authenticate(req,database);}catch(e){if(e.status!==401)throw e;}
      const user=session?await database.collection('users').findOne({_id:session.userId}):null;
      return send(200,{user:user?{username:user.username,profile:user.profile??emptyProfile()}:null});
    }
    if(path==='/auth/register'&&method==='POST'){
      const input=await body(req),username=credentials(input.username,input.password);
      await limitLogin(req,database,'register');
      const userId=token(),passwordHash=await hashPassword(input.password),recoveryCode=token();
      const transaction=client.startSession();
      try{await transaction.withTransaction(async()=>{
        if(await database.collection('users').findOne({username},{session:transaction}))fail(409,'Username sudah digunakan. Pilih username lain atau masuk.');
        await database.collection('users').insertOne({_id:userId,username,passwordHash,recoveryHash:digest(recoveryCode),createdAt:new Date()},{session:transaction});
        await database.collection('states').insertOne({_id:userId,data:emptyData(),updatedAt:new Date()},{session:transaction});
      },{writeConcern:{w:'majority'}});}catch(e){if(e.code===11000)fail(409,'Username sudah digunakan. Pilih username lain atau masuk.');throw e;}finally{await transaction.endSession();}
      return send(200,{user:{username},recoveryCode,sessionToken:await createSession(database,userId,username)});
    }
    if(path==='/auth/login'&&method==='POST'){
      const input=await body(req);if(typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>40||input.password.length>256)fail(400,'Isi username dan password.');
      const attemptId=await limitLogin(req,database,input.username),user=await database.collection('users').findOne({username:input.username.toLowerCase()});
      if(!user||!await verifyPassword(input.password,user.passwordHash))fail(401,'Username atau password salah.');
      await database.collection('login_attempts').deleteOne({_id:attemptId});
      return send(200,{user:{username:user.username},sessionToken:await createSession(database,user._id,user.username)});
    }
    if(path==='/auth/recover'&&method==='POST'){
      const input=await body(req),username=credentials(input.username,input.password);
      await limitLogin(req,database,'recover:'+username);
      if(typeof input.recoveryCode!=='string'||! /^[A-Za-z0-9_-]{43}$/.test(input.recoveryCode))fail(401,'Username atau kode pemulihan salah.');
      const user=await database.collection('users').findOne({username});
      if(!user||!safeEqual(user.recoveryHash,digest(input.recoveryCode)))fail(401,'Username atau kode pemulihan salah.');
      const passwordHash=await hashPassword(input.password),recoveryCode=token(),transaction=client.startSession();
      try{await transaction.withTransaction(async()=>{
        const updated=await database.collection('users').updateOne({_id:user._id,recoveryHash:user.recoveryHash},{$set:{passwordHash,recoveryHash:digest(recoveryCode),passwordChangedAt:new Date()}},{session:transaction});
        if(updated.matchedCount!==1)fail(409,'Kode pemulihan sudah digunakan.');
        await database.collection('sessions').deleteMany({userId:user._id},{session:transaction});
      },{writeConcern:{w:'majority'}});}finally{await transaction.endSession();}
      return send(200,{user:{username},recoveryCode,sessionToken:await createSession(database,user._id,username)});
    }
    const auth=await authenticate(req,database);
    if(path==='/profile'&&(method==='GET'||method==='PUT')){
      const user=await database.collection('users').findOne({_id:auth.userId});if(!user)fail(401,'Silakan masuk kembali.');
      const current=user.profile??emptyProfile();
      if(method==='GET')return send(200,{profile:current});
      const input=await body(req);
      if(!input||typeof input!=='object'||Array.isArray(input)||!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||Object.keys(input).some(key=>!['profile','expectedRevision'].includes(key)))fail(400,'Permintaan profil tidak valid.');
      let fields;try{fields=profileFields(input.profile);}catch(e){fail(400,e.message);}
      if(current.revision!==input.expectedRevision){
        if(current.revision===input.expectedRevision+1&&Object.entries(fields).every(([key,value])=>current[key]===value))return send(200,{profile:current});
        fail(409,'Profil berubah di perangkat lain. Muat profil terbaru sebelum menyimpan.');
      }
      const next={...fields,revision:current.revision+1};
      const filter={_id:auth.userId,...(user.profile?{'profile.revision':current.revision}:{profile:{$exists:false}})};
      const result=await database.collection('users').updateOne(filter,{$set:{profile:next,profileUpdatedAt:new Date()}});
      if(result.matchedCount!==1)fail(409,'Profil berubah di perangkat lain. Muat profil terbaru sebelum menyimpan.');
      return send(200,{profile:next});
    }
    if(path==='/auth/recovery-key'&&method==='POST'){
      const input=await body(req),user=await database.collection('users').findOne({_id:auth.userId});
      if(!user||!await verifyPassword(input.password,user.passwordHash))fail(401,'Password salah.');
      const recoveryCode=token();await database.collection('users').updateOne({_id:auth.userId},{$set:{recoveryHash:digest(recoveryCode)}});
      return send(200,{recoveryCode});
    }
    if(path==='/auth/logout' &&method==='POST'){await database.collection('sessions').deleteOne({_id:auth._id});return send(200,{ok:true});}
    if(path==='/state'&&method==='GET'){const current=await database.collection('states').findOne({_id:auth.userId});if(!current)fail(503,'Catatan belum siap.');return send(200,{data:current.data});}
    if(path==='/state'&&method==='PUT'){const input=await body(req);return send(200,{data:await writeState(database,client,auth.userId,input.data,input.expectedRevision,input.operationId)});}
    if(path==='/versions'&&method==='GET'){const versions=await database.collection('versions').find({userId:auth.userId},{projection:{_id:0,revision:1,savedAt:1,'data.events':1,'data.people':1}}).sort({revision:-1}).limit(30).toArray();return send(200,{versions:versions.map(v=>({revision:v.revision,savedAt:v.savedAt,events:v.data.events.length,people:v.data.people.length}))});}
    if(path==='/versions/restore'&&method==='POST'){
      const input=await body(req);if(!Number.isInteger(input.revision))fail(400,'Pilih versi yang valid.');
      const version=await database.collection('versions').findOne({userId:auth.userId,revision:input.revision});if(!version)fail(404,'Versi tidak ditemukan.');
      const next={...version.data,revision:input.expectedRevision+1,audit:[...version.data.audit,{id:token(),at:new Date().toISOString(),action:'restore_version',before:null,after:{revision:input.revision},reason:'Pemulihan versi'}]};
      return send(200,{data:await writeState(database,client,auth.userId,next,input.expectedRevision,digest(JSON.stringify(input)),digest('restore:'+JSON.stringify(input)))});
    }
    fail(404,'Halaman tidak ditemukan.');
  }catch(e){if(!e.status)console.error('API failure:',e.name,e.code??'');return send(e.status||503,{error:e.status?e.message:'Penyimpanan belum tersedia. Catatan tidak diubah.'});}
};
}
