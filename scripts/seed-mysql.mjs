import mysql from 'mysql2/promise';
import fs from 'node:fs';
try{process.loadEnvFile('.env');}catch{}
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required');
const file=process.env.HNAAN_SEED_FILE||'seeds/original-mysql.sql';
if(!fs.existsSync(file))throw Error('Run the private backup importer first; production seed data is intentionally excluded from Git');
const c=await mysql.createConnection(process.env.DATABASE_URL);
try{
 const [rows]=await c.query('SELECT COUNT(*) AS n FROM jzw_article');if(Number(rows[0].n))throw Error('Refusing to seed a non-empty content database');
 await c.query('SET autocommit=0');for(const sql of fs.readFileSync(file,'utf8').split(';\n'))if(sql.trim())await c.query(sql);await c.commit();console.log('Private content seed imported');
}finally{await c.end();}
