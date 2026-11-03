import React,{useEffect,useRef,useState} from 'react';
import {AlertDialog} from '@base-ui/react/alert-dialog';
import {api,money} from './components.jsx';
import {AppShell,Badge,Button,Card,Callout,ErrorText,Field,StageTrack} from './system.jsx';
import {approveLabel,canApprove,canConfirmReview,customerTask,evidenceState,evidenceTitle,handoff,merchantNextStep,refundFacts,reviewedCurrent,stage} from './guided-state.mjs';

const kindLabel={PHOTO:'Photograph',CONFIRMATION:'Confirmation',TEXT:'Written information'};
const stripText='Simulated practice case · fictional merchandise · no payment provider';

function StatusBadge({value}){
  const code=value.case.status.code;
  const tone=code==='COMPLETED'?'success':code==='NEEDS_INFORMATION'||code==='MANUAL'?'attention':code==='UNKNOWN'||code==='FAILED'||code==='CANCELLED'?'danger':'info';
  return <Badge tone={tone}>{evidenceTitle(value)}</Badge>;
}

// The exact reviewed requirement and what the customer recorded against it.
function Requirements({value,audience='merchant'}){
  const c=value.case;
  const fields=value.scenario.requirements||[];
  return <div className="rr-stack" style={{gap:0}}>
    {fields.map(field=>{
      const recorded=field.kind==='CONFIRMATION'
        ? c.submission?.extra?.[field.id]===true?'Confirmed by the customer':'Not confirmed'
        : field.kind==='PHOTO'
          ? (c.submission?.hasPhoto?'Photograph attached':'No photograph attached')
          : (c.submission?.extra?.[field.id]||'Not provided');
      const missing=!c.submission||(field.kind==='CONFIRMATION'&&c.submission.extra?.[field.id]!==true)||(field.kind==='PHOTO'&&!c.submission.hasPhoto)||(field.kind==='TEXT'&&!c.submission.extra?.[field.id]);
      return <div key={field.id} className="rr-requirement">
        <p className="rr-source__cite">{field.citation} · {kindLabel[field.kind]}</p>
        <p className="rr-source__quote">“{field.quote}”</p>
        <p className={missing?'rr-requirement__answer rr-requirement__answer--missing':'rr-requirement__answer'}>{audience==='merchant'?'Recorded response':'Your response'}: {recorded}</p>
      </div>;
    })}
  </div>;
}

function Amounts({value,emphasis=true}){
  const facts=refundFacts(value);
  return <dl className="rr-amounts">
    <div data-emphasis={emphasis?'true':'false'}>
      <dt>Affected item refund<br/><small>{value.scenario.sku} · {value.scenario.lot}</small></dt>
      <dd>{facts.affected}<small>the only line inside this notice</small></dd>
    </div>
    <div><dt>Unaffected tray</dt><dd>{facts.excluded}<small>excluded · not refunded</small></dd></div>
    <div><dt>Practice purchase total</dt><dd>{facts.total}</dd></div>
    <div><dt>Destination</dt><dd style={{fontFamily:'inherit',fontWeight:500,fontSize:14}}>{facts.destination}</dd></div>
  </dl>;
}

function SourceSummary({value}){return <div className="rr-source">
  <p className="rr-source__cite">{value.scenario.sourceLabel}</p>
  <h3>{value.scenario.title}</h3>
  <p className="rr-source__note">{value.scenario.sourceNote}</p>
</div>;}

function CorrectionRequest({value,role}){
  const c=value.case;
  if(!c.correction)return null;
  const open=c.correction.state==='REQUESTED';
  const title=open?(role==='customer'?'The merchant needs an update':'Correction requested — waiting for the customer'):'Correction answered';
  return <Callout tone={open?'attention':'info'} title={title}>
    <p style={{whiteSpace:'pre-wrap'}}>{c.correction.message}</p>
    {c.correction.replacePhoto&&<p style={{fontWeight:600}}>{open?'A replacement photograph is required.':'A replacement photograph was required for this update.'}</p>}
    {c.correction.response&&<div style={{borderTop:'1px solid #DEE5EE',paddingTop:10,marginTop:4}}>
      <p className="rr-source__cite">Customer response</p>
      <p style={{whiteSpace:'pre-wrap'}}>{c.correction.response}</p>
    </div>}
  </Callout>;
}

function CustomerStage({value,run,busy,error,stale,onRefresh,expired}){
  const c=value.case;
  const task=customerTask(value);
  const [lot,setLot]=useState(c.submission?.lot||'');
  const [ack,setAck]=useState(c.submission?.acknowledged||false);
  const [extra,setExtra]=useState(c.submission?.extra||{});
  const [photo,setPhoto]=useState(undefined);
  const [fileName,setFileName]=useState('');
  const [reading,setReading]=useState(false);
  const [response,setResponse]=useState('');
  const [localError,setLocalError]=useState('');
  useEffect(()=>{setLot(c.submission?.lot||'');setAck(c.submission?.acknowledged||false);setExtra(c.submission?.extra||{});setPhoto(undefined);setFileName('');setResponse('');setLocalError('');},[c.id,c.revision]);
  const next=handoff(value);
  async function pickFile(event){
    const file=event.target.files?.[0];if(!file)return;
    setLocalError('');setPhoto(undefined);setFileName('');
    if(!['image/png','image/jpeg'].includes(file.type)||file.size>2*1024*1024){setLocalError('Choose a PNG or JPEG image smaller than 2 MB.');event.target.value='';return;}
    setReading(true);
    try{const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(file);});setPhoto(data);setFileName(file.name);}
    catch(e){setLocalError(e.message);}finally{setReading(false);}
  }
  async function useSample(kind){
    setLocalError('');setReading(true);
    try{
      const fetched=await fetch(`/assets/practice-label-${kind}.png`);
      if(!fetched.ok)throw new Error('The fictional sample label could not be loaded.');
      const blob=await fetched.blob();
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(blob);});
      setPhoto(data);setFileName(`fictional-sample-label-${kind}.png`);
    }catch(e){setLocalError(e.message);}finally{setReading(false);}
  }
  async function submit(event){
    event.preventDefault();
    await run('submit',{caseId:c.id,attempt:value.attempt,revision:c.revision,lot,acknowledged:ack,extra,correctionResponse:response,...(photo===undefined?{}:{photo})});
  }
  const fields=(value.scenario.requirements||[]).filter(f=>f.kind!=='PHOTO');
  const editable=!c.locked&&!c.refund;
  const submitLabel=busy?'Saving evidence…':task==='correction'?'Send updated evidence':c.submission?'Save a new revision':'Submit evidence';

  return <div className="rr-grid rr-grid--customer">
    <div className="rr-stack">
      <Card>
        <div className="rr-card__head">
          <div>
            <p className="rr-kicker">Customer · prepare claim</p>
            <h1 id="claim-heading" tabIndex={-1}>Your practice claim</h1>
          </div>
          <StatusBadge value={value}/>
        </div>
        <p className="rr-lede">{c.status.reason}</p>
        <div className="rr-stack" style={{marginTop:16}}>
          <SourceSummary value={value}/>
          <CorrectionRequest value={value} role="customer"/>
          {c.submission&&c.missing.length>0&&!c.locked&&<Callout tone="attention" title="Still needed"><ul style={{margin:0,paddingLeft:18}}>{c.missing.map(x=><li key={x}>{x}</li>)}</ul></Callout>}
        </div>
      </Card>

      {editable&&<Card>
        <div className="rr-card__head"><div><p className="rr-kicker">Evidence and responses</p><h2>What this claim needs</h2></div>{c.submission?<Badge tone="info">Revision {c.revision} saved</Badge>:<Badge tone="info">First revision</Badge>}</div>
        <form onSubmit={submit} className="rr-stack">
          <div className="rr-stack">
            <div>
              <h3>Label photograph</h3>
              <p className="rr-muted">The practice notice requires a photograph of the product label showing the lot code. Two fictional labels are provided so the case can be completed without a real photo.</p>
            </div>
            <div className="rr-actions">
              <Button variant="secondary" type="button" disabled={busy||reading} onClick={()=>useSample('a')}>Use fictional label A</Button>
              <Button variant="secondary" type="button" disabled={busy||reading} onClick={()=>useSample('b')}>Use fictional label B</Button>
            </div>
            <div className="rr-evidence">
              {photo?<img src={photo} alt="Photograph selected for this practice claim"/>
                :c.photo?<img src={c.photo} alt="Photograph already recorded on this practice claim"/>
                :<p className="rr-evidence__empty">No photograph on this revision yet. Choose a fictional label or upload a PNG or JPEG under 2 MB.</p>}
            </div>
            <p className="rr-muted" role="status">{reading?'Reading image…':fileName?`${fileName} ready to save`:c.submission?.hasPhoto?'A photograph is recorded on the current revision. Choosing another one replaces it.':'PNG or JPEG, under 2 MB.'}</p>
            <Field label="Or upload your own image" hint="A practice upload is never checked for authenticity." htmlFor="practice-photo">
              <input id="practice-photo" className="rr-file" type="file" accept="image/png,image/jpeg" onChange={pickFile} disabled={busy||reading}/>
            </Field>
          </div>

          <Field label="Lot printed on the cup" hint="The notice requires LOT-A for this practice case." htmlFor="practice-lot">
            <input id="practice-lot" className="rr-input" value={lot} maxLength={40} disabled={busy} onChange={e=>setLot(e.target.value)} placeholder="For example, LOT-A"/>
          </Field>

          {fields.map(field=>field.kind==='CONFIRMATION'
            ?<label key={field.id} className="rr-check">
              <input type="checkbox" checked={extra[field.id]===true} disabled={busy} onChange={e=>setExtra(old=>({...old,[field.id]:e.target.checked}))}/>
              <span>{field.quote}<span className="rr-muted" style={{display:'block',marginTop:4}}>Answering records your statement; the merchant reviews it rather than verifying it for you.</span></span>
            </label>
            :<Field key={field.id} label={field.quote} htmlFor={`field-${field.id}`}>
              <textarea id={`field-${field.id}`} className="rr-textarea" rows={3} value={extra[field.id]||''} maxLength={500} disabled={busy} onChange={e=>setExtra(old=>({...old,[field.id]:e.target.value}))}/>
            </Field>)}

          {c.correction?.state==='REQUESTED'&&<Field label="Your response to the merchant" hint="Describe what you changed or clarify the requested information." htmlFor="practice-response">
            <textarea id="practice-response" className="rr-textarea" rows={3} value={response} required minLength={3} maxLength={1000} disabled={busy} onChange={e=>setResponse(e.target.value)}/>
          </Field>}

          <label className="rr-check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={busy}/>I confirm this is the item from my fictional practice purchase and that the lot code is the one printed on it.</label>

          <ErrorText error={localError||error}/>
          {stale&&<Button variant="secondary" type="button" onClick={onRefresh}>Refresh practice case</Button>}
          <div className="rr-actions">
            <Button type="submit" disabled={busy||reading}>{submitLabel}</Button>
            <p className="rr-muted">Saving creates revision {c.revision+1} and clears any earlier review. Nothing here is sent to a payment provider.</p>
          </div>
        </form>
      </Card>}

      {next&&<Callout tone="success" title={next.title} actions={<Button onClick={()=>run('role',{role:next.to})} disabled={busy}>{next.label}</Button>}>
        <p>{next.body}</p>
      </Callout>}

      {c.refund&&<Receipt value={value} run={run} busy={busy}/>}
      {c.unresolved&&<Callout tone="attention" title="Simulated refund not recorded"><p>A {money(c.unresolved.cents)} attempt is {c.unresolved.state.toLowerCase()} on this practice case. No funds moved. The merchant can resume a prepared attempt or start a new practice case.</p></Callout>}
      <ErrorText error={error}/>
      {stale&&<Button variant="secondary" onClick={onRefresh}>Refresh practice case</Button>}
      {expired&&<Callout tone="attention" title="This practice case expired" actions={<Button onClick={()=>run('new',{})} disabled={busy}>Start a fresh practice case</Button>}><p>Practice cases are kept for 24 hours in this session. A fresh case starts the journey again.</p></Callout>}
    </div>

    <aside className="rr-stack" aria-label="Claim context">
      <Card quiet>
        <p className="rr-kicker">Claim and amounts</p>
        <h2 style={{marginTop:6}}>{c.id}</h2>
        <p className="rr-muted" style={{marginBottom:10}}>Practice order · attempt {value.attempt}{c.revision>0?` · revision ${c.revision}`:''}</p>
        <Amounts value={value}/>
        <p className="rr-muted" style={{marginTop:12}}>The $34.00 tray in the same fictional purchase is outside this notice. Practising here never moves money.</p>
      </Card>
      <Card quiet>
        <p className="rr-kicker">What happens next</p>
        <p className="rr-muted" style={{marginTop:8}}>{next?next.title:merchantNextStep(value)}</p>
      </Card>
    </aside>
  </div>;
}

function ReviewStage({value,run,busy,error,stale,onRefresh}){
  const c=value.case;
  const [acknowledged,setAcknowledged]=useState(false);
  const [message,setMessage]=useState('');
  const [replacePhoto,setReplacePhoto]=useState(true);
  useEffect(()=>{setAcknowledged(false);setMessage('');setReplacePhoto(true);},[c.id,c.revision]);
  const next=handoff(value);
  const binding={caseId:c.id,attempt:value.attempt,revision:c.revision};
  const confirmable=canConfirmReview(value,acknowledged);

  if(!c.submission&&!c.correction) return <div className="rr-grid rr-grid--review">
    <Card>
      <p className="rr-kicker">Merchant · review evidence</p>
      <h1 id="claim-heading" tabIndex={-1}>Nothing to review yet</h1>
      <p className="rr-lede" style={{marginTop:10}}>This claim is waiting for the customer’s evidence. The customer’s page is the next step, not a role you switch into.</p>
      <div className="rr-actions" style={{marginTop:16}}><Button onClick={()=>run('role',{role:'customer'})} disabled={busy}>Continue as customer</Button></div>
      <ErrorText error={error}/>
    </Card>
  </div>;

  return <div className="rr-grid rr-grid--review">
    <div className="rr-stack">
      <Card>
        <div className="rr-card__head">
          <div><p className="rr-kicker">Merchant · review evidence</p><h1 id="claim-heading" tabIndex={-1}>Review this claim</h1></div>
          <StatusBadge value={value}/>
        </div>
        <p className="rr-lede">{c.status.reason}</p>
        <div className="rr-stack" style={{marginTop:16}}>
          <CorrectionRequest value={value} role="merchant"/>
        </div>
      </Card>

      <Card aria-labelledby="evidence-heading">
        <p className="rr-kicker">The requirement, then the evidence</p>
        <h2 id="evidence-heading" style={{marginTop:6}}>{value.scenario.title}</h2>
        <p className="rr-muted" style={{margin:'6px 0 14px'}}>{value.scenario.sourceNote}</p>
        <Requirements value={value}/>
        <div style={{marginTop:16}}>
          <div className="rr-card__head">
            <div><h3>Submitted evidence · revision {c.revision}</h3><p className="rr-muted">The largest part of this review. A practice upload does not establish authenticity or eligibility.</p></div>
            <Badge tone={c.submission?.hasPhoto?'info':'attention'}>{c.submission?.hasPhoto?'Photograph attached':'No photograph'}</Badge>
          </div>
          <div className="rr-evidence">
            {c.photo?<img src={c.photo} alt="Customer-submitted product label for this practice claim"/>
              :<p className="rr-evidence__empty">No photograph is recorded on this revision. Review the recorded responses, or request what is missing.</p>}
          </div>
        </div>
      </Card>

      {!c.locked&&<Card>
        <div className="rr-card__head"><div><p className="rr-kicker">Decision</p><h2>Confirm the evidence review</h2></div>{reviewedCurrent(value)&&<Badge tone="success">Reviewed · revision {c.revision}</Badge>}</div>
        <p className="rr-lede">Compare the requirement above with the recorded responses and the photograph. Confirming a review is not a refund approval; the refund is a separate, explicit step.</p>
        <div className="rr-stack" style={{marginTop:14}}>
          <label className="rr-check">
            <input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)} disabled={busy||c.missing.length>0||c.correction?.state==='REQUESTED'}/>
            <span>I inspected this revision’s photograph and confirmed that the lot, the confirmation and the required responses match the reviewed practice notice.</span>
          </label>
          {c.missing.length>0&&<p className="rr-muted">Review is unavailable until the missing information is recorded.</p>}
          {c.correction?.state==='REQUESTED'&&<p className="rr-muted">This revision cannot be reviewed while a correction request is open.</p>}
          <div className="rr-actions">
            <Button disabled={!confirmable||busy} onClick={()=>run('review',{...binding,confirmed:true})}>{busy?'Saving review…':'Confirm evidence review'}</Button>
            <p className="rr-muted">You can still request a correction instead.</p>
          </div>
        </div>
      </Card>}

      {!c.locked&&c.submission&&c.correction?.state!=='REQUESTED'&&<Card quiet>
        <details>
          <summary style={{minHeight:44,display:'flex',alignItems:'center',cursor:'pointer',fontWeight:650}}>Request a correction instead</summary>
          <form onSubmit={e=>{e.preventDefault();run('request-changes',{...binding,message,replacePhoto});}} className="rr-stack" style={{marginTop:12}}>
            <p className="rr-muted">This clears any recorded review for the current revision and shows your message on the customer’s claim. A new review is required afterwards. The earlier submission is replaced when the customer saves a new revision.</p>
            <Field label="What should the customer change?" htmlFor="correction-message">
              <textarea id="correction-message" className="rr-textarea" rows={3} value={message} required minLength={10} maxLength={600} disabled={busy} onChange={e=>setMessage(e.target.value)} placeholder="For example, the lot code is too blurred to read. Please upload a clearer photograph."/>
            </Field>
            <label className="rr-check"><input type="checkbox" checked={replacePhoto} onChange={e=>setReplacePhoto(e.target.checked)} disabled={busy}/>Require a replacement photograph</label>
            <div className="rr-actions"><Button variant="secondary" type="submit" disabled={busy||message.trim().length<10}>{busy?'Saving request…':'Request customer update'}</Button></div>
          </form>
        </details>
      </Card>}

      {next&&<Callout tone="attention" title={next.title} actions={<Button onClick={()=>run('role',{role:next.to})} disabled={busy}>{next.label}</Button>}><p>{next.body}</p></Callout>}
      <ErrorText error={error}/>
      {stale&&<div className="rr-actions"><Button variant="secondary" onClick={onRefresh}>Refresh practice case</Button></div>}
      <Card quiet>
        <div className="rr-actions" style={{justifyContent:'space-between'}}>
          <Button variant="quiet" onClick={()=>run('restart',{})} disabled={busy}>Start a new practice case</Button>
          <p className="rr-muted">Attempt {value.attempt}. Reloading keeps this attempt.</p>
        </div>
      </Card>
    </div>

    <aside className="rr-stack" aria-label="Refund consequences">
      <Card quiet>
        <p className="rr-kicker">Refund consequences</p>
        <h2 style={{marginTop:6,marginBottom:10}}>What a refund would cover</h2>
        <Amounts value={value}/>
        <p className="rr-muted" style={{marginTop:12}}>These amounts are visible here, and again at approval, so the decision is never made against a bare button.</p>
      </Card>
      <Card quiet>
        <p className="rr-kicker">Claim</p>
        <dl className="rr-amounts" style={{marginTop:8}}>
          <div><dt>Case</dt><dd style={{fontFamily:'inherit',fontSize:13,fontWeight:500,wordBreak:'break-all'}}>{c.id}</dd></div>
          <div><dt>Revision</dt><dd>{c.revision}</dd></div>
          <div><dt>Review</dt><dd style={{fontFamily:'inherit',fontWeight:500}}>{reviewedCurrent(value)?`Recorded · revision ${c.review.revision}`:'Not recorded'}</dd></div>
        </dl>
        <p className="rr-muted" style={{marginTop:10}}>{merchantNextStep(value)}</p>
      </Card>
    </aside>
  </div>;
}

function ApproveStage({value,run,busy,error,stale,onRefresh}){
  const c=value.case;
  const [confirmOpen,setConfirmOpen]=useState(false);
  const facts=refundFacts(value);
  const approvable=canApprove(value);
  useEffect(()=>{setConfirmOpen(false);},[c.id,c.revision,c.locked]);
  if(c.refund) return <div className="rr-grid rr-grid--review">
    <div className="rr-stack">
      <Card>
        <p className="rr-kicker">Merchant · approve refund</p>
        <h1 id="claim-heading" tabIndex={-1}>Refund recorded</h1>
        <p className="rr-lede" style={{marginTop:10}}>The claim reached the end of the practice journey. This record is simulated; no payment provider was contacted and no funds moved.</p>
      </Card>
      <Receipt value={value} run={run} busy={busy}/>
      <ErrorText error={error}/>
      <Card quiet><div className="rr-actions" style={{justifyContent:'space-between'}}><Button variant="quiet" onClick={()=>run('restart',{})} disabled={busy}>Start a new practice case</Button><p className="rr-muted">Attempt {value.attempt} · simulated only</p></div></Card>
    </div>
    <aside className="rr-stack" aria-label="Refund consequences">
      <Card quiet><p className="rr-kicker">What was recorded</p><Amounts value={value} emphasis={false}/></Card>
      <Card quiet><p className="rr-kicker">Claim</p><dl className="rr-amounts" style={{marginTop:8}}><div><dt>Case</dt><dd style={{fontFamily:'inherit',fontSize:13,fontWeight:500,wordBreak:'break-all'}}>{c.id}</dd></div><div><dt>Reviewed revision</dt><dd>{c.review?.revision??'—'}</dd></div><div><dt>Reference</dt><dd style={{fontSize:12,fontWeight:500,wordBreak:'break-all'}}>{facts.reference||'—'}</dd></div></dl></Card>
    </aside>
  </div>;

  return <div className="rr-grid rr-grid--review">
    <div className="rr-stack">
      <Card>
        <p className="rr-kicker">Merchant · approve refund</p>
        <div className="rr-card__head" style={{marginTop:6}}>
          <div><h1 id="claim-heading" tabIndex={-1}>Approve the refund</h1><p className="rr-lede" style={{marginTop:8}}>Evidence review is recorded for revision {c.review?.revision??c.revision}. The remaining decision is the refund, with its amount and exclusions in view.</p></div>
          <Badge tone="success">Evidence reviewed</Badge>
        </div>
        <div className="rr-stack" style={{marginTop:8}}>
          <Callout tone="info" title="What this records">
            <p>A simulated refund of <strong>{facts.affected}</strong> against this practice case only. No payment provider is contacted, no credentials are used, and the {facts.excluded} tray stays outside the refund.</p>
          </Callout>
          <div className="rr-actions">
            <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialog.Trigger render={<Button disabled={!approvable||busy}/>}>{approveLabel(value)}</AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Backdrop className="rr-dialog-backdrop"/>
                <AlertDialog.Popup className="rr-dialog">
                  <AlertDialog.Title render={<h2/>}>Approve {facts.affected} refund?</AlertDialog.Title>
                  <AlertDialog.Description render={<p/>}>This records a simulated refund against {c.id}. No payment provider is contacted and no funds move. The {facts.excluded} tray is excluded, and the destination is the simulated original payment.</AlertDialog.Description>
                  <Amounts value={value}/>
                  <div className="rr-actions">
                    <AlertDialog.Close render={<Button variant="secondary"/>}>Go back</AlertDialog.Close>
                    <Button disabled={busy} onClick={async()=>{setConfirmOpen(false);await run('approve',{caseId:c.id,attempt:value.attempt,revision:c.revision,confirmed:true,digest:c.plan.digest});}}>Confirm simulated refund</Button>
                  </div>
                </AlertDialog.Popup>
              </AlertDialog.Portal>
            </AlertDialog.Root>
            <p className="rr-muted">The final action names the exact amount. Nothing is approved from a bare button.</p>
          </div>
          {!approvable&&<p className="rr-muted">{c.plan.reason||'This claim is not ready for a refund decision.'}</p>}
        </div>
      </Card>

      {c.unresolved&&<Callout tone="attention" title="Simulated refund prepared, not recorded" actions={c.unresolved.state==='RESERVED'?<Button onClick={()=>run('resume',{caseId:c.id,attempt:value.attempt,revision:c.revision,digest:c.plan.digest})} disabled={busy}>Resume simulated refund</Button>:null}>
        <p>A {money(c.unresolved.cents)} attempt is {c.unresolved.state.toLowerCase()}. No funds moved. {c.unresolved.state==='RESERVED'?'Resume the prepared attempt, or start a new practice case.':'This attempt cannot be resumed safely; start a new practice case.'}</p>
      </Callout>}
      <ErrorText error={error}/>
      {stale&&<div className="rr-actions"><Button variant="secondary" onClick={onRefresh}>Refresh practice case</Button></div>}
      <Card quiet><div className="rr-actions" style={{justifyContent:'space-between'}}><Button variant="quiet" onClick={()=>run('restart',{})} disabled={busy}>Start a new practice case</Button><p className="rr-muted">Attempt {value.attempt}</p></div></Card>
    </div>

    <aside className="rr-stack" aria-label="Refund consequences">
      <Card quiet>
        <p className="rr-kicker">At approval</p>
        <h2 style={{marginTop:6,marginBottom:10}}>{facts.affected} to the affected item</h2>
        <Amounts value={value}/>
        <p className="rr-muted" style={{marginTop:12}}>Affected amount, excluded items and the original payment destination stay visible at the moment of approval.</p>
      </Card>
      <Card quiet>
        <p className="rr-kicker">Recorded review</p>
        <dl className="rr-amounts" style={{marginTop:8}}>
          <div><dt>Revision reviewed</dt><dd>{c.review?.revision??'—'}</dd></div>
          <div><dt>Current revision</dt><dd>{c.revision}</dd></div>
          <div><dt>Decision</dt><dd style={{fontFamily:'inherit',fontWeight:500}}>{approvable?'Ready for refund':'Not ready'}</dd></div>
        </dl>
        <p className="rr-muted" style={{marginTop:10}}>{merchantNextStep(value)}</p>
      </Card>
    </aside>
  </div>;
}

function Receipt({value,run,busy}){
  const c=value.case;
  const facts=refundFacts(value);
  return <section className="rr-receipt" aria-label="Simulated refund receipt">
    <p className="rr-kicker" style={{color:'#0B5B3A'}}>Simulated refund. No funds moved.</p>
    <h2 style={{marginTop:8}}>{facts.completedAmount} recorded</h2>
    <p style={{marginTop:8,color:'#0B5B3A',fontSize:15}}>Recorded on this practice case only. No payment provider was contacted and the {facts.excluded} tray was not refunded.</p>
    <dl className="rr-amounts" style={{marginTop:14}}>
      <div><dt style={{color:'#0B5B3A'}}>Status</dt><dd>Simulated · completed</dd></div>
      {facts.reference&&<div><dt style={{color:'#0B5B3A'}}>Practice reference</dt><dd style={{fontSize:12,wordBreak:'break-all'}}>{facts.reference}</dd></div>}
      <div><dt style={{color:'#0B5B3A'}}>Destination</dt><dd style={{fontFamily:'inherit',fontWeight:500,fontSize:14}}>{facts.destination}</dd></div>
    </dl>
  </section>;
}

export default function Practice(){
  const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[stale,setStale]=useState(false),[expired,setExpired]=useState(false);
  const heading=useRef(null);
  async function refresh(){setError('');setStale(false);setExpired(false);try{setState(await api('practice/state'));}catch(e){setError(e.message);setExpired(Boolean(e.expired));}}
  useEffect(()=>{let active=true;api('practice/state').then(v=>active&&setState(v)).catch(e=>active&&(setError(e.message),setExpired(Boolean(e.expired))));return()=>{active=false;};},[]);
  async function run(action,data){setBusy(true);setError('');setStale(false);setExpired(false);try{setState(await api(`practice/${action}`,data));}catch(e){setError(e.message);setStale(Boolean(e.stale));setExpired(Boolean(e.expired));}finally{setBusy(false);}}
  // A handoff changes who is acting, so the heading is the new reading position.
  const current=state?stage(state):1;
  useEffect(()=>{if(!state)return;const target=document.getElementById('claim-heading')||heading.current;target?.focus?.();},[state?.role,current]);
  return <div className="rr-app">
    <AppShell strip={stripText}>
      <div ref={heading} tabIndex={-1} style={{outline:'none'}}>
        <div className="rr-card__head" style={{alignItems:'flex-end'}}>
          <div>
            <p className="rr-kicker">Guided practice claim</p>
            <h1 style={{marginTop:6}}>One claim, from evidence to refund.</h1>
            <p className="rr-lede" style={{marginTop:8}}>A reviewed practice notice, one fictional affected cup and the excluded tray in the same purchase. Customer evidence, a merchant review, and a simulated refund — with a separate, explicit approval for the money.</p>
          </div>
          <Badge tone="attention">Simulated mode</Badge>
        </div>
        <StageTrack current={current}/>
      </div>

      {!state?<Card style={{marginTop:20}} aria-busy={!error}>
        <p role="status" className="rr-lede">{error?'This practice case could not be opened.':'Opening your practice case…'}</p>
        <ErrorText error={error}/>
        <div className="rr-actions" style={{marginTop:14}}>
          {expired&&<Button onClick={()=>run('new',{})} disabled={busy}>Start a fresh practice case</Button>}
          <Button variant="secondary" onClick={refresh} disabled={busy}>Retry</Button>
        </div>
      </Card>:<div style={{marginTop:20}}>
        {expired&&<div style={{marginBottom:16}}><Callout tone="attention" title="This practice case expired" actions={<Button onClick={()=>run('new',{})} disabled={busy}>Start a fresh practice case</Button>}><p>Practice cases are kept for 24 hours in this session. A fresh case starts the journey again.</p></Callout></div>}
        {current===1?<CustomerStage value={state} run={run} busy={busy} error={error} stale={stale} onRefresh={refresh} expired={expired}/>
          :current===2?<ReviewStage value={state} run={run} busy={busy} error={error} stale={stale} onRefresh={refresh}/>
          :<ApproveStage value={state} run={run} busy={busy} error={error} stale={stale} onRefresh={refresh}/>}
        <p className="rr-muted" style={{marginTop:18}}>{state.boundary.storage} {state.boundary.provider} {state.boundary.assistant}</p>
      </div>}
    </AppShell>
  </div>;
}
