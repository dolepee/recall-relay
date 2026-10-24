---
version: alpha
name: Recall Relay
description: A merchant workbench for reviewing affected purchases and resolving refunds.
---

## Overview

Help a merchant move from a sourced product notice to reviewed customer cases and a confirmed refund to the original payment. The connected sandbox surface uses fictional merchandise and real sandbox payments; the separate training surface uses invented payment IDs. Show that limitation beside the work, and never describe a prepared refund as money returned.

## Colors

Preserve the existing product identity and Tailwind defaults: white surfaces, slate text and borders, and teal for the main action. Use the system sans-serif stack, ordinary sentence case, clear numeric alignment, and restrained borders. Do not add animation, decorative charts, gradients, or a hero section.

## Layout

For a returning merchant, start with a compact active-campaign identity and the claim queue. Keep the full notice and purchase connection available through progressive disclosure, rather than placing their complete text before the current work. First use has one primary route into notice preparation. Keep suggested product matches, affected cases, and the selected case within one workbench. On small screens, stack the notice, case list, and selected case in that order. The case detail names the exact order, evidence requirement, amount, and original payment before approval. AG Studio supports the case workspace; its configuration controls must not replace the merchant task.

## Components

Use accessible Base UI primitives for interactive controls and native form semantics. Provide visible keyboard focus, 44px minimum touch targets, inline errors, and an explicit loading message for source retrieval. Brand/model and keyword ranking do not establish eligibility or safety confidence. A merchant reviews scope and remedy evidence. Unsupported, incomplete, and provider-unknown outcomes remain visible. Empty results offer a clear way to revise the notice or inspect the catalog.

## Do's and Don'ts

The existing plan and journal modules distinguish reviewed scope, approval, reserved refunds, unresolved attempts, and provider-confirmed completion. Preserve those states in the interface. Purchase fixture records are invented; imported CPSC notices are public source material and cannot silently become approved policies for those purchases. The hosted sandbox keeps each browser's merchant workspace separate; local launch links remain a separate access method. The sponsor has explicitly allowed AG Studio's evaluation watermark during hackathon judging; retain it.

Keep customer claims separate from merchant controls. The customer page starts with the item and required next action, collects evidence inline, and retains a case status and receipt after submission. Merchant controls require the private local merchant session. Mark sandbox money and invented merchandise beside the transaction. The merchant reviews the exact evidence revision before the payment confirmation dialog. Never render a payment as completed before authenticated provider readback. Preserve the same white, slate and teal direction on both surfaces.

Keep notice preparation and case resolution as distinct merchant steps. Show proposed claim fields beside the exact source excerpt that supports them. The merchant reviews the current source version before saving instructions; a prepared setup is not a published campaign or payment authorization. The Studio assistant may change the case view and explain recorded blockers. It has no tool to approve evidence or send a refund.

Keep the merchant's ordinary case list and review controls usable while the optional interactive workspace downloads, or if it fails to load. Mobile uses those ordinary controls without loading Studio. The desktop Studio workspace opens in its supported view mode, with case review given more room than the queue. Workspace editing and the assistant are explicitly opened secondary tools. It retains its grid and custom review widget once ready; both reuse the same review and payment controls and server state.

Publishing a reviewed source creates a sandbox scenario for future test purchases. Freeze each purchase’s campaign and evidence requirements when the purchase is created. Preserve earlier pending purchases and claims when the active scenario changes. Show the exact source-required responses to both the customer and the merchant; missing responses block evidence review. A public notice used in a sandbox scenario does not imply manufacturer affiliation.

Evidence review must include a way to ask the customer for a correction. A merchant names the specific problem and whether a replacement photograph is required. Show the request prominently on the same private customer page, with the previous submission retained. Updating a requested photograph requires a new upload; a customer describes their response before resubmitting. This is a request for reviewable information, not an automated denial or an authenticity decision. Clear the prior evidence approval immediately, require a new review after the response, and prevent corrections once a payment is reserved. Both parties see the latest request and response; no email is sent by this feature.

A new merchant with no claims should see a clear first action to prepare a source-backed claim form. Explain the sequence in plain language before the optional fictional example. In the active desk, separate ordinary submitted evidence awaiting review from exceptional manual cases and from reviewed claims awaiting payment approval. The assistant’s wording and case views must use the same distinctions; finding a queue never approves its contents.

Customer page headings and lead content follow the recorded state. An open claim leads with the evidence action, a correction leads with the merchant request, a submitted claim names the merchant as the next actor, and a completed claim leads with its verified receipt. General submission instructions must not remain above a completed refund. Keep source instructions, previous responses and the scenario disclosure available as supporting context.

Source setup exposes the current stage: import, review fields, or publish. After instructions are saved, compress earlier drafting into an explicit edit affordance and bring publication forward. Keep unsupported-route reasons next to the blocked action, and expose saved-setup loading failures with a retry.
