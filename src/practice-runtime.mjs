import {PracticeWorkspace} from './practice-workspace.mjs';
import {practiceRoutes} from './practice-http.mjs';
import {PRACTICE_COOKIE,PRACTICE_MAX_BYTES} from './cloud-practice-routing.mjs';

// Host-agnostic handler for one practice object. A Durable Object, a local
// server and a test all drive the same routes and the same shared core.
export class PracticeRuntime {
  constructor({journal,provider,origin='http://127.0.0.1:4318',now}={}) {
    this.origin=origin;
    this.practice=new PracticeWorkspace({journal,provider,origin,now});
  }

  async handle(input) {
    let status=200,value={};
    const headers={};
    const res={setHeader(name,val){headers[name]=val;}};
    const req={method:input.method,headers:{
      origin:input.origin,
      'content-type':input.contentType||'application/json',
      cookie:`${PRACTICE_COOKIE}=${input.token}`,
    }};
    const route=practiceRoutes(this.practice,{
      json:(_res,code,data)=>{status=code;value=data;},
      body:async()=>input.body||{},
      origin:input.origin,
      freshToken:input.fresh?input.token:undefined,
    });
    await route(req,res,input.path);
    return {status,value,setCookie:headers['Set-Cookie']||null};
  }

  // Abandoned practice data is removed, not archived.
  expire() {
    const db=this.practice.desk.db;
    db.prepare('DELETE FROM refund_hints').run();
    db.prepare('DELETE FROM refunds').run();
    db.prepare('DELETE FROM claims').run();
    db.prepare('DELETE FROM practice_sessions').run();
  }
}

export {PRACTICE_MAX_BYTES};
