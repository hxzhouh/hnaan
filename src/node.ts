import { serve } from '@hono/node-server';
import path from 'node:path';
import { fetchApplication } from './app';
import { MySQLDatabaseAdapter } from './adapters/mysql';
import { FileStorage } from './adapters/filesystem';
try{process.loadEnvFile('.env');}catch{}
if(!process.env.DATABASE_URL)throw Error('DATABASE_URL is required for the Node/MySQL target');
const assets=new FileStorage(path.resolve(process.env.ASSETS_DIR||'public'));
const services={db:new MySQLDatabaseAdapter(process.env.DATABASE_URL),assets,media:new FileStorage(path.resolve(process.env.MEDIA_DIR||'public')),config:{siteUrl:process.env.SITE_URL||'http://localhost:8788',adminPasswordHash:process.env.ADMIN_PASSWORD_HASH||'',sessionSecret:process.env.SESSION_SECRET||'',adminUser:process.env.ADMIN_USER||'admin',baiduMapAk:process.env.BAIDU_MAP_AK}};
serve({fetch:(request,bindings)=>{const headers=new Headers(request.headers);headers.delete('cf-connecting-ip');headers.set('x-real-ip',bindings.incoming.socket.remoteAddress||'local');const original=new URL(request.url);const normalized=new Request(new URL(original.pathname+original.search,services.config.siteUrl),{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,duplex:'half'} as any);return fetchApplication(normalized,services);},port:Number(process.env.PORT)||8788},info=>console.log(`Local: http://localhost:${info.port}`));
