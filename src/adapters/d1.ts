import { identifier, type Database, type Row } from '../ports';
export class D1DatabaseAdapter implements Database {
 constructor(private db:D1Database){}
 async all<T extends Row=Row>(sql:string,args:unknown[]=[]):Promise<T[]>{return (await this.db.prepare(sql).bind(...args).all<T>()).results;}
 async run(sql:string,args:unknown[]=[]){await this.db.prepare(sql).bind(...args).run();}
 async upsert(table:string,keys:string[],row:Row,increment:string[]=[]){
  const cols=Object.keys(row),updates=cols.filter(c=>!keys.includes(c));
  await this.run(`INSERT INTO ${identifier(table)} (${cols.map(identifier)}) VALUES (${cols.map(()=>'?')}) ON CONFLICT (${keys.map(identifier)}) DO UPDATE SET ${updates.map(c=>`${identifier(c)}=${increment.includes(c)?`${identifier(c)}+1`:`excluded.${identifier(c)}`}`).join(',')}`,Object.values(row));
 }
}
