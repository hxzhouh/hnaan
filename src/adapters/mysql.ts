import { createPool, type Pool } from 'mysql2/promise';
import { identifier, type Database, type Row } from '../ports';
export class MySQLDatabaseAdapter implements Database {
 pool:Pool;
 constructor(url:string){this.pool=createPool({uri:url,connectionLimit:8,charset:'utf8mb4'});}
 async all<T extends Row=Row>(sql:string,args:unknown[]=[]):Promise<T[]>{const [rows]=await this.pool.execute(sql,args as any[]);return rows as T[];}
 async run(sql:string,args:unknown[]=[]){await this.pool.execute(sql,args as any[]);}
 async upsert(table:string,keys:string[],row:Row,increment:string[]=[]){
  const cols=Object.keys(row),updates=cols.filter(c=>!keys.includes(c));
  await this.run(`INSERT INTO ${identifier(table)} (${cols.map(identifier)}) VALUES (${cols.map(()=>'?')}) ON DUPLICATE KEY UPDATE ${updates.map(c=>`${identifier(c)}=${increment.includes(c)?`${identifier(c)}+1`:`VALUES(${identifier(c)})`}`).join(',')}`,Object.values(row));
 }
}
