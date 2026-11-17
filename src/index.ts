import { fetchApplication } from './app';
import { D1DatabaseAdapter } from './adapters/d1';
import { R2Storage } from './adapters/r2';
import { EdgeCachedStorage,MediaEdgeCache } from './adapters/edge-cache';
interface Env { DB:D1Database;MEDIA:R2Bucket;ASSETS:Fetcher;VERSION?:{id:string};SITE_URL?:string;ADMIN_PASSWORD_HASH?:string;SESSION_SECRET?:string;ADMIN_USER?:string;BAIDU_MAP_AK?:string;BAIDU_MAP_HOSTS?:string; }
export default {fetch(request:Request,env:Env,ctx:ExecutionContext){
 const siteUrl=env.SITE_URL||new URL(request.url).origin,edge=new MediaEdgeCache(caches.default,task=>ctx.waitUntil(task),siteUrl);
 const staticEdge=new MediaEdgeCache(caches.default,task=>ctx.waitUntil(task),siteUrl,env.VERSION?.id||'local');
 const assets={fetch:(assetRequest:Request)=>{const path=new URL(assetRequest.url).pathname;return /\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|eot|mp4|pdf|docx?)$/i.test(path)?staticEdge.get(path+new URL(assetRequest.url).search,assetRequest,()=>env.ASSETS.fetch(assetRequest)):env.ASSETS.fetch(assetRequest);}};
 return fetchApplication(request,{db:new D1DatabaseAdapter(env.DB),media:new EdgeCachedStorage(new R2Storage(env.MEDIA),edge),assets,config:{siteUrl,adminPasswordHash:env.ADMIN_PASSWORD_HASH||'',sessionSecret:env.SESSION_SECRET||'',adminUser:env.ADMIN_USER||'admin',baiduMapAk:env.BAIDU_MAP_AK,baiduMapHosts:env.BAIDU_MAP_HOSTS}});
}};
