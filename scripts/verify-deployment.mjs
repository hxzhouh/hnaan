import fs from 'node:fs';
const file='deployment/target.json';
if(!fs.existsSync(file))throw Error('Provision the target account and verify the historical media transfer before deploying');
const target=JSON.parse(fs.readFileSync(file,'utf8'));
if(!process.env.CLOUDFLARE_API_TOKEN||process.env.CLOUDFLARE_ACCOUNT_ID!==target.accountId)throw Error('Deployment credentials do not match the verified target account');
const config=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
if(config.d1_databases.find(b=>b.binding==='DB')?.database_id!==target.databaseId||config.r2_buckets.find(b=>b.binding==='MEDIA')?.bucket_name!==target.bucket||!target.verifiedFiles)throw Error('Target database or media migration is unverified');
for(const key of target.sampleKeys){
 const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.accountId}/r2/buckets/${target.bucket}/objects/${key}`,{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN,Range:'bytes=0-0'}});
 if(!response.ok)throw Error(`Historical media unavailable (${response.status}): ${key}`);
 await response.body?.cancel();
}
console.log(`Verified target account and historical media (${target.verifiedFiles} files)`);
