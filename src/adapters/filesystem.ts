import fs from 'node:fs/promises';
import path from 'node:path';
import type { Storage } from '../ports';
const types:Record<string,string>={html:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'text/javascript; charset=utf-8',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',ico:'image/x-icon',mp4:'video/mp4',pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',woff:'font/woff',woff2:'font/woff2'};
export class FileStorage implements Storage {
 constructor(private directory:string){}
 private file(key:string){const base=path.resolve(this.directory),file=path.resolve(base,'.'+decodeURIComponent(key.startsWith('/')?key:'/'+key));if(!file.startsWith(base+path.sep))throw Error('Invalid file path');return file;}
 async get(key:string,request:Request){try{let file=this.file(key);if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');const data=await fs.readFile(file);const type=types[path.extname(file).slice(1)]||'application/octet-stream';return new Response(data,{headers:{'content-type':type,'x-content-type-options':'nosniff','cache-control':key.startsWith('/cms')?'no-store':'public,max-age=3600'}});}catch{return new Response('Not found',{status:404});}}
 async put(key:string,bytes:ArrayBuffer,_type:string){const file=this.file(key);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,new Uint8Array(bytes));}
 async delete(key:string){await fs.unlink(this.file(key));}
 async fetch(request:Request){return this.get(new URL(request.url).pathname,request);}
}
