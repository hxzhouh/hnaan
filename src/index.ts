import { fetchApplication } from './app';
import { D1DatabaseAdapter } from './adapters/d1';
import { R2Storage } from './adapters/r2';
interface Env { DB:D1Database;MEDIA:R2Bucket;ASSETS:Fetcher;SITE_URL?:string;ADMIN_PASSWORD_HASH?:string;SESSION_SECRET?:string;ADMIN_USER?:string; }
export default {fetch(request:Request,env:Env){return fetchApplication(request,{db:new D1DatabaseAdapter(env.DB),media:new R2Storage(env.MEDIA),assets:env.ASSETS,config:{siteUrl:env.SITE_URL||new URL(request.url).origin,adminPasswordHash:env.ADMIN_PASSWORD_HASH||'',sessionSecret:env.SESSION_SECRET||'',adminUser:env.ADMIN_USER||'admin'}});}};
