// Offline operator configuration check. It performs no provider reads, writes or
// grant installation. Private inputs must remain outside the repository.
import {readFileSync} from 'node:fs';import {resolve} from 'node:path';import {provisionedPurchases} from '../src/purchase-binding.mjs';
const path=process.argv[2];if(!path)throw Error('Usage: node scripts/check-purchase-grants.mjs /absolute/private/grants.json');
const raw=JSON.parse(readFileSync(resolve(path),'utf8'));provisionedPurchases(raw,'');const now=Date.now();
for(const grant of raw){if(Date.parse(grant.provisionedAt)>now||Date.parse(grant.expiresAt)<=now)throw Error('A grant is not currently active. Recheck operator dates before installation.');}
console.log(JSON.stringify({configurationValid:true,grants:raw.length,providerVerified:false,ownershipEstablished:false,installed:false,next:'Review trusted sales records and provider item rows before installing through the authenticated operator workflow.'}));
