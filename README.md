# Recall Relay

Turn a reviewed recall notice into a customer claim form, collect its required
evidence, and resolve an eligible refund to the original PayPal payment.
The customer returns to the same private page for a confirmed receipt.

This build uses fictional merchandise and **PayPal Sandbox**. Public CPSC
notices supply scenarios; importing one does not create a manufacturer
relationship or register a real recall claim.

## Browser hosting

The Cloudflare build runs AI on the server and works in a normal browser;
visitors do not need a Mac or a local model. Deployment configuration is in
`cloud/`. The intended public hostname is `recall-relay.dolepee.com`.

Each browser receives an isolated sandbox merchant workspace in an HttpOnly
cookie. Keep that browser session: clearing its cookie loses access to its desk.
A private customer link grants access to one claim, not to merchant actions.
This is a sandbox evaluation service, not production merchant onboarding.
Use disposable test images and fictional responses only.

For your own Cloudflare account, first verify its plan and current quotas.
The supplied application caps new workspaces at 200/day, AI calls at 80/day
globally and 20/day per workspace, and purchases at six per workspace. These
caps do not replace the provider's account-wide limits or billing settings.
The backend uses SQLite Durable Objects and Workers AI; the Pages frontend
reaches it through a service binding. Its public Worker hostname is disabled.

```sh
npm ci
npm test
npm run test:cloud
npm run build:cloud
npx wrangler deploy --config cloud/wrangler.jsonc
npx wrangler secret put PAYPAL_SANDBOX_CLIENT_ID --config cloud/wrangler.jsonc
npx wrangler secret put PAYPAL_SANDBOX_CLIENT_SECRET --config cloud/wrangler.jsonc
npx wrangler pages project create recall-relay --production-branch main --force
npx wrangler pages deploy --branch main
```

Use your own Sandbox application credentials at the secure prompts. Adjust
resource names and `PUBLIC_ORIGINS` for your deployment before publishing.
Associate your custom domain in Pages before adding its external DNS CNAME.
`test:cloud` exercises real workerd and SQLite persistence with an intercepted
fake PayPal transport; it does not contact PayPal or prove a hosted payment.
The hosted model is Qwen3-30B through Cloudflare Workers AI. Only the public
notice and the case-view question are sent to inference, not customer photos
or payment credentials. Suggestions still require source and merchant review.

## Install and run locally

The complete local AI version currently targets **Apple Silicon Macs**.
It requires Node 22.13 or newer, npm, Python 3.11 or newer, and network access
for the initial dependencies and roughly 2.3 GB model download. The application
remains bound to this computer's loopback interface.

```sh
npm ci
python3 scripts/setup-ai.py
cp .env.example .env
```

In `.env`, set the client ID and secret for **your own PayPal Sandbox app**.
Create/use a separate Sandbox personal buyer account for checkout. Obtain
these from [PayPal Developer](https://developer.paypal.com/dashboard/).
Sandbox buyer credentials differ from your real PayPal login. No real card
details or live credentials are needed. Keep credentials out of source control.

```sh
npm test
npm run build
npm run doctor
npm start
```

Open the private merchant launch URL written to `.local/merchant-url.txt`.
It establishes the local merchant session. Keep that URL private: it grants
merchant access. The default origin is `http://127.0.0.1:4318`; an optional
`RECALL_RELAY_PORT` in `.env` selects another local port. Use the launch URL's
exact origin throughout the journey.

`npm start` serves the built interface and API without a Vite development
server. For development, use `npm run dev` instead. Never run both on the same
port. Stop the server with Ctrl+C. Local databases remain in `.local`; restarting
preserves cases and payment reservations. A fresh extracted source directory
starts with independent data. No reset command deletes existing cases.

The setup script pins the model revision and checks every required model file
against recorded SHA-256 values. Its manifest was checked against upstream Git
blob/LFS hashes. Interrupted downloads can resume when the server supports
byte ranges. Rerun the setup command to finish. `npm run ai:verify` checks files
without installing or downloading anything. `npm run doctor` checks readiness
without printing credentials or making a payment. If the MLX import fails,
check installation and macOS GPU access; an agent sandbox may block Metal.

Without AI, manual source-field selection and ordinary case controls remain
available. That partial mode does not demonstrate the full AI integration.
The local server does not fall back to hosted inference.

## Use the app

1. From the merchant desk, open **Prepare claim instructions**. Import a CPSC
   number such as `27-026`, inspect the complete notice, and review its remedy.
2. Draft source-linked fields with AI or add an exact source
   sentence manually. Correct omissions and conditions before saving the
   reviewed instructions. AI suggestions are not authoritative.
3. Preview and publish a **sandbox scenario** with an explicit test SKU and lot.
   Only the supported original-payment remedy can use this settlement path.
4. In the desk, create a Sandbox purchase: a $25.99 scenario item plus an
   unaffected $34 item. Approve the $59.99 purchase as the Sandbox buyer, then
   use **Verify approved purchase** for that same order. Do not create another
   order merely because approval or capture is pending.
5. Open the private customer link. Submit a disposable PNG/JPEG image under
   2 MB, the test lot, purchase confirmation and the required scenario responses.
   Missing information can be saved and completed later.
6. Return to the merchant desk, refresh, inspect all submitted evidence, and
   confirm the review. Approve the exact **$25.99** item refund in its dialog.
7. Refresh the customer's page. A receipt appears only after authenticated
   PayPal readback verifies refund status, amount, currency and original capture.

The desktop merchant workspace uses AG Studio's Agent Framework, a custom
runner, case-review widget and view-only tool. Ask which customers owe
information or which claims are ready for review. The model selects a closed
view; counts and explanations come from stored states. It has no payment,
evidence-review or record-edit tool. Mobile uses the ordinary case controls.

## Correctness and scope

- A source quote check rejects invented wording; it cannot establish that the
  model found every requirement. One observed source draft omitted an
  attestation, which was added manually before publication.
- Publishing changes future purchases only. Pending purchases and existing
  claims retain their original campaign. This version supports one required
  photograph plus text/confirmation fields, USD and one refundable line.
- A changed submission invalidates the earlier review. Approval binds to the
  current plan. A durable SQLite reservation blocks duplicate/concurrent
  dispatch for that claim. Ambiguous provider responses stay unresolved.
- If a refund reference survives, **Check PayPal status** reconciles it without
  sending another refund. A lost response without a reference requires manual
  reconciliation. Do not retry through a new case. This does not claim
  provider-wide exactly-once delivery.
- The adapter has a fixed Sandbox origin. Unsupported, changed or conservatively
  older-than-180-day purchases remain manual. Image validation does not prove
  authenticity, ownership, safety or disposal. Human evidence review remains.
- Local merchant launch links and hosted browser sessions use different
  authentication boundaries. Neither is production multi-merchant onboarding.

The connected local interface completed a fresh Sandbox purchase, capture,
source-specific evidence review, partial refund and matching customer/merchant
receipt on 22 October 2026. Transaction confirmations were performed by the
operator. Automated tests use injected provider doubles; they are distinct
from that real Sandbox run. There is no independent adoption or measured
time-saving claim. `/training` retains a separate fictional non-settling workspace.

## Components and licenses

Original application code is under [MIT](LICENSE). Dependencies retain their
own licenses. In particular, AG Studio is separately licensed: its evaluation
watermark remains, and hackathon judging guidance does not confer commercial
deployment rights. Model weights are downloaded, not bundled; the model card
identifies Apache-2.0 terms. See the pinned
[MLX model](https://huggingface.co/mlx-community/Qwen3-4B-Instruct-2507-4bit/tree/50d427756c6b1b2fe0c0a10f67fbda1fc8e82c1b)
and [Qwen model license](https://huggingface.co/Qwen/Qwen3-4B-Instruct-2507/blob/main/LICENSE).

Useful implementation references:
[PayPal refunds](https://developer.paypal.com/docs/api/payments/v2/#captures_refund),
[AG Studio Agent Framework](https://www.ag-grid.com/studio/react/ai-agents/),
[CPSC recall data](https://www.cpsc.gov/Recalls).
