import {randomBytes,createHash,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
export const digest=value=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('base64url');
export const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&timingSafeEqual(Buffer.from(digest(a)),Buffer.from(digest(b)));
export function credentials(username,password){
  if(typeof username!=='string'||! /^[a-zA-Z0-9_.-]{3,40}$/.test(username)||typeof password!=='string'||password.length<10||password.length>256)throw Object.assign(Error('Username 3–40 karakter; password minimal 10 karakter.'),{status:400});
  return username.toLowerCase();
}
export async function hashPassword(password){const salt=randomBytes(16).toString('hex');const hash=await derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return `scrypt:${salt}:${hash.toString('hex')}`;}
export async function verifyPassword(password,encoded){if(typeof password!=='string'||password.length>256||typeof encoded!=='string')return false;const [kind,salt,hash]=encoded.split(':');if(kind!=='scrypt'||!salt||!hash)return false;const calculated=await derive(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});const expected=Buffer.from(hash,'hex');return expected.length===calculated.length&&timingSafeEqual(expected,calculated);}
