export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/'))return env.BACKEND.fetch(request);
    // The reviewed landing document answers /; the workbench keeps its own routes.
    const landing=url.pathname==='/';
    const appRoute=['/desk','/setup','/claim'].includes(url.pathname);
    if(landing)url.pathname='/landing.html';
    else if(appRoute)url.pathname='/';
    else if(!url.pathname.startsWith('/assets/'))return new Response('Not found',{status:404});
    const response=await asset(env,url,request);
    const headers=new Headers(response.headers);headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');
    if(landing||appRoute)headers.set('Cache-Control','no-store');
    else if(response.ok&&/\/[^/]+-[\w-]{8}\.(js|css|woff2?|png|jpe?g|svg|webp)$/.test(url.pathname))headers.set('Cache-Control','public, max-age=31536000, immutable');
    return new Response(response.body,{status:response.status,headers});
  },
};

// Pages serves an .html asset at its extensionless path and answers the .html
// request with a redirect, so a document request can come back as a 3xx. Follow
// it here and serve the document at the visitor's original URL rather than
// passing a redirect on to a path this worker does not route.
async function asset(env,url,request){
  let target=new URL(url);
  let response;
  for(let hop=0;hop<3;hop++){
    response=await env.ASSETS.fetch(new Request(target,request));
    if(response.status<300||response.status>=400)return response;
    const location=response.headers.get('Location');
    if(!location)return response;
    const next=new URL(location,target);
    if(next.origin!==target.origin)return new Response('Not found',{status:404});
    target=next;
  }
  return new Response('Not found',{status:404});
}
