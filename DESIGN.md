---
version: alpha
name: Recall Relay
description: A merchant workbench for reviewing affected purchases and resolving refunds, with a public landing document at the site root.
---

## Overview

Help a merchant move from a sourced product notice to reviewed customer cases and a confirmed refund to the original payment. The connected sandbox surface uses fictional merchandise and real sandbox payments; the separate training surface uses invented payment IDs. Show that limitation beside the work, and never describe a prepared refund as money returned.

There are two surfaces in one deployment. The public landing document at `/` introduces the job and the claim workflow to a merchant who has not used the product. The workbench and the private customer claim keep `/desk`, `/setup` and `/claim`, and the training workspace keeps `/training`. Routing differs by environment on purpose: the Vite development server answers every path with the app document, the built local server answers `/` with the landing document and the four app paths with the app document, and Cloudflare Pages answers `/` with the landing document, `/desk`, `/setup` and `/claim` with the app document, and 404 for everything else. The training workspace is local-only and must stay unavailable on Pages. The landing page is a static document; every action on it either scrolls within the page or navigates to the workbench. It never simulates a refund, a form submission or a payment.

## Colors and migration authority

All public product routes now use one governed system: white surfaces, cool-grey canvas, deep navy text, cobalt actions, green confirmed success and amber attention. Brown/cream and the former teal customer identity are superseded. Shared shell and controls preserve the existing API and authorization boundaries. `ui/system.css` defines the common tokens; the merchant compatibility mappings in `ui/style.css` and the actual Studio theme use the same values. Portaled dialogs carry the same tokens independently.

The private customer page has no merchant navigation. It renders exact published requirements, a separate purchase confirmation, current revision and source access. The merchant sees the exact photo requirement before the current photo, recorded responses and a separate explicit refund confirmation. Source setup retains import, review and publication as distinct steps. Sample screens stay read-only and fictional.

Allocation summaries expose only immutable amounts captured during provider verification. Original purchase, affected allocation and excluded amount are not inferred from remaining balance, practice constants or customer input. Older claims without an authoritative original amount show that the breakdown is unavailable. The existing refundable amount and provider-confirmed receipt remain authoritative.

## Guided claim surface (governing system)

This system governs every product surface, including connected claims, source setup, private customer forms, read-only samples and portaled dialogs.

- Surfaces: white `#FFFFFF` cards on a cool-grey `#F5F7FA` canvas.
- Text: deep ink `#142337`, secondary `#596779`.
- Action: cobalt `#315CF5` for the one primary action, selected stage and focus ring. Hover `#2549C9`.
- Borders: `#DEE5EE`, with `#C3CEDC` for field outlines.
- Semantic colour is never the only signal: green means a confirmed success, amber an attention state, red a refusal. Each state also carries words.
- Type: Inter with the system-sans fallback; 16px body, 14px supporting text, labels at 12px or larger in sentence case. Figures and references are tabular monospace.
- Controls: standard buttons are 48px high with an 8px radius; fields are 48px high with an 8px radius; surfaces are 12px. Minimum touch target is 44px.
- No animation, decorative charts, gradients or marketing hero inside a task surface.

The token and component layer lives in `ui/system.css` (`--rr-*` values, `.rr-card`, `.rr-btn`, `.rr-field`, `.rr-badge`, `.rr-callout`, `.rr-stage`) and `ui/system.jsx`. It is scoped to `.rr-app`; the confirmation dialog is portaled, so it carries its own copy of the same values and must be checked in rendered evidence, not assumed.

### Guided claim stages

One claim runs as three conceptual stages: Prepare claim / Review evidence / Approve refund. Three stages are not three clicks and not a tab control; the track reports where the recorded state is. The customer prepares evidence, then hands off with an explicit next action ("Evidence submitted. Next, review it as the merchant."). The merchant reviews, and either confirms the evidence or requests a correction. A correction returns the claim to the customer; the response creates a new revision and clears the prior review. Only a review recorded for the current revision exposes the refund stage. Practice looks and navigates like the same product, with a persistent simulated-mode label and a contextual role handoff instead of a role toggle.

The merchant review screen is the central reference. The selected claim is the main object with a compact identity and revision; the exact photo requirement sits directly above the large evidence image; the submitted lot, linked-purchase confirmation and description are concise rows below it; the review acknowledgement and action sit together next to that evidence; and the full source and provenance live in an accessible disclosure. The refund consequences stay visible beside the evidence on desktop and move above the review decision on small screens. On the customer handoff, a compact cup/affected/excluded summary precedes the longer review recap on small screens.

### State and copy contract

- Evidence review acknowledgement starts unchecked. Confirm evidence review enables only after that acknowledgement, the required responses, the server readiness checks, and the current case/revision photograph has loaded. A loading or failed photograph shows an inline failure with Retry photograph and keeps review disabled; readiness resets when the case, revision or image changes.
- A refund is available only after a review is recorded for the current revision. The opener is Review refund; the dialog names the exact amount and destination, and the final action is Approve [amount] simulated refund. Cancel is the secondary action. Keyboard focus starts inside the dialog, Escape closes it, focus returns to the opener, and a rapid double activation submits once.
- Keep each campaign's actual required fields and confirmations, including the linked-purchase confirmation and any lot or source requirement. Show the linked-purchase confirmation as its own recorded row, never inferred from a matching lot, and show the submitted lot beside the expected lot. An illustrative field in a mockup is not a universal requirement.
- Affected amount, excluded items and the original payment destination stay visible at approval, inside the confirmation dialog as well as beside it.
- Distinguish evidence submitted, provider pending, provider-confirmed test refund and simulated completion. The simulated receipt says "Simulated refund. No funds moved." and never claims money moved or a provider was contacted.
- A correction response creates a new revision and clears prior review. Do not promise retained previous submissions or evidence history: the core replaces the submission. Revision tracking and a fresh review are what the product actually records.
- No new approval authority, authentication identity, payment tool or automatic buyer discovery comes from a visual change.

## Layout

For a returning merchant, start with a compact active-campaign identity and the claim queue. Keep the full notice and purchase connection available through progressive disclosure, rather than placing their complete text before the current work. First use has one primary route into notice preparation. Keep suggested product matches, affected cases, and the selected case within one workbench. On small screens, stack the notice, case list, and selected case in that order. The case detail names the exact order, evidence requirement, amount, and original payment before approval. AG Studio supports the case workspace; its configuration controls must not replace the merchant task.

## Marketing surface (`/`)

The homepage at `/` is one static HTML document with its own inline styles and local assets: no framework, no CDN, no external font request, no remote image request and no build step beyond being copied into `dist`. It must keep working with JavaScript disabled; the only script closes the mobile menu after a destination is chosen. It uses the governed white/cool-grey tokens and wordmark, 64px desktop / 38px mobile headline, 16px body, 14px labels and metadata never below 12px. The header is 72px on desktop, the hero is a split copy/allocation layout, and the illustrative allocation has no fake approval controls. The three stages, decision ingredients, practice/Sandbox FAQ and final CTA carry the exact copy in the handoff. All homepage links are real routes or the `#relay` instructions anchor; the desktop and mobile navigation must agree.

The reading order is the visual order at every width: header, hero copy, illustrative allocation, `#relay` instructions with the three stages and decision ingredients, the practice/Sandbox FAQ, the closing action and the footer. Nothing is reordered by CSS `order`, so keyboard and screen-reader order match the screen. The page has no nested scrolling, and no element exceeds the viewport at 1440, 390 or 320. The anchor target carries a scroll margin so the sticky header does not cover the instructions heading after a navigation click.

The hero is a split copy/allocation layout above 959px. Below that it is one column: copy and primary action, then the allocation card, then instructions. At 320px the item rows wrap the amount under the product name rather than shrinking it. The header is a native `details` menu below 959px with 44px rows; the desktop and mobile menus expose the same three destinations in the same order, and the brand returns to `/`.

Every control is at least 44px tall and keeps a visible cobalt focus ring on the light surface. Internal destinations are same-origin routes (`/practice`, `/desk`, `/sample`) or the `#relay` anchor; none is an absolute production origin, a new tab or a placeholder `#`. The page makes no request beyond its own document and local assets.

Honest scope labels are part of the surface and must survive design changes: `Evaluation` in the header, `Illustrative example` and `Fictional example.` on the allocation, `Simulated. No funds move.` beside the primary action, and `Evaluation build. Fictional merchandise. PayPal Sandbox.` in the footer. The fabricated cup and tray images are labelled as illustrations, not photographs or evidence. Nothing on the page claims customers, savings, certifications or provider relationships, and the allocation has no form, button or input.

Two copy rules follow from what the product actually records. First, the page must never promise a record of who approved a refund, a named approval or attribution to an individual; the journal stores the generic actor `local-merchant`. Second, the illustration explains allocation, not eligibility or proof of payment, and must not suggest that the illustrated claim is waiting in the desk or that the reader can follow that exact claim. The page is static and may not invent a refund, submit a form, call a provider or display an authorization control.

## Components

Use accessible Base UI primitives for interactive controls and native form semantics. Provide visible keyboard focus, 44px minimum touch targets, inline errors, and an explicit loading message for source retrieval. Brand/model and keyword ranking do not establish eligibility or safety confidence. A merchant reviews scope and remedy evidence. Unsupported, incomplete, and provider-unknown outcomes remain visible. Empty results offer a clear way to revise the notice or inspect the catalog.

## Do's and Don'ts

The existing plan and journal modules distinguish reviewed scope, approval, reserved refunds, unresolved attempts, and provider-confirmed completion. Preserve those states in the interface. Purchase fixture records are invented; imported CPSC notices are public source material and cannot silently become approved policies for those purchases. The hosted sandbox keeps each browser's merchant workspace separate; local launch links remain a separate access method. The sponsor has explicitly allowed AG Studio's evaluation watermark during hackathon judging; retain it.

Keep customer claims separate from merchant controls. The customer page starts with the item and required next action, collects evidence inline, and retains a case status and receipt after submission. Merchant controls require the private local merchant session. Mark sandbox money and invented merchandise beside the transaction. The merchant reviews the exact evidence revision before the payment confirmation dialog. Never render a payment as completed before authenticated provider readback. Every migrated route uses the governed cool-grey, white and cobalt system.

Keep notice preparation and case resolution as distinct merchant steps. Show proposed claim fields beside the exact source excerpt that supports them. The merchant reviews the current source version before saving instructions; a prepared setup is not a published campaign or payment authorization. The Studio assistant may change the case view and explain recorded blockers. It has no tool to approve evidence or send a refund.

Keep the merchant's ordinary case list and review controls usable while the optional interactive workspace downloads, or if it fails to load. Mobile uses those ordinary controls without loading Studio. The desktop Studio workspace opens in its supported view mode, with case review given more room than the queue. Workspace editing and the assistant are explicitly opened secondary tools. It retains its grid and custom review widget once ready; both reuse the same review and payment controls and server state.

The landing page may be reviewed as a marketing surface, but it must not grow a second product: no simulated refund, no fake form submission, no invented demo fixture and no submission copy. Adding a claim, changing an amount or changing the workflow belongs in the workbench, where the recorded plan, journal and provider states already exist. Keep `/landing.html` unreachable directly, with the document served only at `/`, and keep the workbench routes serving the app document. Keep `/training` absent from the Pages route list, and describe the environments accurately in the README and in review notes rather than claiming that every environment routes identically.

Publishing a reviewed source creates a sandbox scenario for future test purchases. Freeze each purchase’s campaign and evidence requirements when the purchase is created. Preserve earlier pending purchases and claims when the active scenario changes. Show the exact source-required responses to both the customer and the merchant; missing responses block evidence review. A public notice used in a sandbox scenario does not imply manufacturer affiliation.

Evidence review must include a way to ask the customer for a correction. A merchant names the specific problem and whether a replacement photograph is required. Show the request prominently on the same private customer page. The desk keeps the request, the response and a photograph hash so the returned image can be rejected; it does not keep the replaced submission, so no surface may promise recoverable evidence history. Updating a requested photograph requires a new upload; a customer describes their response before resubmitting. This is a request for reviewable information, not an automated denial or an authenticity decision. Clear the prior evidence approval immediately, require a new review after the response, and prevent corrections once a payment is reserved. Both parties see the latest request and response; no email is sent by this feature.

A new merchant with no claims should see a clear first action to prepare a source-backed claim form. Explain the sequence in plain language before the optional fictional example. In the active desk, separate ordinary submitted evidence awaiting review from exceptional manual cases and from reviewed claims awaiting payment approval. The assistant’s wording and case views must use the same distinctions; finding a queue never approves its contents.

Customer page headings and lead content follow the recorded state. An open claim leads with the evidence action, a correction leads with the merchant request, a submitted claim names the merchant as the next actor, and a completed claim leads with its verified receipt. General submission instructions must not remain above a completed refund. Keep source instructions, previous responses and the scenario disclosure available as supporting context.

Source setup exposes the current stage: import, review fields, or publish. After instructions are saved, compress earlier drafting into an explicit edit affordance and bring publication forward. Keep unsupported-route reasons next to the blocked action, and expose saved-setup loading failures with a retry.

## Practice case

## Homepage migration status (2026-11-04)

- Migrated: `/` homepage and `/practice` guided claim. Both use `--surface #FFFFFF`, `--canvas #F5F7FA`, `--ink #142337`, `--ink-2 #596779`, `--action #315CF5`, `--border #DEE5EE` and the shared wordmark/button language.
- Homepage exact copy: eyebrow `Recall resolution for merchants`; headline `Resolve recall claims. Refund the right item.`; supporting sentence `Turn a recall notice into clear customer instructions. Review the evidence, then approve the affected item’s refund to the original PayPal payment.`; primary `Try a guided claim`; note `Simulated. No funds move.`; quiet `Sandbox workspace`.
- Illustrative allocation: `One order. One affected item.`; cup `$25.99` affected; tray `$34.00` excluded; original `$59.99`; proposed refund `$25.99` to the original PayPal payment; no approval control.
- Instructions: `One clear path from notice to refund.` with Prepare claim, Review evidence and Approve refund; `Everything needed for the decision.` with Source requirement, Current evidence and Refund confirmation; compact practice/Sandbox FAQ.
- Routes: `/practice` primary guided claim; `/desk` quieter Sandbox workspace; `/sample` in the footer; `#relay` for How it works. The practice wordmark returns to `/`.
- Not yet migrated: `/claim`, `/desk`, `/setup` and Studio keep their existing surface styling and behavior until their own increment. Do not copy the homepage palette into them piecemeal, and do not copy connected allocation constants into the homepage.
- The homepage is static, so it may not invent a refund, submit a form, call a provider or display an authorization control.

`/practice` is a separate local evaluation surface: one fictional $25.99 item inside a $59.99 practice purchase, with the unaffected $34.00 line excluded. It reuses the claim state machine and the governed surface system, but keeps its own store, session cookie and claim identifiers, so it cannot read or change a connected sandbox workspace. A new practice case opens in the customer role, because the journey begins with customer evidence; the merchant side is reached through the contextual handoff, not a toggle.

Reviewed requirements stay linked to the invented practice notice; the recorded assistant draft is labelled as recorded, not live. The journey is evidence, a merchant review, a correction only when needed, a fresh review for the new revision, an explicit refund confirmation that names the amount, and a clearly simulated receipt. The excluded tray and the simulated destination remain visible at the decision. No payment provider, live model call or paid service is involved, and the receipt never claims that money moved.
