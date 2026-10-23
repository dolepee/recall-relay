import React,{lazy,Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
const CustomerClaim=lazy(()=>import('./claim.jsx').then(m=>({default:m.CustomerClaim})));
const MerchantDesk=lazy(()=>import('./connected.jsx').then(m=>({default:m.MerchantDesk})));
const Training=lazy(()=>import('./training.jsx'));
const SourceSetup=lazy(()=>import('./setup.jsx').then(m=>({default:m.SourceSetup})));
const View=location.pathname==='/claim'?CustomerClaim:location.pathname==='/training'?Training:location.pathname==='/setup'?SourceSetup:MerchantDesk;
createRoot(document.getElementById('root')).render(<Suspense fallback={<main className="min-h-dvh bg-slate-50 p-8 text-slate-900"><p role="status">Opening Recall Relay…</p></main>}><View/></Suspense>);
