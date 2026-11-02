// Test-only stub for the workerd module. Tests import the real Worker
// entrypoint and drive its fetch handler; Durable Object classes are declared
// but never instantiated by these boundary tests.
export class DurableObject {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
}
