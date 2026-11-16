import type { Storage } from '../ports';
import {matchesIfRange} from './media-conditions';
export class R2Storage implements Storage {
 constructor(private bucket:R2Bucket){}
 async get(path:string,request:Request){
  const key=path.replace(/^\//,''),range=new Headers(request.headers),validator=range.get('if-range');
  if(validator&&range.has('range')){const metadata=await this.bucket.head(key);if(!metadata)return new Response('Not found',{status:404});if(!matchesIfRange(validator,metadata.httpEtag,metadata.uploaded?.toUTCString()||null))range.delete('range');}
  const object=await this.bucket.get(key,{range,onlyIf:request.headers});
  if(!object)return new Response('Not found',{status:404});
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set('etag',object.httpEtag);headers.set('cache-control','public,max-age=86400');headers.set('x-content-type-options','nosniff');
  if(!('body' in object))return new Response(null,{status:304,headers});
  headers.set('accept-ranges','bytes');if(object.uploaded)headers.set('last-modified',object.uploaded.toUTCString());
  if(range.has('range')&&object.range&&'offset' in object.range&&'length' in object.range&&object.range.offset!==undefined&&object.range.length!==undefined){headers.set('content-range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);headers.set('content-length',String(object.range.length));return new Response(object.body,{status:206,headers});}
  headers.set('content-length',String(object.size));
  return new Response(object.body,{headers});
 }
 async put(path:string,bytes:ArrayBuffer,type:string){await this.bucket.put(path.replace(/^\//,''),bytes,{httpMetadata:{contentType:type}});}
 async delete(path:string){await this.bucket.delete(path.replace(/^\//,''));}
}
