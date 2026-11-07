# Retained history and recovery

Connected workspaces retain claim snapshots, evidence photographs, merchant review and correction events, source setup revisions, refund approval, dispatch boundaries and authenticated provider observations. History begins with this release; earlier revisions cannot be reconstructed. Actor labels identify a workspace merchant, customer capability or system action, not a verified individual. This is application history, not a tamper-proof ledger.

Open **History and refund recovery** in a connected claim to inspect older evidence or export metadata. Historical photographs are read-only and cannot satisfy review of the current evidence revision. The export omits the bearer claim secret and photograph bytes. Connected claims retain up to twelve submitted evidence revisions; after that, manual support is required and retained evidence is preserved. Simulated practice does not retain this history across a restart or expiry.

A refund whose response was lost remains reserved. New dispatches record an `invoice_id` correlation tied to the original durable request. A merchant can supply a recovered PayPal refund reference and a reason. The server performs authenticated readback and verifies the original capture, exact amount, currency and correlation before recording settlement. A known reference already saved at dispatch can also be checked. A reference with a matching amount alone is insufficient. Legacy attempts without correlation remain manual.

For failed, cancelled or otherwise unresolved payments, a merchant can record escalation to provider support or a manual remedy disposition. This records responsibility without marking money returned, releasing the reservation or authorizing a resend. There is no automatic second refund, even after a provider reports failure. This conservative boundary avoids asserting provider-wide exactly-once execution.

# Source versions and external instructions

Importing an unchanged notice reopens its existing setup and preserves review. A changed notice creates a separate setup with added and removed sentences. Existing claims keep their frozen campaign. **Check source for updates** performs an explicit fetch; this is not continuous monitoring. Older setups are paginated, and the active publication remains visible.

A notice referring to external instructions blocks publication until the merchant attaches a reviewed public-text excerpt with its HTTPS URL. No URL is fetched by that attachment operation. The excerpt is explicitly merchant supplied, never described as independently verified. All attached obligations go through the same field and source review. Unsupported conditions, post-refund actions and multiple-photo workflows stay manual. Replacing an excerpt clears review and retains the earlier source snapshot in history.

Source policy version 3 requires previously imported notices to be reviewed and republished before new connected purchases. Existing completed receipts and already-dispatched refund readback remain available. Old unexecuted claims with an earlier sourced policy remain manual.

Source policy version 4 additionally sends detected `provided you` purchase
conditions to manual handling, including conditions in sentences that ask for no
form response. An INFORMATION decision cannot waive a detected condition.
Offsite actions to obtain a claim number, register or complete a web prerequisite
also require a reviewed external excerpt even when the sentence does not use the
word “instructions.” Nested references remain unresolved. Publication coverage
and advisory timing share the same bounded condition cues. These are conservative
language checks, not proof that every condition or external dependency is found.
Earlier sourced publications need fresh review and republication before new
execution; completed receipts and already-attempted payment reconciliation retain
their existing behavior.

Source policy version 5 also keeps detected physical-return, manufacturer-contact,
registration and email-submission handoffs manual, even when a sentence has no
supported form field and is labelled Information. The portal does not perform
those actions. This is a bounded lexical safeguard, not complete instruction
interpretation; the merchant must review the full notice. Older unexecuted source
campaigns require republication. Completed receipts and recovery/readback of
already-attempted refunds retain their existing behavior.
