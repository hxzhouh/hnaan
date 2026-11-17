import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{redirectToHttps} from '../src/index';

test('production HTTP redirects before accessing bindings and preserves host, path, query and method',async()=>{
 for(const host of ['hnaan.cn','www.hnaan.cn'])for(const path of ['/','/en/contact/?view=desktop&from=http%3A%2F%2Fexample.test&tag=one&tag=two','/Uploads/201910/5da5969088e2c.jpg','/cms/','/api/inquiries'])for(const method of ['GET','HEAD','POST']){
  const request=new Request('http://'+host+path,{method,body:method==='POST'?'test body':undefined});
  // Missing database/cache bindings would fail if the redirect ran too late.
  const response=await worker.fetch(request,{SITE_URL:'https://hnaan.cn'}as any,{}as any);
  assert.equal(response.status,308);assert.equal(response.headers.get('location'),'https://'+host+path);
 }
});

test('HTTPS, local development and unrelated hosts do not get upgraded by the production rule',()=>{
 for(const url of ['https://hnaan.cn/','https://www.hnaan.cn/cms/','http://localhost:8787/','http://127.0.0.1:8787/','http://preview.example.test/','http://hnaan.cn.attacker.test/'])assert.equal(redirectToHttps(new Request(url),'https://hnaan.cn'),undefined,url);
 assert.equal(redirectToHttps(new Request('http://hnaan.cn/'),'http://hnaan.cn'),undefined);
 assert.equal(redirectToHttps(new Request('http://hnaan.cn/')),undefined);
 const port=redirectToHttps(new Request('http://example.test:8080/path?q=1'),'https://example.test:8443');assert.equal(port?.headers.get('location'),'https://example.test:8443/path?q=1');
});
