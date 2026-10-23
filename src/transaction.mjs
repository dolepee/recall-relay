// Both runtimes use a real synchronous transaction; no external I/O belongs here.
export function syncTransaction(db,callback){
  if(typeof db.transactionSync==='function')return db.transactionSync(callback);
  db.exec('BEGIN IMMEDIATE');
  try{const value=callback();db.exec('COMMIT');return value;}
  catch(error){db.exec('ROLLBACK');throw error;}
}
