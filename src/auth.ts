import type { Services } from './ports';
const encoder=new TextEncoder();
const hex=(a:ArrayBuffer)=>Array.from(new Uint8Array(a),b=>b.toString(16).padStart(2,'0')).join('');
const unhex=(s:string)=>new Uint8Array(s.match(/../g)!.map(x=>parseInt(x,16)));
export function equal(a:string,b:string){let n=a.length^b.length;for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);return n===0;}
export async function passwordHash(password:string,salt=hex(crypto.getRandomValues(new Uint8Array(16)).buffer)){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 return `pbkdf2$100000$${salt}$${hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations:100000},key,256))}`;
}
async function signature(message:string,secret:string){const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return hex(await crypto.subtle.sign('HMAC',key,encoder.encode(message)));}
export async function sessionToken(services:Services){const message=`${Math.floor(Date.now()/1000)+8*3600}.${hex(crypto.getRandomValues(new Uint8Array(16)).buffer)}`;return message+'.'+await signature(message,services.config.sessionSecret);}
export async function authenticated(request:Request,services:Services){
 if(services.config.sessionSecret.length<32||!services.config.adminPasswordHash)return false;
 const token=request.headers.get('cookie')?.match(/(?:^|;\s*)hnaan_session=([^;]+)/)?.[1];
 if(!token)return false;
 const [expires,nonce,sig,...extra]=token.split('.');
 if(extra.length||!/^\d+$/.test(expires)||!nonce||!sig||Number(expires)<Date.now()/1000)return false;
 return equal(sig,await signature(expires+'.'+nonce,services.config.sessionSecret));
}
export function cookie(request:Request,value:string,seconds=8*3600){return `hnaan_session=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${new URL(request.url).protocol==='https:'?'; Secure':''}`;}
export async function limited(services:Services,key:string,max:number,windowSeconds:number){
 const bucket=Math.floor(Date.now()/1000/windowSeconds),digest=hex(await crypto.subtle.digest('SHA-256',encoder.encode(key)));
 const id=digest+':'+bucket;
 await services.db.upsert('cms_rate_limits',['id'],{id,attempts:1,expires_at:(bucket+1)*windowSeconds},['attempts']);
 const row=(await services.db.all('SELECT attempts FROM cms_rate_limits WHERE id=?',[id]))[0];
 return Number(row.attempts)>max;
}
