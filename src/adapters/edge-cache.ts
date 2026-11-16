import type {Storage} from '../ports';
import {matchesIfRange} from './media-conditions';

type EdgeCache=Pick<Cache,'match'|'put'|'delete'>;

export class MediaEdgeCache {
 constructor(private cache:EdgeCache,private waitUntil:(task:Promise<unknown>)=>void,private origin:string,private revision?:string){}
 private get policy(){return this.revision?'public,max-age=0,must-revalidate,s-maxage=604800':'public,max-age=86400,s-maxage=604800';}
 private key(path:string,request?:Request){
  const headers=new Headers();
  for(const name of ['range','if-none-match','if-modified-since'])if(request?.headers.has(name))headers.set(name,request.headers.get(name)!);
  const url=new URL(path,this.origin);if(this.revision)url.searchParams.set('__asset_revision',this.revision);
  return new Request(url,{method:'GET',headers});
 }
 async get(path:string,request:Request,load:()=>Promise<Response>){
  const readable=['GET','HEAD'].includes(request.method)&&!request.headers.has('if-match')&&!request.headers.has('if-unmodified-since');
  if(readable){
   try{
    const validator=request.headers.get('if-range');
    let hit=await this.cache.match(this.key(path,validator?undefined:request));
    if(hit&&validator&&request.headers.has('range')&&matchesIfRange(validator,hit.headers.get('etag'),hit.headers.get('last-modified')))hit=await this.cache.match(this.key(path,request));
    if(hit){const headers=new Headers(hit.headers);headers.set('x-media-cache','HIT');headers.set('cache-control',this.policy);return new Response(request.method==='HEAD'?null:hit.body,{status:hit.status,headers});}
   }catch(error){console.warn('Media cache lookup failed',String(error));}
  }
  const response=await load(),headers=new Headers(response.headers);
  const cacheable=readable&&request.method==='GET'&&response.status===200&&!headers.has('set-cookie');
  if(readable&&response.status===200&&!headers.has('set-cookie'))headers.set('cache-control',this.policy);
  headers.delete('cf-cache-status');
  headers.set('x-media-cache',cacheable?'MISS':'BYPASS');
  const result=new Response(request.method==='HEAD'?null:response.body,{status:response.status,headers});
  if(cacheable)this.waitUntil(this.cache.put(this.key(path),result.clone()).catch(error=>console.warn('Media cache write failed',String(error))));
  return result;
 }
 async warm(path:string,load:(request:Request)=>Promise<Response>){
  try{
   const key=this.key(path),response=await load(key);
   if(response.status!==200||response.headers.has('set-cookie'))return;
   const headers=new Headers(response.headers);headers.set('cache-control',this.policy);headers.delete('cf-cache-status');
   await this.cache.put(key,new Response(response.body,{status:200,headers}));
  }catch(error){console.warn('Media cache warmup failed',String(error));}
 }
 async invalidate(path:string){try{await this.cache.delete(this.key(path));}catch(error){console.warn('Media cache invalidation failed',String(error));}}
}
export class EdgeCachedStorage implements Storage {
 constructor(private storage:Storage,private edge:MediaEdgeCache){}
 get(path:string,request:Request){return this.edge.get(path,request,()=>this.storage.get(path,request));}
 async put(path:string,bytes:ArrayBuffer,type:string){await this.storage.put(path,bytes,type);await this.edge.invalidate(path);await this.edge.warm(path,request=>this.storage.get(path,request));}
 async delete(path:string){await this.storage.delete(path);await this.edge.invalidate(path);}
}
