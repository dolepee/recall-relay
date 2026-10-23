export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname.startsWith('/api/'))return env.BACKEND.fetch(request);
    const appRoute=['/','/desk','/setup','/claim'].includes(url.pathname);
    if(appRoute)url.pathname='/';
    else if(!url.pathname.startsWith('/assets/'))return new Response('Not found',{status:404});
    const response=await env.ASSETS.fetch(new Request(url,request));
    const headers=new Headers(response.headers);headers.set('Referrer-Policy','no-referrer');headers.set('X-Content-Type-Options','nosniff');
    if(appRoute)headers.set('Cache-Control','no-store');
    else if(response.ok&&/\/[^/]+-[\w-]{8}\.(js|css|woff2?|png|jpe?g|svg|webp)$/.test(url.pathname))headers.set('Cache-Control','public, max-age=31536000, immutable');
    return new Response(response.body,{status:response.status,headers});
  },
};
