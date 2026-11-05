// All work is synchronous. Nested domain mutations share the outer atomic unit;
// an exception must propagate to roll it back. External I/O never belongs here.
const active=new WeakSet();
export function syncTransaction(db,callback){
 if(active.has(db))return callback();
 active.add(db);
 try{
  if(typeof db.transactionSync==='function')return db.transactionSync(callback);
  db.exec('BEGIN IMMEDIATE');
  try{const value=callback();db.exec('COMMIT');return value;}
  catch(error){db.exec('ROLLBACK');throw error;}
 }finally{active.delete(db);}
}
