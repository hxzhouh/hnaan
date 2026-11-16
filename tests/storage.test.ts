import test from 'node:test';
import assert from 'node:assert/strict';
import {R2Storage} from '../src/adapters/r2';

test('R2 returns full images as 200, byte ranges as 206 and unchanged objects as 304',async()=>{
 const bucket={async head(){return {httpEtag:'"image-etag"',uploaded:new Date('2026-11-16T00:00:00Z')};},async get(_key:string,options:any){
  const common={size:3,httpEtag:'"image-etag"',writeHttpMetadata(headers:Headers){headers.set('content-type','image/png');}};
  if(options.onlyIf.get('if-none-match'))return common;
  const ranged=options.range.has('range');
  // R2 can include a full-object range even when no Range header was sent.
  return {...common,body:ranged?'a':'abc',range:{offset:0,length:ranged?1:3}};
 }};
 const storage=new R2Storage(bucket as any);
 const full=await storage.get('/Uploads/image.png',new Request('https://example.test/Uploads/image.png'));
 assert.equal(full.status,200);assert.equal(full.headers.get('content-range'),null);assert.equal(await full.text(),'abc');
 const partial=await storage.get('/Uploads/image.png',new Request('https://example.test/Uploads/image.png',{headers:{range:'bytes=0-0'}}));
 assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 0-0/3');assert.equal(await partial.text(),'a');
 for(const [validator,status,body]of [['\"image-etag\"',206,'a'],['\"old\"',200,'abc']]as const){const r=await storage.get('/Uploads/image.png',new Request('https://example.test/Uploads/image.png',{headers:{range:'bytes=0-0','if-range':validator}}));assert.equal(r.status,status);assert.equal(await r.text(),body);}
 const unchanged=await storage.get('/Uploads/image.png',new Request('https://example.test/Uploads/image.png',{headers:{'if-none-match':'"image-etag"'}}));
 assert.equal(unchanged.status,304);assert.equal(await unchanged.text(),'');
});
