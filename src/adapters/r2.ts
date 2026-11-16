import type { Storage } from '../ports';
export class R2Storage implements Storage {
 constructor(private bucket:R2Bucket){}
 async get(path:string,request:Request){
  const object=await this.bucket.get(path.replace(/^\//,''),{range:request.headers,onlyIf:request.headers});
  if(!object)return new Response('Not found',{status:404});
  const headers=new Headers();object.writeHttpMetadata(headers);headers.set('etag',object.httpEtag);headers.set('cache-control','public,max-age=86400');headers.set('x-content-type-options','nosniff');
  if(!('body' in object))return new Response(null,{status:304,headers});
  if(object.range&&'offset' in object.range&&'length' in object.range&&object.range.offset!==undefined&&object.range.length!==undefined){headers.set('content-range',`bytes ${object.range.offset}-${object.range.offset+object.range.length-1}/${object.size}`);return new Response(object.body,{status:206,headers});}
  return new Response(object.body,{headers});
 }
 async put(path:string,bytes:ArrayBuffer,type:string){await this.bucket.put(path.replace(/^\//,''),bytes,{httpMetadata:{contentType:type}});}
 async delete(path:string){await this.bucket.delete(path.replace(/^\//,''));}
}
