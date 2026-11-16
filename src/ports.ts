export type Row = Record<string, any>;
export interface Database {
  all<T extends Row=Row>(sql:string, args?:unknown[]):Promise<T[]>;
  run(sql:string,args?:unknown[]):Promise<void>;
  upsert(table:string,keys:string[],row:Row,increment?:string[]):Promise<void>;
}
export interface Storage {
  get(path:string,request:Request):Promise<Response>;
  put(path:string,bytes:ArrayBuffer,type:string):Promise<void>;
  delete(path:string):Promise<void>;
}
export interface Config { siteUrl:string; adminPasswordHash:string; sessionSecret:string; adminUser:string; }
export interface Services { db:Database; media:Storage; assets:{fetch(request:Request):Promise<Response>}; config:Config; }
export const identifier=(name:string)=>{if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))throw Error('Invalid identifier');return '`'+name+'`';};
