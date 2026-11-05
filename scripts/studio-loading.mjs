// Keep vendor hashes independent of app route edits. Do not pull dependencies
// recursively into Studio: React is shared with every lightweight route.
export const studioCodeSplitting={
  includeDependenciesRecursively:false,
  groups:[
    {name:'studio-vendor',test:/node_modules\/ag-(studio|grid|charts|stack)/},
    {name:'react-vendor',test:/node_modules\/(react|react-dom|scheduler)\//},
  ],
};

export function studioPreload(){
  return {
    name:'desktop-studio-preload',
    transformIndexHtml:{order:'post',handler(html,context){
      if(!context.bundle)return html;
      const vendor=Object.values(context.bundle).find(item=>item.type==='chunk'&&item.name==='studio-vendor');
      if(!vendor)throw new Error('Studio vendor chunk missing');
      // Start the download with the document, before route/workspace imports.
      // Match the actual desk breakpoints; other routes never request Studio.
      const code=`(()=>{const p=location.pathname;if(((p==='/desk'||p==='/practice/reconciliation')&&matchMedia('(min-width: 1280px)').matches)||(p==='/sample'&&matchMedia('(min-width: 1100px)').matches)){const l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='anonymous';l.href=${JSON.stringify('/'+vendor.fileName)};document.head.append(l);}})();`;
      return [{tag:'script',children:code,injectTo:'head-prepend'}];
    }},
  };
}
