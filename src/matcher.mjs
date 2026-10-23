import { catalog } from './catalog.mjs';

const normalize = value => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,' ').trim();
const stop = new Set('a an the of to in and or with for from this that on is are at has have no'.split(' '));
const tokens = value => normalize(value).split(' ').filter(x=>x&&!stop.has(x)).map(x=>x.endsWith('s')&&x.length>3?x.slice(0,-1):x);

// Identity and BM25 performed at least as well as embeddings on the frozen
// small catalog comparison. Ranking never establishes claim eligibility.
export function rankCatalog(text, items) {
  if(typeof text!=='string'||text.trim().length<12||text.length>6000)
    throw new Error('Enter between 12 and 6,000 characters of notice text.');
  if(!items.length)return [];
  const docs=items.map(p=>tokens(`${p.brand}. ${p.name}. Model ${p.model}. ${p.description}`));
  const average=docs.reduce((n,d)=>n+d.length,0)/docs.length;
  const df=new Map();docs.forEach(doc=>new Set(doc).forEach(t=>df.set(t,(df.get(t)??0)+1)));
  const query=[...new Set(tokens(text))],normalized=` ${normalize(text)} `;
  return items.map((item,index)=>{
    const doc=docs[index],freq=new Map();doc.forEach(t=>freq.set(t,(freq.get(t)??0)+1));
    const score=query.reduce((sum,t)=>{
      const f=freq.get(t)??0,idf=Math.log(1+(docs.length-(df.get(t)??0)+0.5)/((df.get(t)??0)+0.5));
      return sum+idf*f*2.2/(f+1.2*(0.25+0.75*doc.length/average));
    },0);
    const exactIdentity=Boolean(item.brand&&item.model&&normalized.includes(` ${normalize(item.brand)} `)&&normalized.includes(` ${normalize(item.model)} `));
    return {...item,score,exactIdentity};
  }).filter(p=>p.exactIdentity||p.score>0).sort((a,b)=>Number(b.exactIdentity)-Number(a.exactIdentity)||b.score-a.score||a.sku.localeCompare(b.sku));
}

export async function matchCatalog(text) {
  const started=performance.now();
  return {method:'Exact brand/model + BM25',candidates:rankCatalog(text,catalog),elapsedMs:Math.round(performance.now()-started),boundary:'Catalog ranking only. Verify model, lot, responsible payer and remedy before reviewing purchases.'};
}
