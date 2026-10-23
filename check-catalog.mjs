import { matchCatalog } from './src/matcher.mjs';
import { sampleNotice } from './src/catalog.mjs';
const result=await matchCatalog(sampleNotice);
console.log(JSON.stringify({method:result.method,candidates:result.candidates.map(({sku,exactIdentity,score})=>({sku,exactIdentity,score}))},null,2));
