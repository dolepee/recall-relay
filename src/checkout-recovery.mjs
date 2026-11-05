// Pure projection shared by the desk and browser. It grants no provider action.
export const CREATE_REPLAY_WINDOW_MS=5*3600000;
export function checkoutRecovery(checkout,now){
 if(checkout.quarantine)return {canResume:false,canQuarantine:false,quarantined:true,reason:'Quarantined for manual reconciliation. This does not cancel a provider order or prove that no payment occurred.'};
 if(checkout.orderId||checkout.claimId)return {canResume:false,canQuarantine:false,reason:'A known order or claim must use its existing verification path.'};
 const time=Date.parse(now),last=Date.parse(checkout.createAttemptAt);
 if(!Number.isFinite(time))return {canResume:false,canQuarantine:false,reason:'The workspace clock could not be checked.'};
 if(checkout.createAttemptAt&&(!Number.isFinite(last)||time-last<60000))return {canResume:false,canQuarantine:false,reason:'Purchase setup may still be in progress. Refresh its state after one minute.'};
 if(checkout.state==='CREATE_FAILED'&&!checkout.firstDispatchAt)return {canResume:true,canQuarantine:true,quarantined:false,reason:'Setup failed before order dispatch. Keep this record and start a separate setup if needed.'};
 const first=Date.parse(checkout.firstDispatchAt||checkout.createdAt);
 if(!Number.isFinite(first)||first>time)return {canResume:false,canQuarantine:false,reason:'The original dispatch time cannot be established. Keep this setup for manual reconciliation.'};
 if(time-first<=CREATE_REPLAY_WINDOW_MS)return {canResume:true,canQuarantine:false,quarantined:false,reason:'Resume the original setup within its safe replay window. Do not start another purchase for the same attempt.'};
 return {canResume:false,canQuarantine:true,quarantined:false,reason:'The safe replay window has expired. Preserve this unresolved attempt for manual reconciliation before starting a separate purchase.'};
}
