import { templates } from './generated/templates';
import routes from './generated/routes.json';
import { ContentRepository, escapeHTML } from './model';
import type { Row, Services } from './ports';
import { cleanHTML,cleanInlineHTML } from './api';
import {localizeMarketingGraphics} from './english-media';
import mediaDimensions from './generated/media-dimensions.json';
import {attachContactMap} from './contact-map';

export function legacyCut(value:unknown,length:number){const s=String(value||'');if(new TextEncoder().encode(s).length<=length)return s;let out='',width=0;for(const ch of s){const w=ch.codePointAt(0)!>127?2:1;if(width+w>length)break;out+=ch;width+=w;}return out.length<s.length?out+'...':out;}
export function dateFormat(format:string,timestamp:unknown){const d=new Date(Number(timestamp)*1000+8*3600000);if(!Number.isFinite(d.getTime()))return '';const p=(n:number)=>String(n).padStart(2,'0');return format.replace(/[YmdHis]/g,k=>({Y:String(d.getUTCFullYear()),m:p(d.getUTCMonth()+1),d:p(d.getUTCDate()),H:p(d.getUTCHours()),i:p(d.getUTCMinutes()),s:p(d.getUTCSeconds())}[k]!));}
export function pagination(count:number,size:number,current:number,url:URL){
 const total=Math.ceil(count/size);if(total<=1)return '';
 return Array.from({length:Math.min(total,30)},(_,i)=>{const link=new URL(url);link.searchParams.set('page',String(i+1));return `<li><a ${i+1===current?'aria-current="page" class="current"':''} href="${escapeHTML(link.pathname+link.search)}">${i+1}</a></li>`;}).join('');
}
// A deferred client script runs after the browser's preload scanner. Mark images
// in the HTML itself so full-size offscreen photos do not compete with the first view.
export function prepareImageLoading(html:string,eagerImages=3){
 let image=0;
 return html.replace(/<!--[\s\S]*?-->|<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<img\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi,tag=>{
  if(!/^<img\b/i.test(tag))return tag;
  const loading=++image<=eagerImages?'eager':'lazy';let attributes='';
  const src=tag.match(/\ssrc\s*=\s*(["'])(.*?)\1/i)?.[2];
  let path=src?.split(/[?#]/)[0]||'';try{path=decodeURIComponent(path);}catch{}
  const dimensions=Object.hasOwn(mediaDimensions,path)?(mediaDimensions as Record<string,number[]>)[path]:undefined;
  // Natural dimensions reserve the correct aspect ratio before a lazy photo loads.
  // Preserve explicit author dimensions and let existing CSS continue to control size.
  const width=tag.match(/\swidth\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/i),height=tag.match(/\sheight\s*=\s*(?:["']([^"']*)["']|([^\s>]+))/i);
  if(dimensions){
   const [w,h]=dimensions,existingWidth=width?Number(width[1]??width[2]):0,existingHeight=height?Number(height[1]??height[2]):0;
   if(!width&&!height)attributes+=` width="${w}" height="${h}"`;
   else if(!height&&Number.isFinite(existingWidth)&&existingWidth>0)attributes+=` height="${Math.max(1,Math.round(existingWidth*h/w))}"`;
   else if(!width&&Number.isFinite(existingHeight)&&existingHeight>0)attributes+=` width="${Math.max(1,Math.round(existingHeight*w/h))}"`;
  }
  if(attributes)attributes+=' data-intrinsic-size=""';
  if(!/\sloading\s*=/i.test(tag))attributes+=' loading="'+loading+'"';
  return tag.replace(/\/?>$/,ending=>attributes+ending);
 });
}
export async function renderSite(request:Request,services:Services){
 const url=new URL(request.url),locale=url.pathname.startsWith('/en/')||url.pathname==='/en'?'en':'zh-CN';
 let pathname=url.pathname.replace(/^\/en(?=\/|$)/,'')||'/';
 const mobile=pathname.startsWith('/wap/')||url.searchParams.get('phone')==='1'||(/Mobile|Android|iPhone|iPad/i.test(request.headers.get('user-agent')||'')&&url.searchParams.get('view')!=='desktop');
 pathname=pathname.replace(/^\/wap(?=\/|$)/,'')||'/';
 const page=Math.min(10000,Math.max(1,Number(url.searchParams.get('page')||url.searchParams.get('p'))||1));
 const cfg=Object.fromEntries((await services.db.all("SELECT varname,value FROM jzw_config WHERE lang=1 UNION ALL SELECT name AS varname,value FROM cms_settings WHERE name IN ('site.revision','ui.en')")).map(r=>[r.varname,r.value]));
 const repo=new ContentRepository(services.db,locale,cfg['site.revision']?services.config.siteUrl+'|'+cfg['site.revision']:'');
 const cats=await repo.query('SELECT * FROM jzw_category');
 const Categorys=Object.fromEntries(cats.map(r=>[r.id,{...r,catid:r.id}]));
 let route=(routes as Record<string,{entity:string,id:number}>)[pathname];
 if(!route&&pathname!=='/'&&pathname!=='/index.php'){
  for(const entity of ['category','article','case','biaoshi']){
   const found=(await services.db.all(`SELECT id FROM jzw_${entity} WHERE url=? OR url=?`,[pathname,'http://www.hnaan.cn'+pathname]))[0];
   if(found){route={entity:'jzw_'+entity,id:Number(found.id)};break;}
  }
 }
 if(pathname!=='/'&&pathname!=='/index.php'&&!route)return new Response(locale==='en'?'Page not found':'页面不存在',{status:404});
 const c:Row={...cfg,Categorys,_GET:Object.fromEntries(url.searchParams),_COOKIE:{},list:[],lister:[],listerb:[],listerc:[],isxcx:'',catid:0,module_name:'Article',pages:'',site_title:cfg.site_title||cfg.site_name,seo_title:cfg.site_title||cfg.site_name};
 let template='Index_index',entity='',record:Row|undefined,cat:Row|undefined,pageRecord:Row|undefined;
 if(route){
  entity=route.entity.replace('jzw_','');record=await repo.record(entity,route.id);
  if(!record||(entity!=='category'&&record.status!==undefined&&Number(record.status)!==1))return new Response('Not found',{status:404});
  const savedURL=String(record.url||'').replace(/^https?:\/\/(?:www\.)?hnaan\.cn/i,'');
  if(savedURL.startsWith('/')&&!savedURL.startsWith('//')&&savedURL!==pathname)return Response.redirect(url.origin+(locale==='en'?'/en':'')+(url.pathname.includes('/wap/')?'/wap':'')+savedURL+url.search,301);
  cat=entity==='category'?record:Categorys[record.catid];
  if(!cat)return new Response('Category not found',{status:404});
  Object.assign(c,cat,{catid:cat.id,catname:cat.catname,seo_title:cat.title||cat.catname,seo_description:cat.description||cfg.seo_description,seo_keywords:cat.keywords||cfg.seo_keywords});
  if(['Liuyan','Product'].includes(String(cat.module))){const target=cat.module==='Product'?'/about/jieshao/':'/contact/';return Response.redirect(url.origin+(locale==='en'?'/en':'')+target,301);}
  if(['casebiao',''].includes(String(cat.template_list))&&String(cat.module)==='Page'){return Response.redirect(url.origin+(locale==='en'?'/en':'')+(cat.template_list==='casebiao'?'/casesearch/':'/sitemap/'),301);}
  const mod=String(cat.module||'Page');c.module_name=mod;
  if(entity==='category'){
   if(mod==='Page'){pageRecord=await repo.record('page',Number(cat.id));Object.assign(c,pageRecord||{});template='Page_'+(cat.template_list||'about');}
   else{
    const tab='jzw_'+mod.toLowerCase();
    const ids=String(cat.arrchildid||cat.id).split(',').map(Number).filter(n=>Number.isInteger(n)&&n>0);
    const where=`status=1 AND catid IN (${ids.map(()=>'?').join(',')})`;
    const size=Number(cat.pagesize)||9;
    const count=Number((await services.db.all(`SELECT COUNT(*) AS count FROM ${tab} WHERE ${where}`,ids))[0].count);
    c.list=await repo.query(`SELECT * FROM ${tab} WHERE ${where} ORDER BY listorder DESC,createtime DESC LIMIT ${size} OFFSET ${(page-1)*size}`,ids);
    c.pages=pagination(count,size,page,url);template=mod+'_'+(cat.template_list||'list');
   }
  }else{Object.assign(c,record);c.seo_title=record.title;c.module_name=entity[0].toUpperCase()+entity.slice(1);template=c.module_name+'_'+((record.template&&record.template!=='0'?record.template:'')||cat.template_show||'show');}
 }
 c.catid=Number(cat?.id||0);c.arrchildid=cat?.arrchildid||'';
 // Keep contact guidance visible until a configured SDK finishes loading.
 c.map_unavailable=locale==='en'?'Map unavailable. Please use the contact details on this page.':'地图暂时无法加载，请查看页面上的联系方式。';
 const view=mobile?'Wap':'Home';
 const fns=templates as Record<string,(c:Row,m:any,h:any)=>Promise<string>>;
 const get=(v:any,k:any)=>v?.[k]??'';
 const truth=(v:any)=>Array.isArray(v)?v.length>0:!!v&&v!=='0';
 const value=(ctx:Row,e:string,attribute=false)=>{
  const [path,filter]=e.split('|');let normalized=path.replace(/\[\$(\w+)\]/g,(_,v)=>'.'+ctx[v]).replace(/\[['"]?([^\]'"\[]+)['"]?\]/g,'.$1');
  let val:any=ctx;for(const part of normalized.split('.'))val=get(val,part);
  if(filter?.startsWith('toDate'))return dateFormat(filter.match(/'([^']+)'/)?.[1]||'Y-m-d',val);
  if(!attribute&&filter==='inline')return cleanInlineHTML(String(val||''));
  // Bodies are authored HTML; ordinary scalar fields are escaped at interpolation boundaries.
  if(!attribute&&(['content','wap_content','description'].includes(path)||/\.(content|description)$/.test(path)))return cleanHTML(String(val||''));
  if(['pages','show','pre','next'].includes(path))return val;
  return escapeHTML(val);
 };
 const h:any={output:(v:unknown,key:string)=>['content','wap_content'].includes(key)?cleanHTML(String(v||'')):['pre','next','show','pages'].includes(key)?String(v||''):escapeHTML(v),get,truth,str:(v:any)=>v==null?'':String(v),value,sql:(sql:string,ctx:Row)=>sql.replace(/\{\$([^}]+)\}/g,(_,e)=>String(value(ctx,e))).replace(/\$(catid|arrchildid)/g,(_,k)=>String(ctx[k])),page:(count:number,size:number)=>({firstRow:(page-1)*size,listRows:size,myshow:()=>pagination(count,size,page,url)}),fn:{explode:(sep:string,s:any)=>String(s||'').split(sep),count:(v:any)=>Array.isArray(v)?v.length:Object.keys(v||{}).length,str_cut:legacyCut,date:dateFormat,time:()=>Math.floor(Date.now()/1000),import:()=>'',file_put_contents:()=>'',in_array:(v:any,a:any[])=>a?.some(x=>String(x)===String(v)),setCookie:()=>''}};
 h.include=async(name:string,ctx:Row)=>{const fn=fns[view+'/'+name]||fns['Home/'+name];return fn?fn(ctx,(n:string)=>repo.model(n),h):'';};
 const fn=fns[view+'/'+template]||fns['Home/'+template];
 if(!fn)return new Response('Template not found: '+template,{status:404});
 let html=await fn(c,(name:string)=>repo.model(name),h);
 // These legacy integrations do not control layout. Replace the domain-dependent mobile redirect.
 html=html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi,s=>s.includes('(Switch)')?'':s);
 html=html.replace(/https?:\/\/(?:www\.)?hnaan\.cn(?=[/"'\s<])/gi,'');
 html=html.replace(/https?:\/\/(?:www\.)?hnionic\.cn(?=\/Uploads\/)/gi,'');
 html=html.replace(/http:\/\/(api\.map\.baidu\.com|player\.youku\.com|bdimg\.share\.baidu\.com)/g,'https://$1');
 if(locale==='en')html=await englishHTML(localizeMarketingGraphics(html),services,String(cfg['ui.en']||''));
 html=prepareImageLoading(html,mobile?4:3);
 html=html.replace(/<html(?:\s+lang="[^"]*")?/i,'<html lang="'+locale+'"');
 const base=services.config.siteUrl.replace(/\/$/,''),canonical=base+(locale==='en'?'/en':'')+pathname;
 const translationRecord=entity==='category'&&cat?.module==='Page'?(pageRecord||record):record;
 const fallback=locale==='en'&&record&&!translationRecord?._translated;
 const legacyCarousel=template==='Page_about'?'<script src="/legacy-carousel.js"></script>':'';
 const seo=legacyCarousel+`<link rel="canonical" href="${escapeHTML(canonical)}"><link rel="alternate" hreflang="zh-CN" href="${escapeHTML(base+pathname)}"><link rel="alternate" hreflang="en" href="${escapeHTML(base+'/en'+pathname)}">${fallback?'<meta name="robots" content="noindex,follow">':''}<link rel="stylesheet" href="/site-migration.css"><script defer src="/site-migration.js"></script>`;
 html=html.replace('</head>',seo+'</head>');
 const other=(locale==='en'?pathname:'/en'+pathname)+url.search;
 html=html.replace('</body>',`<a class="site-language" href="${escapeHTML(other)}" lang="${locale==='en'?'zh-CN':'en'}">${locale==='en'?'简体中文':'English'}</a>${fallback?'<div class="translation-notice">English translation is being prepared. This page currently shows the Chinese original.</div>':''}</body>`);
 if(['Page_contact','Page_ziyuan'].includes(template)){
  const mapConfig=locale==='en'?{...cfg,site_name:englishPlainText(String(cfg.site_name||''),String(cfg['ui.en']||'')),address:englishPlainText(String(cfg.address||''),String(cfg['ui.en']||''))}:cfg;
  const hosts=services.config.baiduMapHosts?.split(',').map(host=>host.trim().toLowerCase()).filter(Boolean);
  html=attachContactMap(html,services.config.baiduMapAk,mapConfig,locale,hosts?.length?hosts:[new URL(services.config.siteUrl).hostname]);
 }
 return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','content-language':locale,'cache-control':'no-store','vary':'User-Agent','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin'}});
}
import uiDictionary from './generated/ui-en.json';
function compileEnglishUI(value:string){
 const dict=Object.fromEntries(Object.entries({...uiDictionary,...(value?JSON.parse(value):{})}).map(([key,value])=>[key.replace(/\s+/g,' '),String(value)])) as Record<string,string>;
 const keys=Object.keys(dict).filter(k=>/[\u3400-\u9fff]/.test(k)).sort((a,b)=>b.length-a.length);
 const source=keys.map(k=>k.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ +/g,'\\s+')).join('|');
 const pattern=keys.length?new RegExp(source,'g'):undefined;
 // The client handles legacy form alerts and labels inserted by pagination callbacks.
 const dictionary=JSON.stringify(dict).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 const script=`<script>window.siteTranslations=${dictionary};window.siteTranslate=function(v){const d=window.siteTranslations,p=new RegExp(${JSON.stringify(source).replace(/</g,'\\u003c').replace(/>/g,'\\u003e')},'g');for(let i=0;i<2;i++)v=String(v).replace(p,k=>d[k.replace(/\\s+/g,' ')]??k);return v};{const a=window.alert;window.alert=function(v){a.call(window,window.siteTranslate(v))}}</script>`;
 return {value,dict,pattern,script};
}
let compiledUI:ReturnType<typeof compileEnglishUI>|undefined;
function englishPlainText(text:string,value:string){
 if(!compiledUI||compiledUI.value!==value)compiledUI=compileEnglishUI(value);
 const {dict,pattern}=compiledUI;
 if(pattern)for(let i=0;i<2;i++)text=text.replace(pattern,key=>dict[key.replace(/\s+/g,' ')]??key);
 return text;
}
export async function englishHTML(html:string,services:Services,prefetchedValue?:string){
 const custom=prefetchedValue===undefined?(await services.db.all('SELECT value FROM cms_settings WHERE name=?',['ui.en']))[0]:undefined;
 const value=prefetchedValue??String(custom?.value||'');
 if(!compiledUI||compiledUI.value!==value)compiledUI=compileEnglishUI(value);
 const {dict,pattern,script}=compiledUI;
 if(!pattern)return html;
 const translate=(text:string)=>{if(!/[\u3400-\u9fff]/.test(text))return text;for(let i=0;i<2;i++)text=text.replace(pattern,key=>escapeHTML(dict[key.replace(/\s+/g,' ')]??key));return text;};
 // Text and descriptive attributes only; URLs, classes, CSS and scripts remain untouched.
 html=html.split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<[^>]+>)/gi).map(part=>{
  if(!/[\u3400-\u9fff]/.test(part))return part;
  if(/^<(script|style)\b/i.test(part))return part;
  if(part.startsWith('<')){
   part=part.replace(/\b(title|alt|placeholder|aria-label)=(['"])([\s\S]*?)\2/gi,(_,a,q,v)=>`${a}=${q}${translate(v)}${q}`);
   if(/^<input\b/i.test(part)&&/\btype=['"](?:submit|button)['"]/i.test(part))part=part.replace(/\bvalue=(['"])([\s\S]*?)\1/i,(_,q,v)=>`value=${q}${translate(v)}${q}`);
   if(/^<meta\b/i.test(part)&&/\bname=['"](?:description|keywords)['"]/i.test(part))part=part.replace(/\bcontent=(['"])([\s\S]*?)\1/i,(_,q,v)=>`content=${q}${translate(v)}${q}`);
   return part;
  }
  return translate(part);
 }).join('');
 return html.replace(/<head([^>]*)>/i,(_,attributes)=>`<head${attributes}>${script}`);
}
