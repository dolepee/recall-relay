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
    this.env = env;
    const ttl = Number(env.PRACTICE_TTL_MS);
    this.ttlMs = Number.isFinite(ttl) && ttl > 0 ? ttl : PRACTICE_TTL_MS;
    this.runtime = this.buildRuntime();
  }

  buildRuntime() {
    return new PracticeRuntime({
      journal: new RefundJournalCore(cloudSql(this.ctx.storage)),
      provider: () => new SimulatedRefundProvider(),
      ttlMs: this.ttlMs,
    });
  }

  async handle(input) {
    const alarm = await this.ctx.storage.getAlarm();
    if (!alarm) await this.ctx.storage.setAlarm(Date.now() + this.ttlMs);
    return this.runtime.handle(input);
  }

  // Deleting an abandoned object removes its SQLite schema as well as its data,
  // so the cached runtime is rebuilt before the next request. That request then
  // finds no session and answers 410 with a fresh-start path, not a table error.
  async alarm() {
    await this.ctx.storage.deleteAll();
    this.runtime = this.buildRuntime();
  }
}
