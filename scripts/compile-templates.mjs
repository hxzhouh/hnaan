import fs from 'node:fs';
import path from 'node:path';
import PHPParser from 'php-parser';
const root=path.resolve(import.meta.dirname,'..');
const source=process.argv[2]||'/Users/hxzhouh/Downloads/201810aiaoni/Jzw/Tpl';
const parser=new PHPParser();
const j=JSON.stringify;
const variable=n=>`c[${j(n)}]`;
function expr(n){
 if(!n)return 'null';
 switch(n.kind){
 case 'variable':return variable(n.name);
 case 'string':return j(n.value);
 case 'number':return String(Number(n.value));
 case 'name':case 'identifier':return j(n.name);
 case 'offsetlookup':return `h.get(${expr(n.what)},${expr(n.offset)})`;
 case 'propertylookup':return `h.get(${expr(n.what)},${j(n.offset.name)})`;
 case 'assign':return `(${lvalue(n.left)}=${hasHTML(n.right)?emitExpr(n.right):expr(n.right)})`;
 case 'bin':{
  const a=expr(n.left),b=expr(n.right);
  if(n.type==='.')return `(h.str(${a})+h.str(${b}))`;
  const op={'and':'&&','or':'||','==':'==','!=':'!='}[n.type]||n.type;
  if(!['+','-','*','/','%','<','>','<=','>=','==','!=','===','!==','&&','||'].includes(op))throw Error('Unsupported operator '+op);
  return `(${a} ${op} ${b})`;
 }
 case 'unary':return `(${n.type}${expr(n.what)})`;
 case 'post':return `(${lvalue(n.what)}${n.type==='+'?'++':'--'})`;
 case 'encapsed':return '('+n.value.map(expr).join('+')+')';
 case 'encapsedpart':return `h.str(${expr(n.expression)})`;
 case 'retif':return `(h.truth(${expr(n.test)})?${expr(n.trueExpr)}:${expr(n.falseExpr)})`;
 case 'empty':return `(!h.truth(${expr(n.expression)}))`;
 case 'array':return '['+n.items.map(x=>expr(x.value)).join(',')+']';
 case 'new':return n.what.name==='Page'?`h.page(${(n.arguments||[]).map(expr).join(',')})`:'m()';
 case 'call':{
  const args=(n.arguments||[]).map(expr).join(',');
  if(n.what.kind==='propertylookup')return `(await ${expr(n.what.what)}.${n.what.offset.name}(${args}))`;
  const name=n.what.name;
  if(name==='M')return `m(${args})`;
  if(!['explode','count','str_cut','date','import','time','file_put_contents','in_array','setCookie'].includes(name))throw Error('Unsupported function '+name);
  return `h.fn[${j(name)}](${args})`;
 }
 default:throw Error('Unsupported expression '+n.kind);
 }
}
function lvalue(n){
 if(n.kind==='variable')return variable(n.name);
 if(n.kind==='offsetlookup')return `((${lvalue(n.what)})??={})[${expr(n.offset)}]`;
 throw Error('Unsupported assignment '+n.kind);
}
function hasHTML(n){if(!n||typeof n!=='object')return false;if(n.kind==='string'&&/<[a-z]/i.test(n.value))return true;return Object.values(n).some(v=>Array.isArray(v)?v.some(hasHTML):hasHTML(v));}
function emitExpr(n){
 if(n.kind==='string')return expr(n);
 if(n.kind==='bin'&&n.type==='.')return '('+emitExpr(n.left)+'+'+emitExpr(n.right)+')';
 const key=n.kind==='variable'?n.name:n.kind==='offsetlookup'&&n.offset.kind==='string'?n.offset.value:'';
 return `h.output(${expr(n)},${j(key)})`;
}
function stmt(n){
 switch(n.kind){
 case 'program':case 'block':return (n.children||[]).map(stmt).join('\n');
 case 'expressionstatement':return expr(n.expression)+';';
 case 'echo':return n.expressions.map(e=>`o.push(h.str(${emitExpr(e)}));`).join('\n');
 case 'for':return `for(${n.init.map(expr).join(',')};${n.test.map(expr).join(',')};${n.increment.map(expr).join(',')}){${stmt(n.body)}}`;
 case 'foreach':return `for(const [__key,__value] of Object.entries(${expr(n.source)}||{})){${n.key?lvalue(n.key)+'=__key;':''}${lvalue(n.value)}=__value;${stmt(n.body)}}`;
 case 'if':return `if(h.truth(${expr(n.test)})){${stmt(n.body)}}${n.alternate?'else{'+stmt(n.alternate)+'}':''}`;
 default:throw Error('Unsupported statement '+n.kind);
 }
}
function html(text){
 const chunks=[];let cursor=0;
 for(const m of text.matchAll(/\{\$([^}]+)\}/g)){
  if(m.index>cursor)chunks.push(j(text.slice(cursor,m.index)));
  const attr=text.lastIndexOf('<',m.index)>text.lastIndexOf('>',m.index);chunks.push(`h.str(h.value(c,${j(m[1])},${attr}))`);cursor=m.index+m[0].length;
 }
 if(cursor<text.length)chunks.push(j(text.slice(cursor)));
 return chunks.length?`o.push(${chunks.join(',')});`:'';
}
let seq=0;
function compile(text){
 text=text.replace(/<php>([\s\S]*?)<\/php>/gi,'<?php $1; ?>');
 const php=[];text=text.replace(/<\?php([\s\S]*?)\?>/g,(_,code)=>`@@PHP${php.push(code)-1}@@`);
 let code='',pos=0;
 const re=/@@PHP(\d+)@@|<include\s+file="([^"]+)"\s*\/>|<(JW:list|JW:link|volist|if)\b([^>]*?)>|<\/(JW:list|JW:link|volist|if)>/gi;
 for(const m of text.matchAll(re)){
  code+=html(text.slice(pos,m.index));pos=m.index+m[0].length;
  if(m[1]!==undefined){
   // The legacy sitemap writes a file as a side effect. The new sitemap is an HTTP route.
   code+=php[Number(m[1])].includes('file_put_contents')?'':stmt(parser.parseCode('<?php '+php[Number(m[1])]));
  }else if(m[2])code+=`o.push(await h.include(${j(path.basename(m[2]).replace(/\.html$/i,'').replace(':','_'))},c));`;
  else if(m[5])code+='}';
  else{
   const attrs=Object.fromEntries([...m[4].matchAll(/(\w+)="([^"]*)"/g)].map(x=>[x[1],x[2]]));
   if(m[3].toLowerCase()==='if'){
    const ast=parser.parseCode('<?php '+attrs.condition+';');code+=`if(h.truth(${expr(ast.children[0].expression)})){`;
   }else if(m[3].toLowerCase()==='volist')code+=`for(const __vo${seq} of c[${j(attrs.name)}]||[]){c[${j(attrs.id)}]=__vo${seq++};`;
   else{
    const sql=attrs.sql||`SELECT * FROM jzw_link WHERE typeid=${Number(attrs.typeid)} ORDER BY ${attrs.order||'listorder asc'} LIMIT ${attrs.limit||'100'}`;
    code+=`for(const __r${seq} of await m().query(h.sql(${j(sql)},c))){c.r=__r${seq++};`;
   }
  }
 }
 return code+html(text.slice(pos));
}
let output='// @ts-nocheck\n// Generated at build time from the supplied ThinkPHP templates. No PHP/eval in production.\nexport const templates = {\n';let count=0;
for(const folder of ['Home','Wap']){
 const target=path.join(root,'templates',folder);fs.mkdirSync(target,{recursive:true});
 const input=fs.existsSync(path.join(source,folder,'Default'))?path.join(source,folder,'Default'):target;
 for(const file of fs.readdirSync(input).filter(x=>x.endsWith('.html'))){
  const raw=fs.readFileSync(path.join(input,file),'utf8');
  if(input!==target)fs.writeFileSync(path.join(target,file),raw);
  try{output+=`${j(folder+'/'+file.replace('.html',''))}: async(c,m,h)=>{const o=[];${compile(raw)}\nreturn o.join('');},\n`;count++;}
  catch(e){throw Error(`${folder}/${file}: ${e.message}`)}
 }
}
fs.writeFileSync(path.join(root,'src/generated/templates.ts'),output+'};\n');
console.log(`Compiled ${count} original desktop/mobile templates.`);
