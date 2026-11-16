import test from 'node:test';
import assert from 'node:assert/strict';
import {MediaEdgeCache,EdgeCachedStorage} from '../src/adapters/edge-cache';
import type {Storage} from '../src/ports';

class MemoryCache {
 entries=new Map<string,Response>();
 async put(request:Request,response:Response){this.entries.set(request.url,new Response(await response.arrayBuffer(),{status:response.status,headers:response.headers}));}
 async delete(request:Request){return this.entries.delete(request.url);}
 async match(request:Request){
  const saved=this.entries.get(request.url);if(!saved)return undefined;
  if(request.headers.get('if-none-match')===saved.headers.get('etag'))return new Response(null,{status:304,headers:saved.headers});
  if(request.headers.has('range')){const data=await saved.clone().text(),headers=new Headers(saved.headers);headers.set('content-range',`bytes 1-2/${data.length}`);headers.set('content-length','2');return new Response(data.slice(1,3),{status:206,headers});}
  return saved.clone();
 }
}
const response=(body='image')=>new Response(body,{headers:{'content-type':'image/png','content-length':String(body.length),etag:'"image-v1"','cf-cache-status':'MISS'}});
test('media cache serves GET, HEAD, ranges and conditional hits across site aliases',async()=>{
 const cache=new MemoryCache(),tasks:Promise<unknown>[]=[],edge=new MediaEdgeCache(cache as any,p=>tasks.push(p),'https://example.test');let reads=0;
 const load=async()=>{reads++;return response();};
 const first=await edge.get('/Uploads/a.png',new Request('https://example.test/Uploads/a.png'),load);
 assert.equal(first.headers.get('x-media-cache'),'MISS');assert.equal(await first.text(),'image');await Promise.all(tasks);
 assert.match(first.headers.get('cache-control')!,/s-maxage=604800/);
 const second=await edge.get('/Uploads/a.png',new Request('https://www.example.test/Uploads/a.png'),load);
 assert.equal(second.headers.get('x-media-cache'),'HIT');assert.equal(await second.text(),'image');assert.equal(reads,1);
 const head=await edge.get('/Uploads/a.png',new Request('https://example.test/Uploads/a.png',{method:'HEAD'}),load);
 assert.equal(head.headers.get('content-length'),'5');assert.equal(await head.text(),'');
 const range=await edge.get('/Uploads/a.png',new Request('https://example.test/Uploads/a.png',{headers:{range:'bytes=1-2'}}),load);
 assert.equal(range.status,206);assert.equal(await range.text(),'ma');assert.equal(range.headers.get('x-media-cache'),'HIT');
 for(const [validator,status,body]of [['\"image-v1\"',206,'ma'],['\"old\"',200,'image'],['W/\"image-v1\"',200,'image']]as const){const r=await edge.get('/Uploads/a.png',new Request('https://example.test/Uploads/a.png',{headers:{range:'bytes=1-2','if-range':validator}}),load);assert.equal(r.status,status);assert.equal(await r.text(),body);}
 const unchanged=await edge.get('/Uploads/a.png',new Request('https://example.test/Uploads/a.png',{headers:{'if-none-match':'"image-v1"'}}),load);
 assert.equal(unchanged.status,304);assert.equal(reads,1);
});
test('uploads warm the delivery cache and deletion invalidates the local entry',async()=>{
 let body='';let reads=0;
 const storage:Storage={async get(){reads++;return body?response(body):new Response('missing',{status:404});},async put(_path,bytes){body=new TextDecoder().decode(bytes);},async delete(){body='';}};
 const cache=new MemoryCache(),edge=new MediaEdgeCache(cache as any,()=>{},'https://example.test'),media=new EdgeCachedStorage(storage,edge);
 await media.put('/Uploads/cms/new.png',new TextEncoder().encode('image').buffer,'image/png');assert.equal(reads,1);
 const uploaded=await media.get('/Uploads/cms/new.png',new Request('https://example.test/Uploads/cms/new.png'));
 assert.equal(uploaded.headers.get('x-media-cache'),'HIT');assert.equal(await uploaded.text(),'image');assert.equal(reads,1);
 await media.delete('/Uploads/cms/new.png');assert.equal((await media.get('/Uploads/cms/new.png',new Request('https://example.test/Uploads/cms/new.png'))).status,404);
});
test('partial origins are not cached and cache outages do not break media uploads',async()=>{
 const cache=new MemoryCache(),tasks:Promise<unknown>[]=[],edge=new MediaEdgeCache(cache as any,p=>tasks.push(p),'https://example.test');
 const partial=await edge.get('/Uploads/range.mp4',new Request('https://example.test/Uploads/range.mp4',{headers:{range:'bytes=0-0'}}),async()=>new Response('i',{status:206}));
 assert.equal(partial.status,206);assert.equal(cache.entries.size,0);assert.equal(tasks.length,0);
 const broken={async match(){throw Error('offline');},async put(){throw Error('offline');},async delete(){throw Error('offline');}};
 const quiet=console.warn;console.warn=()=>{};
 try{
  let saved=false;const inner:Storage={get:async()=>response(),put:async()=>{saved=true;},delete:async()=>{}};
  const fault=new MediaEdgeCache(broken as any,p=>tasks.push(p),'https://example.test'),media=new EdgeCachedStorage(inner,fault);
  await media.put('/Uploads/cms/new.png',new ArrayBuffer(1),'image/png');assert.equal(saved,true);
  const read=await media.get('/Uploads/cms/new.png',new Request('https://example.test/Uploads/cms/new.png'));assert.equal(await read.text(),'image');await Promise.all(tasks);
 }finally{console.warn=quiet;}
});

test('static assets miss after deployment and keep query-based variants separate',async()=>{
 const cache=new MemoryCache(),tasks:Promise<unknown>[]=[],wait=(p:Promise<unknown>)=>tasks.push(p);let reads=0;
 for(const version of ['old','new']){
  const edge=new MediaEdgeCache(cache as any,wait,'https://example.test',version);
  const first=await edge.get('/logo.png?v=1',new Request('https://example.test/logo.png?v=1'),async()=>{reads++;return response(version);});
  assert.equal(first.headers.get('x-media-cache'),'MISS');assert.match(first.headers.get('cache-control')!,/max-age=0,must-revalidate/);assert.equal(await first.text(),version);await Promise.all(tasks);
  for(const entry of cache.entries.values())entry.headers.set('cache-control','public,max-age=14400');
  const hit=await edge.get('/logo.png?v=1',new Request('https://example.test/logo.png?v=1'),async()=>{throw Error('must hit');});assert.equal(hit.headers.get('x-media-cache'),'HIT');assert.match(hit.headers.get('cache-control')!,/max-age=0,must-revalidate/);
  const variant=await edge.get('/logo.png?v=2',new Request('https://example.test/logo.png?v=2'),async()=>response('variant'));assert.equal(variant.headers.get('x-media-cache'),'MISS');await Promise.all(tasks);
 }
 assert.equal(reads,2);
});
