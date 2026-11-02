import {DurableObject} from 'cloudflare:workers';
import {RefundJournalCore} from '../src/journal-core.mjs';
import {cloudSql} from '../src/cloud-sql.mjs';
import {SimulatedRefundProvider} from '../src/practice-provider.mjs';
import {PracticeRuntime} from '../src/practice-runtime.mjs';
import {PRACTICE_TTL_MS} from '../src/cloud-practice-routing.mjs';

// One Durable Object per practice session, backed by the object's own SQLite
// storage. It receives the shared RefundJournalCore and the local simulated
// provider only: no payment credentials, transport or connected workspace.
export class PracticeCase extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.runtime = new PracticeRuntime({
      journal: new RefundJournalCore(cloudSql(ctx.storage)),
      provider: () => new SimulatedRefundProvider(),
    });
  }

  async handle(input) {
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + PRACTICE_TTL_MS);
    return this.runtime.handle(input);
  }

  // An abandoned practice object is deleted, including its photos and journal.
  async alarm() {
    this.runtime.expire();
    await this.ctx.storage.deleteAll();
  }
}
