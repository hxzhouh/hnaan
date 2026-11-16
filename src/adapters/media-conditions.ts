export function matchesIfRange(value:string,etag:string|null,modified:string|null){
 if(value.startsWith('"')||value.startsWith('W/'))return !value.startsWith('W/')&&value===etag;
 const since=Date.parse(value),last=Date.parse(modified||'');
 return Number.isFinite(since)&&Number.isFinite(last)&&last<=since;
}
