import test,{before} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {fetchApplication} from '../src/app';
import {passwordHash} from '../src/auth';
import {D1DatabaseAdapter} from '../src/adapters/d1';
import {ContentRepository} from '../src/model';
import type {Services} from '../src/ports';
const sqlite=new DatabaseSync(':memory:');
const mockD1={prepare(sql:string){let args:any[]=[];const stmt={bind(...values:any[]){args=values;return stmt;},async all(){return {results:sqlite.prepare(sql).all(...args)};},async run(){sqlite.prepare(sql).run(...args);return {success:true};}};return stmt;}};
const db=new D1DatabaseAdapter(mockD1 as any);
let services:Services,session='';
before(async()=>{sqlite.exec(fs.readFileSync('migrations/0001_original_content.sql','utf8'));services={db,assets:{fetch:async()=>new Response('static')},media:{get:async()=>new Response('image'),put:async()=>{},delete:async()=>{}},config:{siteUrl:'https://example.test',adminUser:'admin',adminPasswordHash:await passwordHash('a-long-test-password'),sessionSecret:'test-session-secret-at-least-32-characters'}};});
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
