import sanitize from 'sanitize-html';
import schema from './generated/schema.json';
import columnTypes from './generated/column-types.json';
import { validEntity, entities, escapeHTML,ContentRepository } from './model';
import { authenticated,cookie,equal,limited,passwordHash,sessionToken } from './auth';
import { identifier,type Services,type Row,type Database } from './ports';
export const json=(value:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...headers}});
const htmlOptions={allowedTags:[...sanitize.defaults.allowedTags,'img','h1','h2','span','video','source','font','center'],allowedAttributes:{'*':['class','style','title'],'a':['href','target','rel'],'img':['src','alt','width','height','loading'],'video':['src','controls','poster','width','height'],'source':['src','type'],'font':['color','face','size']},allowedSchemes:['http','https','mailto','tel'],allowProtocolRelative:false,parseStyleAttributes:false};
// Inline CSS is allowed by the existing policy; no CSS allowlist is configured.
// Keep it verbatim instead of building a PostCSS tree for every legacy span.
export function cleanHTML(value:string){return /[<&]/.test(value)?sanitize(value,htmlOptions):value;}
export function cleanInlineHTML(value:string){return sanitize(value,{allowedTags:['span','strong','b','em','i','br'],allowedAttributes:{}});}
const mediaURL=(path:string,s:Services)=>new URL(path,s.config.siteUrl).href;
const isNumeric=(entity:string,key:string)=>(columnTypes as Record<string,Record<string,string>>)['jzw_'+entity]?.[key]==='number';
async function rebuildCategories(db:Database){
 const rows=await db.all('SELECT id,parentid,child,arrparentid,arrchildid FROM jzw_category');
 for(const row of rows){
  const descendants=(id:number,seen=new Set<number>()):number[]=>{if(seen.has(id))throw Error('Category cycle');seen.add(id);return [id,...rows.filter(r=>Number(r.parentid)===id).flatMap(r=>descendants(Number(r.id),new Set(seen)))];};
  const childIds=descendants(Number(row.id)),parents:number[]=[];let parent=Number(row.parentid),seen=new Set<number>();
  while(parent&& !seen.has(parent)){seen.add(parent);parents.unshift(parent);parent=Number(rows.find(r=>Number(r.id)===parent)?.parentid||0);}
  const arrchildid=childIds.join(','),arrparentid=[0,...parents].join(','),child=childIds.length>1?1:0;
  if(arrchildid!==String(row.arrchildid)||arrparentid!==String(row.arrparentid)||child!==Number(row.child))await db.run('UPDATE jzw_category SET arrchildid=?,arrparentid=?,child=? WHERE id=?',[arrchildid,arrparentid,child,row.id]);
 }
}
function fieldsFor(entity:string){return (schema as Record<string,string[]>)['jzw_'+entity]||[];}
function cleanFields(entity:string,row:Row){
 const allowed=fieldsFor(entity),out:Row={};
 for(const [k,v]of Object.entries(row)){
  if(!allowed.includes(k)||k==='id')continue;
  if(isNumeric(entity,k)){const n=Number(v);if(!Number.isFinite(n))throw Error('Invalid number: '+k);out[k]=n;}
  else if(['content','wap_content'].includes(k))out[k]=cleanHTML(String(v).slice(0,1500000));
  else if(entity==='slide_data'&&k==='subtitle')out[k]=cleanInlineHTML(String(v).slice(0,10000));
  else{out[k]=sanitize(String(v),{allowedTags:[],allowedAttributes:{}}).slice(0,10000);if(['url','thumb','pic','small','link'].includes(k)&&/^\s*(javascript|data|vbscript):/i.test(out[k]))throw Error('Invalid URL');}
 }
 return out;
}
export async function handleAPI(request:Request,s:Services){
 const url=new URL(request.url),path=url.pathname,method=request.method;
 if(method!=='GET'&&method!=='HEAD'&&request.headers.get('origin')!==url.origin)return json({error:'Invalid origin'},403);
 if(Number(request.headers.get('content-length')||0)>26*1024*1024)return json({error:'Request too large'},413);
 if(request.body){
  const max=path==='/api/admin/media'?26*1024*1024:path==='/api/admin/login'?16384:4*1024*1024;
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let size=0;
  while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>max){await reader.cancel();return json({error:'Request too large'},413);}chunks.push(chunk.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  request=new Request(request,{body:bytes});
 }
 if(path==='/api/content'&&method==='GET'){
  const entity=url.searchParams.get('table')||url.searchParams.get('entity');if(!['article','case','biaoshi'].includes(String(entity)))return json({error:'Invalid content type'},400);
  const ids=String(url.searchParams.get('catids')||'').split(',').slice(0,100).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0);
  if(!ids.length)return json([]);
  const page=Math.min(10000,Math.max(1,Number(url.searchParams.get('nowPage')||url.searchParams.get('page'))||1)),size=Math.min(30,Math.max(1,Number(url.searchParams.get('size'))||6));
  const repo=new ContentRepository(s.db,url.searchParams.get('locale')==='en'?'en':'zh-CN');
  const rows=await repo.query(`SELECT id,title,url,thumb,description,createtime FROM jzw_${entity} WHERE status=1 AND catid IN (${ids.map(()=>'?')}) ORDER BY listorder DESC,createtime DESC LIMIT ${Math.floor(size)} OFFSET ${Math.floor((page-1)*size)}`,ids);
  return json(rows.map(r=>({...r,title:escapeHTML(r.title),url:escapeHTML(r.url),thumb:escapeHTML(r.thumb),description:cleanHTML(String(r.description||''))})));
 }
 if(path==='/api/admin/login'&&method==='POST'){
  if(!s.config.adminPasswordHash||s.config.sessionSecret.length<32)return json({error:'请先配置管理员密码与会话密钥'},503);
  if(await limited(s,'login:'+(request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'local'),10,900))return json({error:'尝试次数过多，请稍后重试'},429);
  const body=await request.json() as Row;const salt=s.config.adminPasswordHash.split('$')[2];
  if(!salt||String(body.password||'').length>256||body.username!==s.config.adminUser||!equal(await passwordHash(String(body.password||''),salt),s.config.adminPasswordHash))return json({error:'用户名或密码错误'},401);
  return json({ok:true},200,{'set-cookie':cookie(request,await sessionToken(s))});
 }
 if(path==='/api/inquiries'&&method==='POST'){
  const inquiry=await request.json()as Row,en=inquiry.locale==='en';
  if(await limited(s,'inquiry:'+(request.headers.get('cf-connecting-ip')||request.headers.get('x-real-ip')||'local'),5,3600))return json({error:en?'Too many messages. Please try again later.':'提交次数过多，请稍后重试'},429);
  const b=inquiry;
  if(b.website)return json({ok:true});
  const name=String(b.name||'').trim(),phone=String(b.phone||'').trim(),email=String(b.email||'').trim(),message=String(b.message||'').trim();
  if(!name||name.length>100||!phone||phone.length>80||message.length>5000||email.length>200)return json({error:en?'Please enter a valid name and phone number.':'请填写有效的姓名和联系电话'},400);
  await s.db.run('INSERT INTO cms_inquiries (id,name,email,phone,message,locale,created_at,status) VALUES (?,?,?,?,?,?,?,?)',[crypto.randomUUID(),name,email,phone,message,b.locale==='en'?'en':'zh-CN',Math.floor(Date.now()/1000),'new']);return json({ok:true});
 }
 if(!await authenticated(request,s))return json({error:'请登录'},401);
 if(path==='/api/admin/logout'&&method==='POST')return json({ok:true},200,{'set-cookie':cookie(request,'',0)});
 if(path==='/api/admin/categories')return json(await s.db.all('SELECT id,catname,module,parentid FROM jzw_category ORDER BY listorder ASC,id ASC'));
 if(path==='/api/admin/session')return json({user:s.config.adminUser,entities});
 if(path==='/api/admin/inquiries'){
  if(method==='GET')return json(await s.db.all('SELECT * FROM cms_inquiries ORDER BY created_at DESC LIMIT 500'));
  const b=await request.json()as Row;await s.db.run('UPDATE cms_inquiries SET status=? WHERE id=?',[b.status==='read'?'read':'new',String(b.id)]);return json({ok:true});
 }
 if(path==='/api/admin/media'){
  if(method==='GET'){const q='%'+(url.searchParams.get('q')||'')+'%',page=Math.max(0,Number(url.searchParams.get('page'))||0);return json((await s.db.all('SELECT * FROM cms_media WHERE name LIKE ? ORDER BY created_at DESC LIMIT 60 OFFSET '+Math.floor(page*60),[q])).map(row=>({...row,url:mediaURL(row.path,s)})));}
  if(method==='POST'){
   const form=await request.formData(),file=form.get('file');
   if(!file||typeof file==='string'||file.size>25*1024*1024)return json({error:'文件为空或超过25MB'},400);
   const ext=file.name.split('.').pop()?.toLowerCase();
   if(!ext||!['jpg','jpeg','png','gif','webp','avif','mp4','pdf'].includes(ext))return json({error:'不支持的文件类型'},400);
   const bytes=await file.arrayBuffer(),sig=new Uint8Array(bytes);
   const matches=ext==='jpg'||ext==='jpeg'?sig[0]===255&&sig[1]===216:ext==='png'?sig[0]===137&&sig[1]===80:ext==='gif'?sig[0]===71&&sig[1]===73:ext==='webp'?new TextDecoder().decode(sig.slice(8,12))==='WEBP':ext==='pdf'?new TextDecoder().decode(sig.slice(0,4))==='%PDF':new TextDecoder().decode(sig.slice(4,8))==='ftyp';
   if(!matches)return json({error:'文件内容与扩展名不匹配'},400);
   const type=ext==='pdf'?'application/pdf':ext==='mp4'?'video/mp4':'image/'+(ext==='jpg'?'jpeg':ext);
   const path='/Uploads/cms/'+crypto.randomUUID()+'.'+ext;
   await s.media.put(path,bytes,type);await s.db.run('INSERT INTO cms_media (path,name,size,type,created_at) VALUES (?,?,?,?,?)',[path,file.name.slice(0,200),file.size,type,Math.floor(Date.now()/1000)]);return json({path,url:mediaURL(path,s)},201);
  }
 }
 if(path==='/api/admin/ui'){
  if(method==='GET')return json((await s.db.all('SELECT value FROM cms_settings WHERE name=?',['ui.en']))[0]?.value||'{}');
  const b=await request.json()as Row;const dict=JSON.parse(String(b.value));if(!dict||Array.isArray(dict)||typeof dict!=='object'||Object.values(dict).some(v=>typeof v!=='string'))return json({error:'请输入中文到英文的 JSON 字典'},400);
  await s.db.upsert('cms_settings',['name'],{name:'ui.en',value:JSON.stringify(dict)});return json({ok:true});
 }
 const match=path.match(/^\/api\/admin\/content\/([a-z_]+)(?:\/(\d+))?$/);
 if(!match||!validEntity(match[1]))return json({error:'Not found'},404);
 const entity=match[1],table='jzw_'+entity,id=Number(match[2]),locale=url.searchParams.get('locale')==='en'?'en':'zh-CN';
 if(method==='GET'){
  if(id){const record=(await s.db.all(`SELECT * FROM ${identifier(table)} WHERE id=?`,[id]))[0];if(!record)return json({error:'内容不存在'},404);for(const k of ['content','wap_content'])if(record[k])record[k]=cleanHTML(String(record[k]));const translation=(await s.db.all('SELECT * FROM cms_translations WHERE entity=? AND entity_id=? AND locale=?',[entity,id,'en']))[0];return json({record,translation:translation?{...translation,fields:JSON.parse(translation.fields)}:null,fields:fieldsFor(entity)});}
  const q='%'+(url.searchParams.get('q')||'')+'%',page=Math.max(0,Math.floor(Number(url.searchParams.get('page'))||0));
  const title=entity==='category'?'catname':entity==='block'?'name':'title';
  const where=fieldsFor(entity).includes(title)?`${identifier(title)} LIKE ?`:'1';const args=where==='1'?[]:[q];
  const rows=await s.db.all(`SELECT * FROM ${identifier(table)} WHERE ${where} ORDER BY id DESC LIMIT 30 OFFSET ${page*30}`,args);
  const ts=await s.db.all('SELECT entity_id,published FROM cms_translations WHERE entity=? AND locale=?',[entity,'en']);
  return json({rows:rows.map(r=>({id:r.id,title:r[title]||r.pos||r.id,url:r.url,status:r.status,catid:r.catid,english:ts.find(t=>Number(t.entity_id)===Number(r.id))?.published||0})),total:Number((await s.db.all(`SELECT COUNT(*) AS count FROM ${identifier(table)} WHERE ${where}`,args))[0].count)});
 }
 if(method==='PUT'||method==='POST'){
  const body=await request.json()as Row,fields=cleanFields(entity,body.fields||{}),now=Math.floor(Date.now()/1000);
  if(locale==='en'){
   const original=id?(await s.db.all(`SELECT * FROM ${identifier(table)} WHERE id=?`,[id]))[0]:null;
   if(!original)return json({error:'请先保存中文原稿'},400);
   // Structural IDs and paths are shared across locales.
   const localized=new Set(['title','catname','description','content','wap_content','keywords','thumb','pic','small','subtitle','neiron','name']);
   for(const k of Object.keys(fields))if(!localized.has(k))delete fields[k];
   if(body.published&&!String(fields.title||fields.catname||fields.content||'').trim())return json({error:'请先填写英文翻译'},400);
   if(body.published){const missing=['title','catname','description','content','wap_content','subtitle'].filter(k=>/[\u3400-\u9fff]/.test(String(original[k]||''))&&!String(fields[k]||'').trim());if(missing.length)return json({error:'请补齐以下英文内容后发布：'+missing.join('、')},400);}
   await s.db.upsert('cms_translations',['entity','entity_id','locale'],{entity,entity_id:id,locale:'en',fields:JSON.stringify(fields),published:body.published?1:0,updated_at:now});
   await s.db.run('INSERT INTO cms_revisions (id,entity,entity_id,locale,data,created_at) VALUES (?,?,?,?,?,?)',[crypto.randomUUID(),entity,id,locale,JSON.stringify(fields),now]);return json({ok:true,id});
  }
  let recordId=id||1000000+crypto.getRandomValues(new Uint32Array(1))[0];
  if(!id&&entity==='page'){
   const category=(await s.db.all("SELECT id FROM jzw_category WHERE id=? AND module='Page'",[Number(body.categoryId)||0]))[0];
   if(!category)return json({error:'请选择单页所属栏目'},400);recordId=Number(category.id);
   if((await s.db.all('SELECT id FROM jzw_page WHERE id=?',[recordId])).length)return json({error:'该栏目已有单页，请直接编辑'},409);
  }
  if(entity==='category'&&fields.parentid!==undefined){const rows=await s.db.all('SELECT id,parentid FROM jzw_category');let parent=Number(fields.parentid);const seen=new Set<number>();while(parent){if(parent===recordId||seen.has(parent))return json({error:'栏目不能放在自身或子栏目下面'},400);seen.add(parent);const row=rows.find(r=>Number(r.id)===parent);if(!row)return json({error:'父栏目不存在'},400);parent=Number(row.parentid);}}
  if(!id&&['article','case','biaoshi'].includes(entity)&&!(await s.db.all('SELECT id FROM jzw_category WHERE id=?',[Number(fields.catid)||0])).length)return json({error:'请选择有效的所属栏目'},400);
  if(!id&&entity==='category'){
   if(!['Article','Case','Biaoshi','Page'].includes(String(fields.module)))return json({error:'请选择栏目类型'},400);
   fields.arrchildid=String(recordId);fields.arrparentid=fields.parentid?'0,'+fields.parentid:'0';fields.child=0;fields.ismenu=1;
   fields.template_list=fields.module==='Page'?'tongdao':'list';fields.template_show='show';fields.pagesize=9;
  }
  if(!id){
   const allowed=fieldsFor(entity),full=Object.fromEntries(allowed.map(k=>[k,isNumeric(entity,k)?0:'']));
   for(const [k,v]of Object.entries({createtime:now,updatetime:now,status:1,lang:1}))if(allowed.includes(k))full[k]=v;
   Object.assign(full,fields,{id:recordId});
   if(allowed.includes('url')&&!full.url)full.url=`/${entity}/${recordId}.html`;
   await s.db.run(`INSERT INTO ${identifier(table)} (${Object.keys(full).map(identifier)}) VALUES (${Object.keys(full).map(()=>'?')})`,Object.values(full));
  }
  else{
   const old=(await s.db.all(`SELECT * FROM ${identifier(table)} WHERE id=?`,[id]))[0];if(!old)return json({error:'内容不存在'},404);
   await s.db.run('INSERT INTO cms_revisions (id,entity,entity_id,locale,data,created_at) VALUES (?,?,?,?,?,?)',[crypto.randomUUID(),entity,id,locale,JSON.stringify(old),now]);
   if('updatetime' in old)fields.updatetime=now;
   if(Object.keys(fields).length)await s.db.run(`UPDATE ${identifier(table)} SET ${Object.keys(fields).map(k=>identifier(k)+'=?').join(',')} WHERE id=?`,[...Object.values(fields),id]);
  }
  if(entity==='category')await rebuildCategories(s.db);
  return json({ok:true,id:recordId});
 }
 return json({error:'Method not allowed'},405);
}
