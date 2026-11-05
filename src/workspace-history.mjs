import {createHash} from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
export class WorkspaceHistory {
 constructor(db,{now=()=>new Date().toISOString()}={}){this.db=db;this.now=now;db.exec(`CREATE TABLE IF NOT EXISTS workspace_events (seq INTEGER PRIMARY KEY AUTOINCREMENT, entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, event_kind TEXT NOT NULL, at TEXT NOT NULL, actor TEXT NOT NULL, snapshot TEXT NOT NULL, photo_hash TEXT); CREATE INDEX IF NOT EXISTS workspace_event_entity ON workspace_events(entity_kind,entity_id,seq); CREATE TABLE IF NOT EXISTS history_photos (hash TEXT PRIMARY KEY, photo TEXT NOT NULL);`);}
 append(entityKind,id,kind,value,actor='authenticated-workspace-merchant'){
  const {access,...snapshot}=value;let photoHash=null;
  if(snapshot.submission){snapshot.submission={...snapshot.submission};const photo=snapshot.submission.photo;delete snapshot.submission.photo;if(photo){photoHash=hash(photo);this.db.prepare('INSERT INTO history_photos VALUES (?,?) ON CONFLICT(hash) DO NOTHING').run(photoHash,photo);}snapshot.submission.photoHash=photoHash;}
  this.db.prepare('INSERT INTO workspace_events(entity_kind,entity_id,event_kind,at,actor,snapshot,photo_hash) VALUES (?,?,?,?,?,?,?)').run(entityKind,id,kind,this.now(),actor,JSON.stringify(snapshot),photoHash);
 }
 list(entityKind,id){return this.db.prepare('SELECT seq,event_kind,at,actor,snapshot,photo_hash FROM workspace_events WHERE entity_kind=? AND entity_id=? ORDER BY seq').all(entityKind,id).map(r=>({sequence:r.seq,event:r.event_kind,at:r.at,actor:r.actor,snapshot:JSON.parse(r.snapshot),photoHash:r.photo_hash,photoAvailable:!!r.photo_hash}));}
 photo(entityKind,id,sequence){const r=this.db.prepare('SELECT photo_hash FROM workspace_events WHERE entity_kind=? AND entity_id=? AND seq=?').get(entityKind,id,sequence);if(!r?.photo_hash)throw new Error('This history event has no retained photograph.');const p=this.db.prepare('SELECT photo FROM history_photos WHERE hash=?').get(r.photo_hash);if(!p)throw new Error('The retained photograph is unavailable.');return p.photo;}
}
