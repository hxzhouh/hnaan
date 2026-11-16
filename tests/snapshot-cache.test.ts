import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import {ContentRepository} from '../src/model';
import type {Database,Row} from '../src/ports';

test('public snapshots reuse resolved rows and invalidate atomically on source/translation writes',async()=>{
 const sqlite=new DatabaseSync(':memory:');let queries=0;
 for(const file of fs.readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())sqlite.exec(fs.readFileSync('migrations/'+file,'utf8'));
 const db:Database={async all<T extends Row>(sql:string,args:unknown[]=[]){queries++;return sqlite.prepare(sql).all(...args as any[]) as T[];},async run(sql,args=[]){sqlite.prepare(sql).run(...args as any[]);},async upsert(){throw Error('unused');}};
 const revision=()=>String(sqlite.prepare("SELECT value FROM cms_settings WHERE name='site.revision'").get()!.value);
 const repo=()=>new ContentRepository(db,'en',revision());
 try{
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'hnaan_cache_%'").get()!.n,42);
  const initial=revision();
  await db.run("INSERT INTO jzw_article (id,title,status) VALUES (880001,'Original',1)");assert.notEqual(revision(),initial);
  await db.run("INSERT INTO cms_translations (entity,entity_id,locale,fields,published,updated_at) VALUES ('article',880001,'en',?,1,1)",[JSON.stringify({title:'English',content:'<p>Detail only</p>'})]);
  const first=await repo().query('SELECT * FROM jzw_article');assert.equal(first[0].title,'English');assert.equal(first[0].content,undefined);
  const afterFirst=queries;first[0].title='Caller mutation';
  assert.equal((await repo().query('SELECT * FROM jzw_article'))[0].title,'English');assert.equal(queries,afterFirst);
  const detail=await repo().record('article',880001);assert.equal(detail.content,'<p>Detail only</p>');
  assert.equal((await repo().query('SELECT id,title FROM jzw_article'))[0].content,undefined);
  const beforeUpdate=revision();await db.run("UPDATE cms_translations SET fields=? WHERE entity='article' AND entity_id=880001",[JSON.stringify({title:'New English'})]);assert.notEqual(revision(),beforeUpdate);
  assert.equal((await repo().query('SELECT * FROM jzw_article'))[0].title,'New English');
  await db.run("UPDATE cms_translations SET published=0 WHERE entity='article' AND entity_id=880001");assert.equal((await repo().query('SELECT * FROM jzw_article'))[0].title,'Original');
  await db.run('UPDATE jzw_article SET status=0 WHERE id=880001');assert.deepEqual(await repo().query('SELECT * FROM jzw_article'),[]);
  const beforeDelete=revision();await db.run('DELETE FROM jzw_article WHERE id=880001');assert.notEqual(revision(),beforeDelete);
  // Settings edits are fetched every render and never recurse through revision triggers.
  const beforeUI=revision();await db.run("INSERT INTO cms_settings (name,value) VALUES ('ui.en','{}')");assert.equal(revision(),beforeUI);
 }finally{sqlite.close();}
});

test('snapshots are opt-in and failed reads are not shared with later requests',async()=>{
 let calls=0,fail=true;
 const db:Database={async all<T extends Row>(){calls++;if(fail)throw Error('temporary database error');return [{id:1,title:'fresh'}] as unknown as T[];},async run(){},async upsert(){}};
 await assert.rejects(()=>new ContentRepository(db,'zh-CN','failed-snapshot').query('SELECT * FROM jzw_article'));
 fail=false;
 assert.equal((await new ContentRepository(db,'zh-CN','failed-snapshot').query('SELECT * FROM jzw_article'))[0].title,'fresh');assert.equal(calls,2);
 await new ContentRepository(db).query('SELECT * FROM jzw_article');await new ContentRepository(db).query('SELECT * FROM jzw_article');assert.equal(calls,4);
});
