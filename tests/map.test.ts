import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
