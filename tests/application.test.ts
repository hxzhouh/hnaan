import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {fetchApplication} from '../src/app';
import {passwordHash} from '../src/auth';
import {D1DatabaseAdapter} from '../src/adapters/d1';
import {ContentRepository} from '../src/model';
import type {Services} from '../src/ports';
import columnTypes from '../src/generated/column-types.json';
import {FileStorage} from '../src/adapters/filesystem';
import os from 'node:os';
import path from 'node:path';
const sqlite=new DatabaseSync(':memory:');
const mockD1={prepare(sql:string){let args:any[]=[];const stmt={bind(...values:any[]){args=values;return stmt;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){sqlite.prepare(sql).run(...args);return {success:true};}};return stmt;}};
const db=new D1DatabaseAdapter(mockD1 as any);
let services:Services,session='';
before(async()=>{sqlite.exec(fs.readFileSync('migrations/0001_schema.sql','utf8'));sqlite.exec(fs.readFileSync('tests/fixture.sql','utf8'));services={db,assets:{fetch:async()=>new Response('static')},media:{get:async()=>new Response('image'),put:async()=>{},delete:async()=>{}},config:{siteUrl:'https://example.test',adminUser:'admin',adminPasswordHash:await passwordHash('a-long-test-password'),sessionSecret:'test-session-secret-at-least-32-characters'}};});
const request=(path:string,body?:any,method=body?'POST':'GET',cookie='')=>new Request('https://example.test'+path,{method,headers:{origin:'https://example.test',cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
test('admin requires authentication and rejects cross-origin writes',async()=>{
 assert.equal((await fetchApplication(request('/api/admin/session'),services)).status,401);
 assert.equal((await fetchApplication(new Request('https://example.test/api/admin/login',{method:'POST',headers:{origin:'https://attacker.invalid'},body:'{}'}),services)).status,403);
});
test('password login issues an HttpOnly signed cookie; forged cookies fail',async()=>{
 const response=await fetchApplication(request('/api/admin/login',{username:'admin',password:'a-long-test-password'}),services);
 assert.equal(response.status,200);session=response.headers.get('set-cookie')!.split(';')[0];assert.match(response.headers.get('set-cookie')!,/HttpOnly/);assert.match(response.headers.get('set-cookie')!,/Secure/);
 assert.equal((await fetchApplication(request('/api/admin/session',undefined,'GET',session),services)).status,200);
 assert.equal((await fetchApplication(request('/api/admin/session',undefined,'GET',session+'forged'),services)).status,401);
});
test('create, translate, publish and unpublish affect actual public pages',async()=>{
 const created=await fetchApplication(request('/api/admin/content/article',{fields:{title:'测试中文标题',description:'中文摘要',content:'<p>中文正文</p><script>alert(1)</script>',catid:84}},'POST',session),services);
 assert.equal(created.status,200);const {id}=await created.json() as any;const row=(await db.all('SELECT * FROM jzw_article WHERE id=?',[id]))[0];assert.ok(!row.content.includes('<script>'));
 assert.equal((await fetchApplication(request(row.url),services)).status,200);
 const incomplete=await fetchApplication(request(`/api/admin/content/article/${id}?locale=en`,{fields:{title:'English title'},published:true},'PUT',session),services);assert.equal(incomplete.status,400);
 const english=await fetchApplication(request(`/api/admin/content/article/${id}?locale=en`,{fields:{title:'English title',description:'English summary',content:'<p>English body</p>'},published:true},'PUT',session),services);assert.equal(english.status,200);
 const html=await(await fetchApplication(request('/en'+row.url),services)).text();assert.ok(html.includes('English body'));assert.ok(!html.includes('English translation is being prepared'));
 await fetchApplication(request(`/api/admin/content/article/${id}`,{fields:{status:0}},'PUT',session),services);
 assert.equal((await fetchApplication(request(row.url),services)).status,404);assert.equal((await fetchApplication(request('/en'+row.url),services)).status,404);
 const publicArticle=await(await fetchApplication(request('/news/a1/323.html'),services)).text();assert.ok(!publicArticle.includes('测试中文标题'));
});
test('visitor messages are stored privately and throttled with atomic upserts',async()=>{
 for(let i=0;i<5;i++)assert.equal((await fetchApplication(request('/api/inquiries',{name:'QA',phone:'13800000000',message:'<script>private message</script>'}),services)).status,200);
 assert.equal((await fetchApplication(request('/api/inquiries',{name:'QA',phone:'13800000000'}),services)).status,429);
 assert.equal((await fetchApplication(request('/api/admin/inquiries'),services)).status,401);
 assert.equal((await db.all('SELECT COUNT(*) AS n FROM cms_inquiries'))[0].n,5);
});
test('template SQL cannot access non-public tables or inject extra statements',async()=>{
 const repo=new ContentRepository(db);
 await assert.rejects(()=>repo.query('SELECT * FROM cms_inquiries'));
 await assert.rejects(()=>repo.query('SELECT * FROM jzw_article; DELETE FROM jzw_article'));
 await assert.rejects(()=>repo.query('SELECT * FROM jzw_article UNION SELECT * FROM cms_inquiries'));
});
test('body limits work even without Content-Length',async()=>{
 const response=await fetchApplication(request('/api/admin/login',{password:'x'.repeat(20000)}),services);assert.equal(response.status,413);
});
test('every CMS entity can be created with correctly typed columns and draft status',async()=>{
 const cases:any[]=[['article',{title:'草稿文章',catid:84,status:0}],['case',{title:'草稿案例',catid:120,status:0}],['biaoshi',{title:'草稿项目',catid:139,status:0}],['category',{catname:'测试栏目',parentid:93,module:'Case'}],['slide_data',{title:'轮播草稿',fid:23,status:0}],['block',{name:'测试区块',pos:'test',content:'<p>内容</p>'}],['page',{title:'测试单页',content:'<p>中文正文</p>'}]];
 for(const [entity,fields]of cases){const response=await fetchApplication(request('/api/admin/content/'+entity,{fields,categoryId:127},'POST',session),services);assert.equal(response.status,200,entity+': '+await response.clone().text());const {id}=await response.json()as any;const row=(await db.all(`SELECT * FROM jzw_${entity} WHERE id=?`,[id]))[0];for(const [key,type]of Object.entries((columnTypes as any)['jzw_'+entity]))if(type==='number')assert.equal(typeof row[key],'number',entity+'.'+key);if(fields.status===0)assert.equal(row.status,0);}
});
test('page translation controls fallback and canonical URLs follow CMS edits',async()=>{
 const result=await fetchApplication(request('/api/admin/content/page/127?locale=en',{fields:{title:'English page',content:'<p>English body</p>'},published:true},'PUT',session),services);assert.equal(result.status,200);
 const html=await(await fetchApplication(request('/en/hangye/hy4/'),services)).text();assert.ok(html.includes('English body'));assert.ok(!html.includes('English translation is being prepared'));assert.ok(!html.includes('noindex,follow'));
 await fetchApplication(request('/api/admin/content/article/323',{fields:{url:'/news/updated-fixture.html'}},'PUT',session),services);
 const old=await fetchApplication(request('/news/a1/323.html'),services);assert.equal(old.status,301);assert.equal(old.headers.get('location'),'https://example.test/news/updated-fixture.html');
 const current=await fetchApplication(request('/news/updated-fixture.html'),services);assert.equal(current.status,200);
});
test('portable filesystem serves the CMS directory index',async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hnaan-cms-test-'));try{fs.mkdirSync(path.join(temp,'cms'));fs.writeFileSync(path.join(temp,'cms/index.html'),'CMS test');const assets=new FileStorage(temp);for(const url of ['/cms','/cms/']){const response=await fetchApplication(request(url),{...services,assets});assert.equal(response.status,200);assert.equal(await response.text(),'CMS test');}}finally{fs.rmSync(temp,{recursive:true,force:true});}
});
test('legacy homepage highlights render as safe spans and remain escaped in image attributes',async()=>{
 const subtitle='<span onclick="bad()">资深</span>标识设计团队<script>alert(1)</script>';
 await db.run('INSERT INTO jzw_slide_data (id,fid,title,subtitle,description,pic,listorder,status) VALUES (?,?,?,?,?,?,?,?)',[580001,24,'01',subtitle,'测试介绍','/safe.png',0,1]);
 const html=await(await fetchApplication(request('/'),services)).text();
 assert.ok(html.includes('<h2><span>资深</span>标识设计团队</h2>'));
 assert.ok(html.includes('alt="&lt;span onclick=&quot;bad()&quot;&gt;资深&lt;/span&gt;标识设计团队&lt;script&gt;alert(1)&lt;/script&gt;"'));
 assert.ok(!html.includes('<span onclick="bad()">'));assert.ok(!html.includes('<script>alert(1)</script>'));
});
test('CMS slide edits preserve approved inline highlights and remove executable markup',async()=>{
 const result=await fetchApplication(request('/api/admin/content/slide_data/580001',{fields:{subtitle:'<span onclick="bad()">11项</span>定制服务标准<script>alert(1)</script>'}},'PUT',session),services);
 assert.equal(result.status,200);
 assert.equal((await db.all('SELECT subtitle FROM jzw_slide_data WHERE id=?',[580001]))[0].subtitle,'<span>11项</span>定制服务标准');
 const html=await(await fetchApplication(request('/'),services)).text();assert.ok(html.includes('<h2><span>11项</span>定制服务标准</h2>'));
});
test('resource and service pages render their shared desktop and mobile layouts',async()=>{
 for(const path of ['/ziyuan/','/about/youshi/','/fuwu/zhizuo/','/sitemap/'])for(const mobile of [false,true]){
  const r=request(path);if(mobile)r.headers.set('user-agent','iPhone Mobile');
  const response=await fetchApplication(r,services);assert.equal(response.status,200,path);
  const html=await response.text();assert.doesNotMatch(html,/<include\b/i,path);assert.match(html,/<title>[^<]+<\/title>/,path);
  assert.ok(html.includes(mobile?'/Jzw/Tpl/Wap/Default/css/style.css':'/Jzw/Tpl/Home/Default/css/aiaoni.css'),path);
  if(mobile&&path==='/fuwu/zhizuo/')assert.equal((html.match(/class="ce-nav"/g)||[]).length,1,'The mobile menu must have one dismissible overlay');
 }
});
