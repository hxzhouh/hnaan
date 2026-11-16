import type { Services } from './ports';
import { handleAPI,json } from './api';
import { renderSite } from './render';
export async function fetchApplication(request:Request,services:Services):Promise<Response>{
 const url=new URL(request.url);
 try{
  if(url.pathname==='/index.php'&&url.searchParams.get('a')==='getData'){const api=new URL('/api/content',url);api.search=url.search;return handleAPI(new Request(api,request),services);}
  if(url.pathname.startsWith('/api/'))return await handleAPI(request,services);
  if(url.pathname==='/healthz')return json({ok:true});
  if(url.pathname==='/cms'||url.pathname==='/cms/')return services.assets.fetch(request);
  if(url.pathname.startsWith('/cms/')){const r=await services.assets.fetch(request);const headers=new Headers(r.headers);headers.set('cache-control','no-store');return new Response(r.body,{status:r.status,headers});}
  if(url.pathname.startsWith('/Uploads/')){const asset=await services.assets.fetch(request);return asset.status===404?services.media.get(url.pathname,request):asset;}
  if(/\.(?:css|js|png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|eot|mp4|pdf|swf)$/i.test(url.pathname))return services.assets.fetch(request);
  if(url.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /\nDisallow: /cms\nDisallow: /api/\nSitemap: '+services.config.siteUrl+'/sitemap.xml\n');
  if(url.pathname==='/sitemap.xml'){
   const rows=await services.db.all('SELECT url FROM jzw_category UNION SELECT url FROM jzw_article WHERE status=1 UNION SELECT url FROM jzw_case WHERE status=1 UNION SELECT url FROM jzw_biaoshi WHERE status=1');
   const base=services.config.siteUrl.replace(/\/$/,''),paths=new Set(['/',...rows.map(r=>String(r.url||'').replace(/^https?:\/\/(www\.)?hnaan\.cn/,''))].filter(x=>x.startsWith('/')));
   return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+[...paths].map(p=>'<url><loc>'+base+p.replace(/&/g,'&amp;')+'</loc></url>').join('')+'</urlset>',{headers:{'content-type':'application/xml; charset=utf-8'}});
  }
  if(url.pathname.startsWith('/zh-CN/'))return Response.redirect(url.origin+url.pathname.replace(/^\/zh-CN/,'')+url.search,301);
  return await renderSite(request,services);
 }catch(error){console.error('Application error',url.pathname,error instanceof Error?error.message:String(error));return url.pathname.startsWith('/api/')?json({error:error instanceof SyntaxError?'请求数据格式不正确':'请求处理失败，请检查输入或稍后重试'},error instanceof SyntaxError?400:500):new Response('页面暂时无法加载，请稍后重试。',{status:500});}
}
