import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {attachContactMap} from '../src/contact-map';

test('legacy resource maps use their coordinates and show contact guidance without the SDK',()=>{
 const positions:unknown[]=[];
 class MapStub {
  centerAndZoom(point:unknown,zoom:number){positions.push({point,zoom});}
  addOverlay(){} openInfoWindow(){} addControl(){} enableScrollWheelZoom(){}
  getCenter(){return {x:113,y:28};}
 }
 const BMap={Map:MapStub,Point:class{constructor(public x:number,public y:number){}},Marker:class{},InfoWindow:class{},NavigationControl:class{}};
 const container={textContent:'',setAttribute(_name:string,_value:string){}};
 const document={documentElement:{lang:'zh-CN'},getElementById:()=>container};
 const context=vm.createContext({BMap,window:{BMap},document,$:()=>({})});
 vm.runInContext(fs.readFileSync('public/Jzw/Tpl/Home/Default/Public/public.js','utf8'),context);
 context.loadContactMap('map','Company','Address','Phone',113,28);
 assert.equal(positions.length,1);assert.equal((positions[0]as any).point.x,113);assert.equal((positions[0]as any).point.y,28);assert.equal((positions[0]as any).zoom,15);
 context.window.BMap=undefined;context.loadContactMap('map','Company','Address','Phone',113,28);
 assert.match(container.textContent,/地图暂时无法加载/);
 document.documentElement.lang='en';context.loadContactMap('map',[],{});
 assert.match(container.textContent,/Map unavailable/);
});

test('map metadata cannot escape its JSON script and invalid coordinates keep the fallback',()=>{
 const html='<div id="dituContent" role="status">Contact</div></body>',ak='validBrowserAkForTests1234567890';
 const config={baiduxy:'112.884368,28.216214',site_name:'</script><script>alert(1)</script>',address:'A & B'};
 const result=attachContactMap(html,ak,config,'en');
 const json=result.match(/id="site-map-config">([^<]*)<\/script>/)?.[1];assert.ok(json);assert.equal(JSON.parse(json).name,config.site_name);assert.equal(JSON.parse(json).address,config.address);
 for(const coordinates of ['',',','112,','NaN,28','181,28','112,91'])assert.equal(attachContactMap(html,ak,{...config,baiduxy:coordinates},'en'),html);
 assert.equal(attachContactMap(html,'<script>',config,'en'),html);
});

function mapHarness(fail=false){
 const nodes:any[]=[];let timeout:()=>void=()=>{};let timerCleared=false;let instance:any;
 const element=()=>({textContent:'',attrs:{}as Record<string,string>,children:[]as any[],setAttribute(k:string,v:string){this.attrs[k]=v;},appendChild(child:any){this.children.push(child);},remove(){}});
 const target=element();const config={textContent:JSON.stringify({ak:'testAk',longitude:112.884368,latitude:28.216214,name:'Company <HQ>',address:'Address',phone:'123',locale:'en'})};
 class MapStub{
  point:any;zoom=0;overlays:any[]=[];info:any;events:any={};
  constructor(){if(fail)throw Error('Map initialization failed');instance=this;}
  centerAndZoom(point:any,zoom:number){this.point=point;this.zoom=zoom;}
  addOverlay(marker:any){this.overlays.push(marker);}addControl(){}enableScrollWheelZoom(){}
  addEventListener(name:string,fn:()=>void){this.events[name]=fn;}
  openInfoWindow(info:any){this.info=info;}
 }
 const document={getElementById:(id:string)=>id==='dituContent'?target:config,head:{appendChild:(node:any)=>nodes.push(node)},createElement:()=>element()};
 const window:any={BMap:{Map:MapStub,Point:class{constructor(public lng:number,public lat:number){}},Marker:class{addEventListener(){}},NavigationControl:class{},ScaleControl:class{},InfoWindow:class{constructor(public content:any){}}}};
 vm.runInNewContext(fs.readFileSync('public/contact-map.js','utf8'),{window,document,encodeURIComponent,setTimeout:(fn:()=>void)=>{timeout=fn;return 1;},clearTimeout:()=>{timerCleared=true;}});
 return {target,window,nodes,expire:()=>timeout(),get instance(){return instance;},get timerCleared(){return timerCleared;}};
}
test('asynchronous SDK success restores the marker and safe company details',()=>{
 const h=mapHarness();assert.equal(h.target.attrs['data-map-state'],'loading');assert.match(h.nodes[0].src,/^https:\/\/api.map.baidu.com\/api\?v=3.0/);
 h.window.hnaanMapReady();assert.equal(h.target.attrs.role,'region');assert.equal(h.target.attrs['data-map-state'],'loading');assert.ok(!h.timerCleared);h.instance.events.tilesloaded();assert.equal(h.target.attrs['data-map-state'],'ready');assert.equal(h.instance.point.lng,112.884368);assert.equal(h.instance.point.lat,28.216214);assert.equal(h.instance.overlays.length,1);
 assert.equal(h.instance.info.content.children[0].textContent,'Company <HQ>');assert.equal(h.instance.info.content.children[1].textContent,'Address: Address');assert.ok(h.timerCleared);
 h.expire();assert.equal(h.target.attrs['data-map-state'],'ready');
});
test('SDK network failures, timeouts and initialization errors retain nonblocking contact guidance',()=>{
 for(const failure of ['network','timeout','init','tiles']){
  const h=mapHarness(failure==='init');if(failure==='network')h.nodes[0].onerror();else if(failure==='timeout')h.expire();else if(failure==='tiles'){h.window.hnaanMapReady();h.expire();h.instance.events.tilesloaded();}else h.window.hnaanMapReady();
  assert.equal(h.target.attrs.role,'status');assert.equal(h.target.attrs['data-map-state'],'unavailable');assert.match(h.target.textContent,/Map unavailable/);assert.ok(h.timerCleared);
  h.window.hnaanMapReady();assert.equal(h.target.attrs['data-map-state'],'unavailable');
 }
});
