import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
try{process.loadEnvFile('.env');}catch{}
if(!process.env.DATABASE_URL)throw Error('Set DATABASE_URL to an existing, empty MySQL database');
const c=await mysql.createConnection(process.env.DATABASE_URL);
await c.query('CREATE TABLE IF NOT EXISTS cms_migrations (name VARCHAR(191) PRIMARY KEY, applied_at BIGINT)');
const folder=path.resolve('migrations-mysql');
try{
 for(const name of fs.readdirSync(folder).filter(n=>n.endsWith('.sql')).sort()){
  const [done]=await c.query('SELECT name FROM cms_migrations WHERE name=?',[name]);if(done.length)continue;
  // Persist autocommit=0 across MySQL's implicit DDL commits. Batch seed writes per table.
  await c.query('SET autocommit=0');let count=0;
  for(const sql of fs.readFileSync(path.join(folder,name),'utf8').split(';\n'))if(sql.trim()){await c.query(sql);count++;}
  await c.query('INSERT INTO cms_migrations (name,applied_at) VALUES (?,?)',[name,Math.floor(Date.now()/1000)]);await c.commit();console.log(`Applied ${name}: ${count} statements`);
 }
}finally{await c.end();}
