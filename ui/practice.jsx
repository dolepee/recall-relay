import React,{useEffect,useRef,useState} from 'react';
import {AlertDialog} from '@base-ui/react/alert-dialog';
import {api,money} from './components.jsx';
import {AppShell,Badge,Button,Card,Callout,ErrorText,Field,StageTrack} from './system.jsx';
import {approveActionLabel,approveLabel,canApprove,canConfirmReview,canReturnToReview,customerTask,evidenceState,evidenceTitle,handoff,merchantNextStep,progressStage,refundFacts,reviewPhotoKey,reviewedCurrent,stage} from './guided-state.mjs';

const kindLabel={PHOTO:'Photograph',CONFIRMATION:'Confirmation',TEXT:'Written information'};

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

function ReviewIcon({kind}){
  const paths={
    photo:<><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="2"/><path d="m21 15-4.5-4.5L7 20"/></>,
    lot:<><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3"/><path d="M8 8v8m3-8v8m3-8v8m3-8v8"/></>,
    note:<><path d="M4 4h16v12H8l-4 4z"/><path d="M8 8h8M8 12h6"/></>,
    purchase:<><path d="M6 7h12l1 13H5z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>
  };
  return <svg className="rr-review-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" focusable="false">{paths[kind]}</svg>;
}

function SubmittedReview({value}){
  const c=value.case;
  const defect=c.submission?.extra?.['practice-defect']||'Recorded defect response';
  return <div className="rr-review-list">
    <div className="rr-review-row">
      <ReviewIcon kind="photo"/>
      <div className="rr-review-row__body"><strong>Product label photo</strong><span>Submitted</span></div>
      {c.photo?<img className="rr-review-thumb" src={c.photo} alt="Submitted product label photograph"/>:null}
    </div>
    <div className="rr-review-row">
      <ReviewIcon kind="purchase"/>
      <div className="rr-review-row__body"><strong>Linked practice purchase</strong><span>{c.submission?.acknowledged?'Customer confirmed':'Not confirmed'}</span></div>
    </div>
    <div className="rr-review-row">
      <ReviewIcon kind="lot"/>
      <div className="rr-review-row__body"><strong>Lot code</strong><span>{c.submission?.lot||'Not recorded'} · expected {value.scenario.lot}</span></div>
    </div>
    <div className="rr-review-row">
      <ReviewIcon kind="note"/>
      <div className="rr-review-row__body"><strong>Defect description</strong><span>{defect}</span></div>
    </div>
  </div>;
}

function HandoffSummary({value}){
  const facts=refundFacts(value);
  return <div className="rr-handoff-summary">
    <img src="/assets/practice-cup.png" alt="Fictional Relay Home cup"/>
    <div className="rr-handoff-summary__body"><strong>Relay Home cup</strong><span>CUP-01 · LOT-A</span></div>
    <dl className="rr-handoff-summary__money">
      <div><dt>Affected</dt><dd>{facts.affected}</dd></div>
      <div><dt>Excluded</dt><dd>{facts.excluded}</dd></div>
    </dl>
  </div>;
}

function PracticeClaimCard({value}){
  const facts=refundFacts(value);
  return <Card>
    <p className="rr-kicker">Your practice claim</p>
    <img className="rr-product" src="/assets/practice-cup.png" alt="Fictional Relay Home cup"/>
    <h2 style={{marginTop:12}}>Relay Home cup</h2>
    <p className="rr-muted">CUP-01 · LOT-A</p>
    <dl className="rr-amounts rr-amounts--tight">
      <div><dt>Affected cup</dt><dd>{facts.affected}</dd></div>
      <div><dt>Excluded tray</dt><dd>{facts.excluded}</dd></div>
      <div><dt>Original purchase</dt><dd>{facts.total}</dd></div>
    </dl>
    <p className="rr-note-box">Only the affected cup is refunded.</p>
  </Card>;
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

export function CustomerStage({value,run,busy,error,stale,onRefresh,expired}){
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
  const [editing,setEditing]=useState(false);
  useEffect(()=>{setLot(c.submission?.lot||'');setAck(c.submission?.acknowledged||false);setExtra(c.submission?.extra||{});setPhoto(undefined);setFileName('');setResponse('');setLocalError('');setEditing(false);},[c.id,c.revision]);
  const next=handoff(value);
  const submitted=Boolean(c.submission)&&c.missing.length===0&&c.correction?.state!=='REQUESTED'&&!c.locked;
  const showForm=!c.submissionLimitReached&&!c.locked&&!c.refund&&(!submitted||editing||task==='correction');
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
    if(busy||reading||localError||!canSubmit)return;
    await run('submit',{caseId:c.id,attempt:value.attempt,revision:c.revision,lot,acknowledged:ack,extra,correctionResponse:response,...(photo===undefined?{}:{photo})});
  }
  const fields=(value.scenario.requirements||[]).filter(f=>f.kind!=='PHOTO');
  const confirmations=fields.filter(f=>f.kind==='CONFIRMATION');
  const descriptions=fields.filter(f=>f.kind!=='CONFIRMATION');
  const missing=[];
  const replacementRequired=c.correction?.state==='REQUESTED'&&c.correction.replacePhoto;
  if(replacementRequired?(!photo||photo===c.photo):(!photo&&!c.photo))missing.push(replacementRequired?'replacement photo':'photo');
  if(!lot.trim())missing.push('lot code');
  if(!ack)missing.push('purchase confirmation');
  if(confirmations.some(field=>extra[field.id]!==true))missing.push('required confirmations');
  if(descriptions.some(field=>!String(extra[field.id]||'').trim()))missing.push('defect description');
  if(c.correction?.state==='REQUESTED'&&response.trim().length<3)missing.push('correction response');
  const canSubmit=missing.length===0;
  const submitLabel=busy?'Saving evidence…':task==='correction'?'Send updated evidence':c.submission?'Save a new revision':'Submit for review';

  return <div className="rr-grid rr-grid--customer">
    <div className="rr-stack">
      {submitted&&!showForm?<Card>
        <div className="rr-card__head rr-handoff-head">
          <div>
            <div className="rr-row" style={{gap:8}}><p className="rr-kicker">Customer step complete</p><Badge tone="info">Revision {c.revision} saved</Badge></div>
            <h2 id="claim-heading" tabIndex={-1} style={{marginTop:6}}>{c.revision>1?'Updated evidence submitted.':'Evidence submitted.'}</h2>
            <p className="rr-lede" style={{marginTop:8}}>{c.revision>1?'Next, review the new version as the merchant.':'Next, review it as the merchant.'}</p>
            {!next&&<p className="rr-muted" style={{marginTop:6}}>{c.status.reason}</p>}
          </div>
          {next&&<Button onClick={()=>run('role',{role:next.to})} disabled={busy}>{next.label}</Button>}
        </div>
        <div className="rr-divider"/>
        <HandoffSummary value={value}/>
        <h3 style={{marginTop:18}}>What you will review</h3>
        <SubmittedReview value={value}/>
        <div className="rr-actions" style={{marginTop:16}}>
          <Button variant="quiet" type="button" onClick={()=>setEditing(true)} disabled={busy}>Edit evidence</Button>
        </div>
      </Card>:<Card>
        <div className="rr-card__head">
          <div>
            <p className="rr-kicker">Customer · prepare claim</p>
            <h2 id="claim-heading" tabIndex={-1} style={{marginTop:6}}>{c.submission?'Edit your practice claim':'Submit your practice claim'}</h2>
          </div>
          <StatusBadge value={value}/>
        </div>
        <p className="rr-lede">{c.status.reason}</p>
        <div className="rr-stack" style={{marginTop:16}}>
          <SourceSummary value={value}/>
          <CorrectionRequest value={value} role="customer"/>
          {c.submission&&c.missing.length>0&&!c.locked&&<Callout tone="attention" title="Still needed"><ul style={{margin:0,paddingLeft:18}}>{c.missing.map(x=><li key={x}>{x}</li>)}</ul></Callout>}
        </div>
      </Card>}

      {showForm&&<Card>
        <form onSubmit={submit} className="rr-stack">
          <div className="rr-form-step">
            <h3><span className="rr-step-number">1</span> Add a label photo</h3>
            <p className="rr-muted">Required: a label photo showing the lot. Use a fictional label or upload one.</p>
            <div className="rr-actions">
              <Button variant="secondary" type="button" disabled={busy||reading} onClick={()=>useSample('a')}>Use fictional label A</Button>
              <Button variant="secondary" type="button" disabled={busy||reading} onClick={()=>useSample('b')}>Use fictional label B</Button>
            </div>
            <div className="rr-evidence">
              {photo?<img src={photo} alt="Photograph selected for this practice claim"/>
                :c.photo?<img src={c.photo} alt="Photograph already recorded on this practice claim"/>
                :<p className="rr-evidence__empty">No photograph on this revision yet. Choose a fictional label or upload a PNG or JPEG under 2 MB.</p>}
            </div>
            <p className="rr-muted" role="status">{reading?'Reading image…':fileName?`${fileName} ready to save`:c.submission?.hasPhoto?'A photo is recorded. Choosing another replaces it.':'PNG or JPEG, under 2 MB.'}</p>
            <Field label="Or upload your own image" hint="A practice upload is never checked for authenticity." htmlFor="practice-photo">
              <input id="practice-photo" className="rr-file" type="file" accept="image/png,image/jpeg" onChange={pickFile} disabled={busy||reading}/>
            </Field>
          </div>

          <div className="rr-form-step">
            <h3><span className="rr-step-number">2</span> Confirm your item</h3>
            <Field label="Lot code" hint="The notice requires LOT-A for this practice case." htmlFor="practice-lot">
              <input id="practice-lot" className="rr-input" value={lot} maxLength={40} disabled={busy} onChange={e=>setLot(e.target.value)} placeholder="For example, LOT-A"/>
            </Field>
            {confirmations.map(field=><label key={field.id} className="rr-check">
              <input type="checkbox" checked={extra[field.id]===true} disabled={busy} onChange={e=>setExtra(old=>({...old,[field.id]:e.target.checked}))}/>
              <span>{field.quote}<span className="rr-muted" style={{display:'block',marginTop:4}}>The merchant reviews your statement, not the action behind it.</span></span>
            </label>)}
            <label className="rr-check"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} disabled={busy}/>This item is from my fictional practice purchase.</label>
          </div>

          <div className="rr-form-step">
            <h3><span className="rr-step-number">3</span> Describe the defect</h3>
            {descriptions.map(field=><Field key={field.id} label={field.quote} htmlFor={`field-${field.id}`}>
              <textarea id={`field-${field.id}`} className="rr-textarea" rows={3} value={extra[field.id]||''} maxLength={500} disabled={busy} onChange={e=>setExtra(old=>({...old,[field.id]:e.target.value}))}/>
            </Field>)}
          </div>

          {c.correction?.state==='REQUESTED'&&<Field label="Your response to the merchant" hint="Describe what you changed or clarify the requested information." htmlFor="practice-response">
            <textarea id="practice-response" className="rr-textarea" rows={3} value={response} required minLength={3} maxLength={1000} disabled={busy} onChange={e=>setResponse(e.target.value)}/>
          </Field>}

          <ErrorText error={localError||error}/>
          {stale&&<Button variant="secondary" type="button" onClick={onRefresh}>Refresh practice case</Button>}
          <div className="rr-actions">
            <Button type="submit" disabled={busy||reading||!!localError||!canSubmit}>{submitLabel}</Button>
            <p className="rr-muted">{canSubmit?`Saving creates revision ${c.revision+1} and clears any earlier review.`:`Still needed: ${missing.join(', ')}.`}</p>
          </div>
        </form>
      </Card>}

      {next&&showForm&&<Callout tone={task==='correction'?'attention':'success'} title={next.title} actions={<Button onClick={()=>run('role',{role:next.to})} disabled={busy}>{next.label}</Button>}>
        <p>{next.body}</p>
      </Callout>}

      {c.submissionLimitReached&&!c.locked&&!c.refund&&<Callout tone="attention" title="This practice case reached its submission limit" actions={<Button onClick={()=>run('new',{})} disabled={busy}>Start a fresh practice case</Button>}>
        <p>This case has used all its evidence revisions. Start a fresh practice session to continue with a new case. No funds move.</p>
      </Callout>}
      {c.refund&&<Receipt value={value} run={run} busy={busy}/>}
      {c.unresolved&&<Callout tone="attention" title="Simulated refund not recorded"><p>A {money(c.unresolved.cents)} attempt is {c.unresolved.state.toLowerCase()} on this practice case. No funds moved. The merchant can resume a prepared attempt or start a new practice case.</p></Callout>}
      <ErrorText error={error}/>
      {stale&&<Button variant="secondary" onClick={onRefresh}>Refresh practice case</Button>}
      {expired&&<Callout tone="attention" title="This practice case expired" actions={<Button onClick={()=>run('new',{})} disabled={busy}>Start a fresh practice case</Button>}><p>Practice cases are kept for 24 hours in this session. A fresh case starts the journey again.</p></Callout>}
    </div>

    <aside className="rr-stack" aria-label="Claim context">
      <PracticeClaimCard value={value}/>
      <p className="rr-muted" style={{marginTop:2}}>Case {c.id} · attempt {value.attempt} · revision {c.revision}</p>
    </aside>
  </div>;
}
function RecordedEvidence({value}){
  const c=value.case;
  const defect=c.submission?.extra?.['practice-defect']||'Not provided';
  return <dl className="rr-recorded">
    <div><dt>Lot code</dt><dd>{c.submission?.lot||'Not recorded'}<small>Expected {value.scenario.lot}</small></dd></div>
    <div><dt>Linked purchase</dt><dd>{c.submission?.acknowledged?'Customer confirmed':'Not confirmed'}</dd></div>
    <div><dt>Customer description</dt><dd className="rr-recorded__text">{defect}</dd></div>
  </dl>;
}

function ReviewStage({value,run,busy,error,stale,onRefresh}){
  const c=value.case;
  const [acknowledged,setAcknowledged]=useState(false);
  const [message,setMessage]=useState('');
  const [replacePhoto,setReplacePhoto]=useState(true);
  const photoKey=reviewPhotoKey(value);
  const [photoState,setPhotoState]=useState(()=>({key:photoKey,status:c.photo?'loading':'missing'}));
  const [photoAttempt,setPhotoAttempt]=useState(0);
  useEffect(()=>{setAcknowledged(false);setMessage('');setReplacePhoto(true);setPhotoAttempt(0);},[photoKey]);
  const next=handoff(value);
  const binding={caseId:c.id,attempt:value.attempt,revision:c.revision};
  const photoStatus=photoState.key===photoKey?photoState.status:(c.photo?'loading':'missing');
  const photoLoaded=Boolean(c.photo)&&photoStatus==='loaded';
  const confirmable=canConfirmReview(value,acknowledged,photoLoaded);
  const requirements=value.scenario.requirements||[];
  const photoRequirement=requirements.find(f=>f.kind==='PHOTO');

  if(!c.submission&&!c.correction) return <div className="rr-grid rr-grid--review">
    <Card>
      <p className="rr-kicker">Merchant · review evidence</p>
      <h2 id="claim-heading" tabIndex={-1}>Nothing to review yet</h2>
      <p className="rr-lede" style={{marginTop:10}}>This claim is waiting for the customer’s evidence. The customer’s page is the next step, not a role you switch into.</p>
      <div className="rr-actions" style={{marginTop:16}}><Button onClick={()=>run('role',{role:'customer'})} disabled={busy}>Continue as customer</Button></div>
      <ErrorText error={error}/>
    </Card>
  </div>;

  return <div className="rr-grid rr-grid--review">
    <div className="rr-stack">
      <Card className="rr-review-card">
        <div className="rr-review-head">
          <div>
            <h2 id="claim-heading" tabIndex={-1}>Review this claim</h2>
            <p className="rr-muted" style={{marginTop:6}}>Relay Home cup · {c.id}</p>
          </div>
          <Badge tone="info">Revision {c.revision}</Badge>
        </div>
        <CorrectionRequest value={value} role="merchant"/>

        <div className="rr-pinned-requirement">
          <p className="rr-label">Requirement</p>
          <p>{photoRequirement?.quote||'Upload the required evidence for this claim.'}</p>
          <p className="rr-muted">Fictional scenario requirement</p>
        </div>

        <div className="rr-evidence-block">
          <div className="rr-evidence-block__head"><h3>Customer evidence</h3></div>
          <div className={`rr-evidence rr-evidence--review${photoStatus==='error'?' is-error':''}`} aria-busy={photoStatus==='loading'}>
            {c.photo&&photoStatus!=='error'?<img key={`${photoKey}:${photoAttempt}`} src={c.photo} alt="Customer-submitted product label for this practice claim" onLoad={()=>setPhotoState({key:photoKey,status:'loaded'})} onError={()=>setPhotoState({key:photoKey,status:'error'})}/>
              :!c.photo?<p className="rr-evidence__empty">No photograph is recorded on this revision. Review the recorded responses, or request what is missing.</p>:null}
            {photoStatus==='loading'&&<p className="rr-photo-status" role="status">Loading photograph…</p>}
            {photoStatus==='error'&&<div className="rr-photo-error" role="alert">
              <p>This photograph did not load.</p>
              <Button variant="secondary" type="button" onClick={()=>{setPhotoState({key:photoKey,status:'loading'});setPhotoAttempt(n=>n+1);}} disabled={busy}>Retry photograph</Button>
            </div>}
          </div>
          <p className="rr-muted" style={{marginTop:8}}>Product label photo</p>
        </div>

        <RecordedEvidence value={value}/>

        <div className="rr-mobile-money">
          <p className="rr-kicker">Refund summary</p>
          <h3>{refundFacts(value).affected} <span className="rr-money-unit">USD</span></h3>
          <Amounts value={value}/>
        </div>

        <div className="rr-review-decision">
          <div className="rr-review-decision__head"><h3>Confirm the evidence review</h3>{reviewedCurrent(value)&&<Badge tone="success">Reviewed · revision {c.revision}</Badge>}</div>
          <label className="rr-check">
            <input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)} disabled={busy||!photoLoaded||c.missing.length>0||c.correction?.state==='REQUESTED'}/>
            <span>I reviewed the photo and requirements for revision {c.revision}.</span>
          </label>
          {photoStatus==='loading'&&<p className="rr-muted">Review is unavailable until the current photograph loads.</p>}
          {photoStatus==='error'&&<p className="rr-muted">Review is unavailable until the photograph is retried or replaced.</p>}
          {c.missing.length>0&&<p className="rr-muted">Review is unavailable until the missing information is recorded.</p>}
          {c.correction?.state==='REQUESTED'&&<p className="rr-muted">This revision cannot be reviewed while a correction request is open.</p>}
          <div className="rr-actions">
            <Button disabled={!confirmable||busy} onClick={()=>run('review',{...binding,confirmed:true})}>{busy?'Saving review…':'Confirm evidence review'}</Button>
            <Button variant="secondary" type="button" disabled={busy} onClick={()=>{const d=document.getElementById('correction-details');if(d){d.open=true;d.scrollIntoView({block:'center'});d.querySelector('textarea')?.focus();}}}>Request correction</Button>
          </div>
        </div>

        <details className="rr-source-details" id="review-source-details">
          <summary>Source details and guidance</summary>
          <SourceSummary value={value}/>
          <Requirements value={value}/>
        </details>
      </Card>

      {!c.locked&&c.submission&&c.correction?.state!=='REQUESTED'&&<Card quiet>
        <details id="correction-details">
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
      <Card quiet className="rr-desktop-money">
        <p className="rr-kicker">Refund summary</p>
        <h2 style={{marginTop:6,marginBottom:10}}>{refundFacts(value).affected} <span className="rr-money-unit">USD</span></h2>
        <Amounts value={value}/>
      </Card>
      <Card quiet>
        <p className="rr-kicker">Claim</p>
        <dl className="rr-amounts" style={{marginTop:8}}>
          <div><dt>Case</dt><dd style={{fontFamily:'inherit',fontSize:13,fontWeight:500,wordBreak:'break-all'}}>{c.id}</dd></div>
          <div><dt>Revision</dt><dd>{c.revision}</dd></div>
          <div><dt>Review</dt><dd style={{fontFamily:'inherit',fontWeight:500}}>{reviewedCurrent(value)?`Recorded · revision ${c.review.revision}`:'Not recorded'}</dd></div>
        </dl>
      </Card>
    </aside>
  </div>;
}

function ApproveStage({value,run,busy,error,stale,onRefresh,onReturnToReview}){
  const c=value.case;
  const [confirmOpen,setConfirmOpen]=useState(false);
  const [approving,setApproving]=useState(false);
  const approvingRef=useRef(false);
  const facts=refundFacts(value);
  const approvable=canApprove(value);
  useEffect(()=>{setConfirmOpen(false);setApproving(false);approvingRef.current=false;},[c.id,c.revision,c.locked]);
  async function confirmRefund(){
    if(approvingRef.current) return;
    approvingRef.current=true;
    setApproving(true);
    setConfirmOpen(false);
    try{await run('approve',{caseId:c.id,attempt:value.attempt,revision:c.revision,confirmed:true,digest:c.plan.digest});}
    finally{approvingRef.current=false;setApproving(false);}
  }
  if(c.refund) return <div className="rr-grid rr-grid--review">
    <div className="rr-stack">
      <Card>
        <p className="rr-kicker">Merchant · approve refund</p>
        <h2 id="claim-heading" tabIndex={-1}>Simulated refund recorded</h2>
        <p className="rr-lede" style={{marginTop:10}}>The practice journey is complete. No provider was contacted and no funds moved.</p>
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
          <div><h2 id="claim-heading" tabIndex={-1}>Approve the refund</h2><p className="rr-lede" style={{marginTop:8}}>Evidence review is recorded for revision {c.review?.revision??c.revision}. The remaining decision is the refund, with its amount and exclusions in view.</p></div>
          <Badge tone="success">Evidence reviewed</Badge>
        </div>
        <div className="rr-stack" style={{marginTop:8}}>
          <Callout tone="info" title="What this records">
            <p>A <strong>{facts.affected}</strong> simulated refund. The {facts.excluded} tray stays excluded.</p>
          </Callout>
          <div className="rr-actions">
            {onReturnToReview&&<Button variant="secondary" type="button" onClick={onReturnToReview} disabled={busy}>Back to evidence review</Button>}
            <AlertDialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialog.Trigger render={<Button disabled={!approvable||busy}/>}>{approveLabel(value)}</AlertDialog.Trigger>
              <AlertDialog.Portal>
                <AlertDialog.Backdrop className="rr-dialog-backdrop"/>
                <AlertDialog.Popup className="rr-dialog">
                  <AlertDialog.Title render={<h2/>}>Approve {facts.affected} simulated refund?</AlertDialog.Title>
                  <AlertDialog.Description render={<p/>}>This records a simulated refund against {c.id}. No payment provider is contacted and no funds move. The {facts.excluded} tray is excluded, and the destination is the simulated original payment.</AlertDialog.Description>
                  <Amounts value={value}/>
                  <div className="rr-actions">
                    <AlertDialog.Close render={<Button variant="secondary"/>}>Cancel</AlertDialog.Close>
                    <Button disabled={busy||approving} onClick={confirmRefund}>{approveActionLabel(value)}</Button>
                  </div>
                </AlertDialog.Popup>
              </AlertDialog.Portal>
            </AlertDialog.Root>
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
    <h2 style={{marginTop:8}}>{facts.completedAmount} simulated refund</h2>
    <p style={{marginTop:8,color:'#0B5B3A',fontSize:15}}>Practice case only. No provider was contacted; the {facts.excluded} tray was not refunded.</p>
    <dl className="rr-amounts" style={{marginTop:14}}>
      <div><dt style={{color:'#0B5B3A'}}>Status</dt><dd>Simulated · completed</dd></div>
      {facts.reference&&<div><dt style={{color:'#0B5B3A'}}>Practice reference</dt><dd style={{fontSize:12,wordBreak:'break-all'}}>{facts.reference}</dd></div>}
      <div><dt style={{color:'#0B5B3A'}}>Destination</dt><dd style={{fontFamily:'inherit',fontWeight:500,fontSize:14}}>{facts.destination}</dd></div>
    </dl>
  </section>;
}

export {ApproveStage,ReviewStage};

export default function Practice(){
  const [state,setState]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[stale,setStale]=useState(false),[expired,setExpired]=useState(false),[returnToReview,setReturnToReview]=useState(false);
  const heading=useRef(null);
  async function refresh(){setError('');setStale(false);setExpired(false);try{setState(await api('practice/state'));}catch(e){setError(e.message);setExpired(Boolean(e.expired));}}
  useEffect(()=>{let active=true;api('practice/state').then(v=>active&&setState(v)).catch(e=>active&&(setError(e.message),setExpired(Boolean(e.expired))));return()=>{active=false;};},[]);
  async function run(action,data){setReturnToReview(false);setBusy(true);setError('');setStale(false);setExpired(false);try{setState(await api(`practice/${action}`,data));}catch(e){setError(e.message);setStale(Boolean(e.stale));setExpired(Boolean(e.expired));}finally{setBusy(false);}}
  useEffect(()=>{setReturnToReview(false);},[state?.case.id,state?.attempt]);
  // A handoff changes who is acting, so the heading is the new reading position.
  const baseStage=state?stage(state):1;
  // The recorded review is kept while the merchant looks back. This local view
  // never reopens a completed, locked or reserved case.
  const canReturn=Boolean(state&&baseStage===3&&canReturnToReview(state));
  const current=state&&returnToReview&&canReturn?2:baseStage;
  const progress=state?(current===2&&baseStage===3?2:progressStage(state)):1;
  useEffect(()=>{if(!state)return;const target=document.getElementById('claim-heading')||heading.current;target?.focus?.();},[state?.role,current,progress,state?.case.id,Boolean(state?.case.refund)]);
  return <div className="rr-app">
    <AppShell note="Simulated. No funds move.">
      <div ref={heading} tabIndex={-1} style={{outline:'none'}}>
        <StageTrack current={progress} complete={Boolean(state?.case?.refund)}/>
        {current===1&&<div className="rr-page-head">
          <h1 style={{marginTop:18}}>See a recall claim through.</h1>
          <p className="rr-lede" style={{marginTop:8}}>One fictional claim, from customer evidence to merchant approval.</p>
          <p className="rr-muted" style={{marginTop:8}}><a href="/practice/reconciliation">Find affected purchases first</a></p>
        </div>}
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
          :<ApproveStage value={state} run={run} busy={busy} error={error} stale={stale} onRefresh={refresh} onReturnToReview={canReturn?()=>setReturnToReview(true):undefined}/>}
      </div>}
    </AppShell>
  </div>;
}
