import {escapeHTML} from './model';
// Only known legacy marketing artwork is covered. A new CMS image has no overlay.
const banners:Record<string,{box:number[];color:string;title:string;detail:string}>={
 '5be5305bed5e0.jpg':{box:[49,6,47,29],color:'#204569',title:'15+ Years of Manufacturing',detail:'Over 300 service professionals'},
 '5c1323c10dd76.jpg':{box:[50,6,46,22],color:'#204569',title:'15+ Years of Manufacturing',detail:'Over 300 service professionals'},
 '5bda4a5e1bd17.jpg':{box:[34,28,32,44],color:'#ffffff',title:'3,000+ Successful Projects',detail:'Trusted by leading enterprises'},
 '5c10621feee5f.jpg':{box:[34,28,32,44],color:'#ffffff',title:'3,000+ Successful Projects',detail:'Trusted by leading enterprises'},
 '5bf20784987d9.jpg':{box:[8,26,33,22],color:'#b51c18',title:'15+ Years in Signage',detail:'Planning · Design · Manufacturing'},
 '5c1062123a23c.jpg':{box:[5.3,27,32.5,18],color:'#b51c18',title:'15+ Years in Signage',detail:'Planning · Design · Manufacturing'},
 '5be4f2fd2028a.jpg':{box:[5,10,42,42],color:'#244d67',title:'Partnerships Built on Trust',detail:'Working together for shared success'},
 '5c10617099f40.jpg':{box:[5,7,39,31],color:'#244d67',title:'Partnerships Built on Trust',detail:'Working together for shared success'},
 '5be52b49e3a70.jpg':{box:[21,12,35,35],color:'#effcfe',title:'3,000+ Signage Projects',detail:'Efficient · Precise · Professional · Safe'},
 '5c1061de67788.jpg':{box:[12,21,44,23],color:'#effcfe',title:'3,000+ Signage Projects',detail:'Efficient · Precise · Professional · Safe'},
 '5be923f588837.jpg':{box:[48,7,46,44],color:'#064454',title:'News & Insights',detail:'Updates from Aiaoni and the signage industry'},
 '5c106183d81a7.jpg':{box:[49,59,48,27],color:'#064454',title:'News & Insights',detail:'Aiaoni and industry updates'}
};
const flow=()=>'<ol class="english-partner-flow">'+['Phone Consultation','Partner Review','Meet and Discuss','Sign the Agreement','Build the Business Together'].map((s,i)=>`<li><b>${i+1}</b><span>${s}</span></li>`).join('')+'</ol>';
export function localizeMarketingGraphics(html:string){
 html=html.replace(/<img\b[^>]*>/gi,img=>{
  const path=img.match(/\bsrc=["']([^"']+)["']/i)?.[1]||'',name=path.split('/').pop()||'',banner=banners[name];
  if(path==='/Jzw/Tpl/Wap/Default/images/zh2.png')return '<section class="english-supplier-questions"><h3>Facing these challenges?</h3><div>'+['Unreliable quality','Designs that miss the mark','Uncertain profit margins','Lack of after-sales support'].map(s=>`<p>${s}</p>`).join('')+'</div></section>';
  if(path==='/Jzw/Tpl/Wap/Default/images/zh_24.png')return flow();
  if(!banner)return img;
  const [left,top,width,height]=banner.box,dark=['#ffffff','#effcfe'].includes(banner.color)?'#222':'#fff';
  return `<span class="english-banner">${img}<span class="english-banner-copy" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;background:${banner.color};color:${dark}"><strong>${escapeHTML(banner.title)}</strong><small>${escapeHTML(banner.detail)}</small></span></span>`;
 });
 return html.replace(/(<div class="zt-liu">)/,'$1'+flow());
}
