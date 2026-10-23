// Minimal synchronous interface shared by the Node SQLite and DO implementations.
export function cloudSql(storage){
  return {
    exec:query=>storage.sql.exec(query),
    prepare(query){return {
      get:(...args)=>storage.sql.exec(query,...args).toArray()[0],
      all:(...args)=>storage.sql.exec(query,...args).toArray(),
      run:(...args)=>{const cursor=storage.sql.exec(query,...args);return {changes:cursor.rowsWritten};},
    };},
    transactionSync:callback=>storage.transactionSync(callback),
    close(){},
  };
}
