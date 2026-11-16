import { identifier, type Database, type Row } from './ports';
import schema from './generated/schema.json';
export const entities=['article','case','biaoshi','page','category','slide_data','block'] as const;
export type Entity=typeof entities[number];
export function validEntity(s:string):s is Entity{return entities.includes(s as Entity);}
export const escapeHTML=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Only resolved public rows are retained: Workers must not share pending I/O across requests.
const summarySnapshots=new Map<string,Map<string,Row>>();
const publicSnapshots=new Map<string,Row[]>();
function remember<T>(cache:Map<string,T>,key:string,value:T,limit:number){
 cache.delete(key);cache.set(key,value);
 while(cache.size>limit)cache.delete(cache.keys().next().value!);
}
function cloneRows(rows:Row[]){return rows.map(row=>({...row}));}
export class ContentRepository {
 private translations=new Map<string,Row>();
 private translationLoads=new Map<string,Promise<void>>();
 private summaryLoad:Promise<void>|undefined;
 private queries=new Map<string,Promise<Row[]>>();
 constructor(public db:Database,public locale='zh-CN',private snapshotKey=''){}
 async translate(table:string,rows:Row[],includeBodies=false):Promise<Row[]>{
  const entity=table.replace('jzw_','');
  if(this.locale!=='en'||!validEntity(entity))return rows;
  // One compact lookup serves all small legacy template queries. Large article/page
  // bodies stay in the database until the actual detail record is requested.
  const snapshot=this.snapshotKey?summarySnapshots.get(this.snapshotKey):undefined;
  if(snapshot&&!this.summaryLoad){this.translations=new Map(snapshot);this.summaryLoad=Promise.resolve();}
  this.summaryLoad??=this.db.all("SELECT entity,entity_id,CASE WHEN entity IN ('article','case','biaoshi','page') THEN JSON_REMOVE(fields,'$.content','$.wap_content') ELSE fields END AS fields FROM cms_translations WHERE locale=? AND published=1 AND JSON_VALID(fields)",['en']).then(ts=>{
   const summary=new Map<string,Row>();
   for(const t of ts)summary.set(t.entity+':'+t.entity_id,typeof t.fields==='string'?JSON.parse(t.fields):t.fields);
   if(this.snapshotKey)remember(summarySnapshots,this.snapshotKey,summary,2);
   this.translations=new Map(summary);
  });
  await this.summaryLoad;
  if(includeBodies||table==='jzw_page'){
  const ids=[...new Set(rows.map(r=>r.id).filter(id=>id!==undefined&&id!==null))];
  const missing=ids.filter(id=>!this.translationLoads.has(entity+':'+id));
  // D1 limits bound parameters; each batch uses at most 82 across both adapters.
  for(let offset=0;offset<missing.length;offset+=80){
   const batch=missing.slice(offset,offset+80);
   const task=this.db.all(`SELECT entity_id,fields FROM cms_translations WHERE entity=? AND locale=? AND published=1 AND entity_id IN (${batch.map(()=>'?').join(',')})`,[entity,'en',...batch]).then(ts=>{for(const t of ts)this.translations.set(entity+':'+t.entity_id,typeof t.fields==='string'?JSON.parse(t.fields):t.fields);});
   for(const id of batch)this.translationLoads.set(entity+':'+id,task);
  }
  await Promise.all(ids.map(id=>this.translationLoads.get(entity+':'+id)));
  }
  return rows.map(r=>({...r,...(this.translations.get(entity+':'+r.id)||{}),_translated:this.translations.has(entity+':'+r.id)}));
 }
 async query(sql:string,args:unknown[]=[]){
  if(!/^\s*select\b/i.test(sql)||/;|--|\/\*|\b(union|information_schema|sqlite_master|pragma)\b/i.test(sql))throw Error('Only template SELECT queries are allowed');
  const table=sql.match(/\bfrom\s+`?(jzw_[a-z_]+)/i)?.[1];
  if(!table||!(table in schema))throw Error('Unknown public table');
  // These legacy queries render lists/cards; details use record(). Do not transfer
  // unused rich bodies (often duplicated desktop/mobile HTML) for every sidebar.
  if(['jzw_article','jzw_case','jzw_biaoshi'].includes(table)&&/^\s*SELECT\s+\*\s+FROM\b/i.test(sql)){
   const columns=(schema as Record<string,string[]>)[table].filter(name=>!['content','wap_content'].includes(name)).map(identifier).join(',');
   sql=sql.replace(/^(\s*SELECT)\s+\*(\s+FROM\b)/i,(_,select,from)=>select+' '+columns+from);
  }
  // Old previous/next queries omitted status. Drafts must never leak through public template queries.
  if(['jzw_article','jzw_case','jzw_biaoshi'].includes(table)){
   const tailAt=sql.search(/\s+(ORDER\s+BY|LIMIT|OFFSET|GROUP\s+BY)\b/i),head=tailAt<0?sql:sql.slice(0,tailAt),tail=tailAt<0?'':sql.slice(tailAt);
   sql=(/\sWHERE\s/i.test(head)?head.replace(/\sWHERE\s+([\s\S]*)/i,' WHERE ($1) AND status=1'):head+' WHERE status=1')+tail;
  }
  const key=sql+JSON.stringify(args),sharedKey=this.snapshotKey?JSON.stringify([this.snapshotKey,this.locale,key]):'';
  if(!this.queries.has(key)){
   const snapshot=sharedKey?publicSnapshots.get(sharedKey):undefined;
   if(snapshot)this.queries.set(key,Promise.resolve(cloneRows(snapshot)));
   else this.queries.set(key,this.db.all(sql,args).then(rows=>this.translate(table,rows,/\b(?:content|wap_content)\b/i.test(sql))).then(rows=>{
    if(sharedKey)remember(publicSnapshots,sharedKey,cloneRows(rows),256);
    return rows;
   }));
  }
  return this.queries.get(key)!;
 }
 async record(entity:string,id:number){const rows=await this.db.all(`SELECT * FROM ${identifier('jzw_'+entity)} WHERE id=?`,[id]);return (await this.translate('jzw_'+entity,rows,['article','case','biaoshi','page'].includes(entity)))[0];}
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
  const cond=typeof this.condition==='string'?this.condition:Object.entries(this.condition).filter(([k])=>k!=='state').map(([k,v])=>{if(Array.isArray(v)){
   if(k==='title'&&this.repo.locale==='en'&&['article','case','biaoshi'].includes(this.table)){
    args.push(v[1],this.table,'en',v[1]);
    // Both adapters support ->> for unquoted JSON text. Keep the source-title
    // match for Chinese keywords and only search explicitly published translations.
    return "(title LIKE ? OR id IN (SELECT entity_id FROM cms_translations WHERE entity=? AND locale=? AND published=1 AND LOWER(CASE WHEN JSON_VALID(fields) THEN fields ->> '$.title' ELSE NULL END) LIKE LOWER(?)))";
   }
   args.push(v[1]);return identifier(k)+' LIKE ?';
  }args.push(v);return identifier(k)+'=?';}).join(' AND ')||'1';
  if(!/^[a-z_]+$/.test(this.table))throw Error('Invalid model');
  return {sql:`SELECT ${count?'COUNT(*) AS count':this.fields==='*'?'*':'id,'+this.fields} FROM ${identifier('jzw_'+this.table)} WHERE ${cond}${!count&&this.ordering?' ORDER BY '+this.ordering:''}${!count&&this.window?' LIMIT '+this.window:''}`,args};
 }
 async select(){const {sql,args}=this.build();return this.repo.query(sql,args);}
 async find(){this.window='1';return (await this.select())[0]||null;}
 async count(){const {sql,args}=this.build(true);return Number((await this.repo.query(sql,args))[0]?.count||0);}
}
