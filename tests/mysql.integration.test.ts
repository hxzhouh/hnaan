import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {MySQLDatabaseAdapter} from '../src/adapters/mysql';
import {fetchApplication} from '../src/app';
import {passwordHash} from '../src/auth';
import type {Services} from '../src/ports';

test('MySQL 8 content, translation, draft and rate-limit lifecycle',{skip:!process.env.MYSQL_TEST_URL},async()=>{
 const url=process.env.MYSQL_TEST_URL!;
 assert.equal(new URL(url).pathname,'/hnaan_ci','Use the dedicated empty hnaan_ci test database');
 const db=new MySQLDatabaseAdapter(url);
 try{
  // Trigger DDL uses the text protocol, matching scripts/migrate-mysql.mjs.
  for(const file of fs.readdirSync('migrations-mysql').filter(n=>n.endsWith('.sql')).sort())for(const sql of fs.readFileSync('migrations-mysql/'+file,'utf8').split(';\n'))if(sql.trim())await db.pool.query(sql);
  for(const sql of fs.readFileSync('tests/fixture.sql','utf8').split(';\n'))if(sql.trim())await db.run(sql);
  const revision=async()=>String((await db.all("SELECT value FROM cms_settings WHERE name='site.revision'"))[0].value);
  const beforeCreate=await revision();
  const services:Services={db,assets:{fetch:async()=>new Response('')},media:{get:async()=>new Response(''),put:async()=>{},delete:async()=>{}},config:{siteUrl:'https://mysql.test',adminUser:'admin',adminPasswordHash:await passwordHash('ci-fixture-password'),sessionSecret:'ci-session-secret-longer-than-thirty-two-characters'}};
  let cookie='';const call=(path:string,body?:unknown,method=body?'POST':'GET')=>fetchApplication(new Request('https://mysql.test'+path,{method,headers:{origin:'https://mysql.test',cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),services);
  const login=await call('/api/admin/login',{username:'admin',password:'ci-fixture-password'});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')!.split(';')[0];
  const response=await call('/api/admin/content/article',{fields:{title:'MySQL中文草稿',content:'<p>中文正文</p>',catid:84,status:0}});assert.equal(response.status,200,await response.clone().text());const {id}=await response.json()as any;assert.notEqual(await revision(),beforeCreate);
  const row=(await db.all('SELECT * FROM jzw_article WHERE id=?',[id]))[0];assert.equal(Number(row.userid),0);assert.equal(Number(row.posid),0);assert.equal(Number(row.status),0);assert.equal((await call(row.url)).status,404);
  assert.equal((await call(`/api/admin/content/article/${id}`,{fields:{status:1}},'PUT')).status,200);
  assert.equal((await call(row.url)).status,200);
  for(const title of ['English draft','Published English'])assert.equal((await call(`/api/admin/content/article/${id}?locale=en`,{fields:{title,content:'<p>MySQL English body</p>'},published:true},'PUT')).status,200);
  const beforeTranslation=await revision();await db.run("UPDATE cms_translations SET fields=fields WHERE entity='article' AND entity_id=?",[id]);assert.notEqual(await revision(),beforeTranslation);
  const html=await(await call('/en'+row.url)).text();assert.ok(html.includes('Published English'));assert.ok(html.includes('MySQL English body'));
  await db.upsert('cms_rate_limits',['id'],{id:'mysql-test-rate',attempts:1,expires_at:9999999999},['attempts']);await db.upsert('cms_rate_limits',['id'],{id:'mysql-test-rate',attempts:1,expires_at:9999999999},['attempts']);assert.equal(Number((await db.all('SELECT attempts FROM cms_rate_limits WHERE id=?',['mysql-test-rate']))[0].attempts),2);
 }finally{await db.pool.end();}
});
