import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {fetchApplication} from '../src/app';
import {passwordHash} from '../src/auth';
import {D1DatabaseAdapter} from '../src/adapters/d1';
import {ContentRepository} from '../src/model';
import {englishHTML} from '../src/render';
import {cleanHTML} from '../src/api';
import vm from 'node:vm';
import {localizeMarketingGraphics} from '../src/english-media';
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
test('media upload and listing expose a complete public delivery URL',async()=>{
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzu0AAAAASUVORK5CYII=','base64');
 const form=new FormData();form.set('file',new File([png],'cdn-test.png',{type:'image/png'}));
 const response=await fetchApplication(new Request('https://example.test/api/admin/media',{method:'POST',headers:{origin:'https://example.test',cookie:session},body:form}),services);
 assert.equal(response.status,201);const uploaded=await response.json()as any;
 assert.match(uploaded.path,/^\/Uploads\/cms\/[\w-]+\.png$/);assert.equal(uploaded.url,'https://example.test'+uploaded.path);
 const listing=await(await fetchApplication(request('/api/admin/media',undefined,'GET',session),services)).json()as any[];
 assert.equal(listing.find(item=>item.path===uploaded.path).url,uploaded.url);
});
test('English loads compact summaries once and fetches large bodies only for requested IDs',async()=>{
 const isolated=new DatabaseSync(':memory:');isolated.exec('CREATE TABLE cms_translations(entity TEXT,entity_id INTEGER,locale TEXT,published INTEGER,fields TEXT);CREATE TABLE jzw_article(id INTEGER,title TEXT,url TEXT,status INTEGER)');
 isolated.prepare('INSERT INTO cms_translations VALUES (?,?,?,?,?)').run('article',1,'en',1,JSON.stringify({title:'Translated neighbor'}));
 isolated.prepare('INSERT INTO cms_translations VALUES (?,?,?,?,?)').run('article',9999,'en',1,'invalid unrelated JSON');
 isolated.prepare('INSERT INTO jzw_article VALUES (?,?,?,?)').run(1,'中文标题','/neighbor.html',1);
 const calls:{sql:string,args:unknown[]}[]=[],adapter={...db,async all(sql:string,args:unknown[]=[]){calls.push({sql,args});return isolated.prepare(sql).all(...args as any[])as any[];},run:db.run.bind(db),upsert:db.upsert.bind(db)};
 try{
  const repo=new ContentRepository(adapter,'en');const neighbor=await repo.model('article').where({id:1}).field('title,url').find();assert.equal(neighbor.title,'Translated neighbor');
  const rows=await repo.translate('jzw_article',Array.from({length:170},(_,i)=>({id:i+1,title:'original'})),true);assert.equal(rows[0].title,'Translated neighbor');assert.equal(rows[1]._translated,false);
  assert.ok(calls.filter(c=>c.sql.includes('cms_translations')&&!c.sql.includes('JSON_REMOVE')).every(c=>c.args.length<=82&&c.sql.includes('entity_id IN')));
  const before=calls.length;await repo.translate('jzw_article',[{id:2}]);assert.equal(calls.length,before,'negative lookup is cached within the request');
 }finally{isolated.close();}
});
test('static Page categories without a page row can publish English without a fallback notice',async()=>{
 const created=await(await fetchApplication(request('/api/admin/content/category',{fields:{catname:'静态测试栏目',module:'Page',parentid:0}},'POST',session),services)).json()as any;
 await fetchApplication(request('/api/admin/content/category/'+created.id,{fields:{template_list:'ziyuan'}},'PUT',session),services);
 const row=(await db.all('SELECT * FROM jzw_category WHERE id=?',[created.id]))[0];
 const result=await fetchApplication(request('/api/admin/content/category/'+created.id+'?locale=en',{fields:{catname:'Static Resources'},published:true},'PUT',session),services);assert.equal(result.status,200);
 const html=await(await fetchApplication(request('/en'+row.url),services)).text();assert.ok(!html.includes('English translation is being prepared'));assert.ok(!html.includes('noindex,follow'));
});

test('complex English service pages stay within the D1 Free query budget',async()=>{
 for(const path of ['/en/fuwu/','/en/fuwu/zhizuo/']){
  let calls=0;const guarded={...services,db:{all:async(sql:string,args?:unknown[])=>{assert.ok(++calls<=50,'D1 query budget exceeded');return db.all(sql,args);},run:db.run.bind(db),upsert:db.upsert.bind(db)}};
  const response=await fetchApplication(request(path),guarded);assert.equal(response.status,200,path);assert.ok(calls<=50);
 }
});
test('UI overrides translate whitespace consistently in SEO, text, attributes and alerts while retaining URLs and scripts',async()=>{
 await db.upsert('cms_settings',['name'],{name:'ui.en',value:JSON.stringify({'测试  品牌':'Test Brand','测试</script>':'Safe Value','价格':'$100 $& $1'})});
 try{
  const html=await englishHTML('<html><head><meta name="description" content="测试  品牌"><script>const untouched="测试  品牌";</script></head><body><p>测试  品牌</p><a href="/测试  品牌" title="测试  品牌">Link</a></body></html>',services);
  assert.ok(html.includes('<p>Test Brand</p>'));assert.ok(html.includes('content="Test Brand"'));assert.ok(html.includes('title="Test Brand"'));assert.ok(html.includes('href="/测试  品牌"'));assert.ok(html.includes('const untouched="测试  品牌"'));
  const script=html.match(/<head><script>([\s\S]*?)<\/script>/)![1],alerts:string[]=[];const window:any={alert:(s:string)=>alerts.push(s)};
  vm.runInNewContext(script,{window});window.alert('测试  品牌');assert.deepEqual(alerts,['Test Brand']);assert.equal(window.siteTranslate('测试</script>'),'Safe Value');assert.equal(window.siteTranslate('价格'),'$100 $& $1');
 }finally{await db.run('DELETE FROM cms_settings WHERE name=?',['ui.en']);}
});
test('English marketing artwork keeps its original photo and leaves replacement CMS images untouched',()=>{
 const original='<img src="/Uploads/201811/5bf20784987d9.jpg" alt="Signage design">',localized=localizeMarketingGraphics(original);
 assert.ok(localized.includes(original));assert.ok(localized.includes('15+ Years in Signage'));
 const custom='<img src="/Uploads/cms/new-english-banner.png" alt="New banner">';assert.equal(localizeMarketingGraphics(custom),custom);
 assert.ok(localizeMarketingGraphics('<img src="/Jzw/Tpl/Wap/Default/images/zh2.png">').includes('Unreliable quality'));
});

test('list projections omit unused rich bodies while details and explicit body queries retain them',async()=>{
 const repo=new ContentRepository(db);
 const list=await repo.query('SELECT * FROM jzw_article WHERE id=323');assert.equal(list.length,1);assert.ok(!('content'in list[0]));assert.ok(!('wap_content'in list[0]));assert.ok(list[0].title);
 const detail=await repo.record('article',323);assert.ok(detail.content);
 const explicit=await repo.query('SELECT content FROM jzw_article WHERE id=323');assert.equal(explicit[0].content,detail.content);
});
test('HTML cleanup preserves legacy inline styles and still rejects executable markup and URLs',()=>{
 const style='color: #123456; font-family: Arial';
 const safe=cleanHTML(`<p style="${style}" onclick="bad()">Safe <b>text</b></p><img src="/safe.png" onerror="bad()"><a href="javascript:bad()">link</a><script>bad()</script>`);
 assert.ok(safe.includes(`style="${style}"`));assert.ok(safe.includes('<b>text</b>'));assert.doesNotMatch(safe,/onclick|onerror|javascript:|<script/);assert.equal(cleanHTML('Plain > text'),'Plain > text');assert.equal(cleanHTML('A & B'),'A &amp; B');
});
test('compiled English UI updates immediately when its stored dictionary changes',async()=>{
 const html='<html><head></head><body>测试品牌</body></html>';
 try{
  await db.upsert('cms_settings',['name'],{name:'ui.en',value:JSON.stringify({'测试品牌':'First Brand'})});
  const first=await englishHTML(html,services);assert.ok(first.includes('<body>First Brand</body>'));assert.equal(await englishHTML(html,services),first);
  await db.upsert('cms_settings',['name'],{name:'ui.en',value:JSON.stringify({'测试品牌':'Updated Brand'})});
  assert.ok((await englishHTML(html,services)).includes('<body>Updated Brand</body>'));
 }finally{await db.run('DELETE FROM cms_settings WHERE name=?',['ui.en']);}
});
