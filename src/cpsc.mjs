import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';

const API = 'https://www.saferproducts.gov/RestWebServices/Recall';
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const names = value => Array.isArray(value) ? value.map(x => text(x.Name)).filter(Boolean) : [];

export function normalizeRecallNumber(value) {
  if (typeof value !== 'string' || !/^\d{2}-?\d{3}$/.test(value))
    throw new Error('Enter a CPSC recall number such as 27-026.');
  return value.replace('-', '');
}

export function recallDraft(record, { retrievedAt = new Date().toISOString() } = {}) {
  const number = normalizeRecallNumber(record?.RecallNumber);
  const source = new URL(record.URL);
  if (source.protocol !== 'https:' || !['cpsc.gov', 'www.cpsc.gov'].includes(source.hostname) ||
      !/^\/Recalls\/\d{4}\//i.test(source.pathname) || source.username || source.password || source.port)
    throw new Error('Expected a public CPSC recall source.');
  const description = text(record.Description);
  const remedies = names(record.Remedies);
  const options = Array.isArray(record.RemedyOptions) ? record.RemedyOptions.map(x=>text(x.Option)).filter(Boolean) : [];
  if (!text(record.Title) || !description || !remedies.length || !options.length)
    throw new Error('Recall source is incomplete; review the original notice.');
  const remedy = remedies.join('\n');
  const originalPayment = /original (?:form of )?payment|same form of payment/i.test(remedy);
  const check = /\bcheck\b|\bcheque\b/i.test(remedy);
  const credit = /store credit|gift card/i.test(remedy);
  const marketplace = /(?:Amazon|Walmart).{0,100}return systems/i.test(remedy);
  let route = 'REFUND_ROUTE_UNSPECIFIED';
  if (!options.includes('Refund')) route = 'NON_REFUND_REMEDY';
  else if (marketplace) route = 'MARKETPLACE_RETURN_REQUIRED';
  else if (credit && (originalPayment || check || /full refund or/i.test(remedy))) route = 'CHOICE_REQUIRES_REVIEW';
  else if (check) route = 'CHECK_REFUND';
  else if (credit) route = 'STORE_CREDIT';
  else if (originalPayment) route = 'ORIGINAL_PAYMENT_CANDIDATE';
  const sourceFields = {
    title:text(record.Title),description,remedies,options,
    products:(record.Products??[]).map(p=>({name:text(p.Name),model:text(p.Model),description:text(p.Description)})),
    retailers:names(record.Retailers),contact:text(record.ConsumerContact),
    recallDate:text(record.RecallDate),lastPublished:text(record.LastPublishDate),
  };
  // These are source excerpts, not generated disposal instructions or verified evidence.
  const requirements = remedies.flatMap((value,index) => value.split(/(?<=[.!?])\s+(?=[A-Z])/)
    .filter(sentence=>/photo|photograph|attest|confirm|register|registration|return|receipt|model number|batch number/i.test(sentence))
    .map(quote=>({field:`Remedies[${index}].Name`,quote,sourceUrl:source.href})));
  return {
    kind:'SOURCE_REVIEW_DRAFT',recallNumber:number,sourceUrl:source.href,retrievedAt,
    sourceDigest:digest({number,sourceUrl:source.href,...sourceFields}),...sourceFields,
    route,requirements,paymentAuthorized:false,
    unresolved:[
      'Read the original recall page for its complete instructions and updates.',
      'Merchant must confirm product, model and lot scope against the original notice.',
      'Merchant must verify responsibility for the remedy and the original capture/line mapping.',
      'Customer statements and uploaded images are not verified remedy evidence.',
      ...(route==='ORIGINAL_PAYMENT_CANDIDATE'?[]:['This source does not establish a single supported original-payment refund route.']),
    ],
  };
}

export async function fetchRecallDraft(recallNumber, {fetchImpl = fetch} = {}) {
  const number = normalizeRecallNumber(recallNumber);
  const url = new URL(API);
  url.searchParams.set('format','json');url.searchParams.set('RecallNumber',number);
  const response = await fetchImpl(url.href, {redirect:'manual',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});
  if (!response.ok) throw new Error(`CPSC source HTTP ${response.status}; no draft created.`);
  if (Number(response.headers.get('content-length')) > 2_000_000) throw new Error('CPSC response exceeds the source limit.');
  let bytes=0;
  const chunks=[];
  for await (const chunk of response.body) {
    bytes+=chunk.byteLength;
    if(bytes>2_000_000) throw new Error('CPSC response exceeds the source limit.');
    chunks.push(Buffer.from(chunk));
  }
  const records=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if (!Array.isArray(records)) throw new Error('Unrecognized CPSC response.');
  const exact=records.filter(record=>record.RecallNumber===number);
  if (exact.length!==1) throw new Error('No unique exact recall found; review the CPSC notice.');
  return recallDraft(exact[0]);
}
