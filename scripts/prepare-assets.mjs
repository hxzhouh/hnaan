import fs from 'node:fs/promises';
import path from 'node:path';
const external=process.argv.includes('--external-media');
const source=path.resolve('public'),target=path.resolve('dist/assets');
await fs.rm(target,{recursive:true,force:true});
await fs.mkdir(target,{recursive:true});
await fs.cp(source,target,{recursive:true,filter:entry=>!external||path.relative(source,entry).split(path.sep)[0]!=='Uploads'});
console.log('Prepared static templates and assets; historical uploads are served through the storage adapter.');
