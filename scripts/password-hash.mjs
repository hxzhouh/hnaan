import crypto from 'node:crypto';
let password='';for await(const chunk of process.stdin)password+=chunk;
password=password.replace(/\r?\n$/,'');if(password.length<14)throw Error('Use at least 14 characters');
const salt=crypto.randomBytes(16);const hash=crypto.pbkdf2Sync(password,salt,100000,32,'sha256');
process.stdout.write(`pbkdf2$100000$${salt.toString('hex')}$${hash.toString('hex')}\n`);
