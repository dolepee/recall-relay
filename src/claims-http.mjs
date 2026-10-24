import {assistCases} from './source-workspace.mjs';

export function claimRoutes(desk, { json, body, origin, sourceWorkspace, ai }) {
  return async (req,res,path) => {
    if(!path.startsWith('/api/merchant/') && !path.startsWith('/api/claim/'))return false;
    res.setHeader('Referrer-Policy','no-referrer');
    try {
      if(!['GET','POST'].includes(req.method)){json(res,405,{error:'Unsupported method.'});return true;}
      if(req.method==='POST' && (req.headers.origin!==origin || req.headers['content-type']!=='application/json')) {
        json(res,403,{error:'Same-origin JSON requests required.'});return true;
      }
      const bearer=/^Bearer ([\w-]+)$/.exec(req.headers.authorization||'')?.[1];
      if(path==='/api/merchant/login' && req.method==='POST') {
        const input=await body(req);
        if(!desk.authenticateMerchant(input.key)){json(res,401,{error:'Use the private local merchant launch link.'});return true;}
        res.setHeader('Set-Cookie',`rr_merchant=${input.key}; HttpOnly; SameSite=Strict; Path=/api/merchant; Max-Age=28800${origin.startsWith('https:')?'; Secure':''}`);
        json(res,200,{authenticated:true});return true;
      }
      if(path.startsWith('/api/merchant/')) {
        const cookie=/(?:^|;\s*)rr_merchant=([\w-]+)/.exec(req.headers.cookie||'')?.[1];
        if(!desk.authenticateMerchant(cookie||bearer)){json(res,401,{error:'Open the private local merchant launch link to access this desk.'});return true;}
        if(path==='/api/merchant/state' && req.method==='GET'){json(res,200,desk.merchantState());return true;}
        if(path==='/api/merchant/sources' && req.method==='GET'){json(res,200,sourceWorkspace?sourceWorkspace.state():{ai:{available:false},setups:[]});return true;}
        if(req.method!=='POST'){json(res,405,{error:'Use the action button to continue.'});return true;}
        const input=await body(req);
        const actions={
          '/api/merchant/publish':()=>desk.publish(input.confirmed),
          '/api/merchant/checkout':()=>desk.createCheckout(),
          '/api/merchant/capture':()=>desk.captureCheckout(input.id),
          '/api/merchant/review':()=>desk.review(input.id,input),
          '/api/merchant/photograph':()=>desk.photograph(input.id,input),
          '/api/merchant/request-changes':()=>desk.requestChanges(input.id,input),
          '/api/merchant/approve':()=>desk.approve(input.id,input),
          '/api/merchant/reconcile':()=>desk.reconcile(input.id),
          '/api/merchant/source-import':()=>sourceWorkspace.import(input.recallNumber),
          '/api/merchant/source-suggest':()=>sourceWorkspace.suggest(input.id,input.revision),
          '/api/merchant/source-add':()=>sourceWorkspace.addField(input.id,input),
          '/api/merchant/source-review':()=>sourceWorkspace.review(input.id,input),
          '/api/merchant/source-activate':()=>sourceWorkspace.activate(input.id,input,desk),
          '/api/merchant/assist':()=>assistCases(ai,desk,input.question),
        };
        if(!actions[path]){json(res,404,{error:'Unknown action.'});return true;}
        const result=await actions[path]();json(res,200,result);return true;
      }
      // A customer capability grants access to exactly one claim, never merchant actions.
      try{desk.authorizeCustomer(bearer);}catch{json(res,401,{error:'Open your private claim link to continue.'});return true;}
      if(path==='/api/claim/state' && req.method==='GET')json(res,200,desk.customerState(bearer));
      else if(path==='/api/claim/submit' && req.method==='POST')json(res,200,desk.submit(bearer,await body(req)));
      else json(res,404,{error:'Unknown action.'});
    } catch(error) {json(res,400,{error:error.message});}
    return true;
  };
}
