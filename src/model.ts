import { identifier, type Database, type Row } from './ports';
import schema from './generated/schema.json';
export const entities=['article','case','biaoshi','page','category','slide_data','block'] as const;
export type Entity=typeof entities[number];
export function validEntity(s:string):s is Entity{return entities.includes(s as Entity);}
export const escapeHTML=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export class ContentRepository {
 private translations:Map<string,Row>|undefined;
 private queries=new Map<string,Promise<Row[]>>();
 constructor(public db:Database,public locale='zh-CN'){}
 async translate(table:string,rows:Row[]):Promise<Row[]>{
  if(this.locale!=='en')return rows;
  if(!this.translations){const ts=await this.db.all('SELECT * FROM cms_translations WHERE locale=? AND published=1',['en']);this.translations=new Map(ts.map(t=>[t.entity+':'+t.entity_id,JSON.parse(t.fields)]));}
  return rows.map(r=>({...r,...(this.translations!.get(table.replace('jzw_','')+':'+r.id)||{}),_translated:this.translations!.has(table.replace('jzw_','')+':'+r.id)}));
 }
 async query(sql:string,args:unknown[]=[]){
  if(!/^\s*select\b/i.test(sql)||/;|--|\/\*|\b(union|information_schema|sqlite_master|pragma)\b/i.test(sql))throw Error('Only template SELECT queries are allowed');
  const table=sql.match(/\bfrom\s+`?(jzw_[a-z_]+)/i)?.[1];
  if(!table||!(table in schema))throw Error('Unknown public table');
  // Old previous/next queries omitted status. Drafts must never leak through public template queries.
  if(['jzw_article','jzw_case','jzw_biaoshi'].includes(table)){
   const tailAt=sql.search(/\s+(ORDER\s+BY|LIMIT|OFFSET|GROUP\s+BY)\b/i),head=tailAt<0?sql:sql.slice(0,tailAt),tail=tailAt<0?'':sql.slice(tailAt);
   sql=(/\sWHERE\s/i.test(head)?head.replace(/\sWHERE\s+([\s\S]*)/i,' WHERE ($1) AND status=1'):head+' WHERE status=1')+tail;
  }
  const key=sql+JSON.stringify(args);if(!this.queries.has(key))this.queries.set(key,this.db.all(sql,args).then(rows=>this.translate(table,rows)));
  return this.queries.get(key)!;
 }
 async record(entity:string,id:number){const rows=await this.db.all(`SELECT * FROM ${identifier('jzw_'+entity)} WHERE id=?`,[id]);return (await this.translate('jzw_'+entity,rows))[0];}
 model(table=''){return new LegacyModel(this,table.toLowerCase());}
}
export class LegacyModel {
 private condition:string|Row='1'; private ordering='';private fields='*';private window='';
 constructor(private repo:ContentRepository,private table:string){}
 where(v:string|Row){this.condition=v;return this;}
 order(v:string){this.ordering=v;return this;}
 field(v:string){this.fields=v;return this;}
 limit(v:string){this.window=v;return this;}
 async query(sql:string){return this.repo.query(sql);}
 private build(count=false){
  const args:unknown[]=[];
  const cond=typeof this.condition==='string'?this.condition:Object.entries(this.condition).filter(([k])=>k!=='state').map(([k,v])=>{if(Array.isArray(v)){args.push(v[1]);return identifier(k)+' LIKE ?';}args.push(v);return identifier(k)+'=?';}).join(' AND ')||'1';
  if(!/^[a-z_]+$/.test(this.table))throw Error('Invalid model');
  return {sql:`SELECT ${count?'COUNT(*) AS count':this.fields} FROM ${identifier('jzw_'+this.table)} WHERE ${cond}${!count&&this.ordering?' ORDER BY '+this.ordering:''}${!count&&this.window?' LIMIT '+this.window:''}`,args};
 }
 async select(){const {sql,args}=this.build();return this.repo.query(sql,args);}
 async find(){this.window='1';return (await this.select())[0]||null;}
 async count(){const {sql,args}=this.build(true);return Number((await this.repo.query(sql,args))[0]?.count||0);}
}
