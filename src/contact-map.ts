import {escapeHTML} from './model';
import type {Row} from './ports';

// Browser AKs are sent to the visitor's SDK, but deployment credentials stay out
// of templates and can be supplied identically by either runtime adapter.
export function attachContactMap(html:string,ak:string|undefined,cfg:Row,locale:string,hosts:string[]=[]){
 const key=ak?.trim(),coordinates=String(cfg.baiduxy||'').split(',').map(Number);
 if(!key||!/^[a-zA-Z0-9]{16,128}$/.test(key)||coordinates.length!==2||!String(cfg.baiduxy).split(',').every(part=>part.trim()!=='')||!coordinates.every(Number.isFinite)||Math.abs(coordinates[0])>180||Math.abs(coordinates[1])>90||!html.includes('id="dituContent"'))return html;
 const data={ak:key,longitude:coordinates[0],latitude:coordinates[1],name:String(cfg.site_name||''),address:String(cfg.address||''),phone:String(cfg.tel||cfg.phone_a||cfg.phone_b||''),locale,hosts};
 const json=JSON.stringify(data).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 return html.replace('</body>',`<script type="application/json" id="site-map-config">${json}</script><script defer src="/contact-map.js" aria-label="${escapeHTML(locale==='en'?'Company map':'公司地图')}"></script></body>`);
}
