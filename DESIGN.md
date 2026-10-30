---
version: alpha
name: Recall Relay
description: A merchant workbench for reviewing affected purchases and resolving refunds, with a public landing document at the site root.
---

## Overview

Help a merchant move from a sourced product notice to reviewed customer cases and a confirmed refund to the original payment. The connected sandbox surface uses fictional merchandise and real sandbox payments; the separate training surface uses invented payment IDs. Show that limitation beside the work, and never describe a prepared refund as money returned.

There are two surfaces in one deployment. The public landing document at `/` introduces the job and the claim workflow to a merchant who has not used the product. The workbench and the private customer claim keep `/desk`, `/setup`, `/claim` and `/training` respectively. The landing page is a static document; every action on it either scrolls within the page or navigates to the workbench. It never simulates a refund, a form submission or a payment.

## Colors

On the workbench and customer-claim surfaces, preserve the existing product identity and Tailwind defaults: white surfaces, slate text and borders, and teal for the main action. Use the system sans-serif stack, ordinary sentence case, clear numeric alignment, and restrained borders. On those surfaces do not add animation, decorative charts, gradients, or a hero section.

The landing document at `/` has its own recorded palette and does not borrow the workbench one, and the workbench must not drift into it. Warm paper `#F3EEE2` and card `#FBF8F0` carry body text in `#0E1417` with secondary text `#3B4448` and `#5C6669`; hairlines are `rgba(14,20,23,.17)` and `rgba(14,20,23,.34)`. One cobalt `#1B3FD8` is the only accent, and it appears on the primary button, the link underline on hover and the lockup mark, never as decoration. Two dark bands, `#0C1215` with text `#EFE9DC` and muted text `#A2AEB0`, hold the five-stage handoff and the refund receipt. Green `#0B6A3C` on `#E9F4ED` is reserved for provider-confirmed completion and must not label anything else. Measured at 1440, 390 and 320, all 33 sampled text pairs clear WCAG AA for their size: the lowest is `#5C6669` on paper at 4.62:1 for the 10.5px footer and disclosure lines, muted text on the dark bands measures 8.28:1, and the green confirmation stamp is 6.57:1.

## Layout

For a returning merchant, start with a compact active-campaign identity and the claim queue. Keep the full notice and purchase connection available through progressive disclosure, rather than placing their complete text before the current work. First use has one primary route into notice preparation. Keep suggested product matches, affected cases, and the selected case within one workbench. On small screens, stack the notice, case list, and selected case in that order. The case detail names the exact order, evidence requirement, amount, and original payment before approval. AG Studio supports the case workspace; its configuration controls must not replace the merchant task.

## Marketing surface (`/`)

The landing page is one static HTML document with its own inline styles: no framework, no CDN, no external font request, no image request and no build step beyond being copied into `dist`. It must keep working with JavaScript disabled; the only script closes the mobile menu after a destination is chosen. Text is set in the system sans stack with a Helvetica-first display face and monospace reserved for figures, references and timestamps.

The reading order is the visual order at every width, and the visible numbering follows it: hero, `01 The product` with close-up 01 (the decision) then close-up 02 (the requirement), `02 How it works`, `03 The receipt`, `04 Trust`, `05 Scope`, then the closing action. Nothing is reordered by CSS `order`, so keyboard and screen-reader order match the screen. The page has no nested scrolling, and no element exceeds the viewport at 1440, 390 or 320.

The composition is deliberately one claim rather than a queue. At 1440 the selected claim sits beside the headline at 160px from the top of the document and is fully visible in the first 900px; the first product close-up begins at 866px. At 390×844 the claim starts at 431px and ends at 776px, inside the first viewport, and the first close-up arrives at about 1.2 screens. At 320×720 the claim starts at 472px, so it runs slightly past the first screen, and the first close-up arrives at about 1.5 screens. Those positions are the approved ones: when reviewing a change, measure the claim and the first close-up, not total page height. The document is 5,152px tall at 1440.

Every control is at least 44px tall. Anchored sections land clear of the 68px sticky header (41px of clearance measured after a navigation click). The compact menu below 1080px is a native `details` element anchored to the header's right gutter: 280px wide at 390, rows of 46px, closing on Escape with focus returned to the summary. Every internal destination is a same-origin path (`/desk`), never an absolute production origin and never a new tab.

Honest scope labels are part of the surface and must survive design changes: `Sandbox evaluation — not production merchant onboarding` in the page strip, `Sandbox workspace · test funds · fictional merchandise` in the hero, `Sandbox example` on the selected claim, `Example controls` with the note that the page is static and submits nothing, and `Sandbox test record` plus `Not a real PayPal transaction` on the receipt. The fabricated evidence image is labelled as a drawing, not a photograph. Nothing on the page claims customers, savings, certifications or provider relationships.

## Components

Use accessible Base UI primitives for interactive controls and native form semantics. Provide visible keyboard focus, 44px minimum touch targets, inline errors, and an explicit loading message for source retrieval. Brand/model and keyword ranking do not establish eligibility or safety confidence. A merchant reviews scope and remedy evidence. Unsupported, incomplete, and provider-unknown outcomes remain visible. Empty results offer a clear way to revise the notice or inspect the catalog.

## Do's and Don'ts

The existing plan and journal modules distinguish reviewed scope, approval, reserved refunds, unresolved attempts, and provider-confirmed completion. Preserve those states in the interface. Purchase fixture records are invented; imported CPSC notices are public source material and cannot silently become approved policies for those purchases. The hosted sandbox keeps each browser's merchant workspace separate; local launch links remain a separate access method. The sponsor has explicitly allowed AG Studio's evaluation watermark during hackathon judging; retain it.

Keep customer claims separate from merchant controls. The customer page starts with the item and required next action, collects evidence inline, and retains a case status and receipt after submission. Merchant controls require the private local merchant session. Mark sandbox money and invented merchandise beside the transaction. The merchant reviews the exact evidence revision before the payment confirmation dialog. Never render a payment as completed before authenticated provider readback. Preserve the same white, slate and teal direction on both surfaces.

Keep notice preparation and case resolution as distinct merchant steps. Show proposed claim fields beside the exact source excerpt that supports them. The merchant reviews the current source version before saving instructions; a prepared setup is not a published campaign or payment authorization. The Studio assistant may change the case view and explain recorded blockers. It has no tool to approve evidence or send a refund.

Keep the merchant's ordinary case list and review controls usable while the optional interactive workspace downloads, or if it fails to load. Mobile uses those ordinary controls without loading Studio. The desktop Studio workspace opens in its supported view mode, with case review given more room than the queue. Workspace editing and the assistant are explicitly opened secondary tools. It retains its grid and custom review widget once ready; both reuse the same review and payment controls and server state.

The landing page may be reviewed as a marketing surface, but it must not grow a second product: no simulated refund, no fake form submission, no invented demo fixture and no submission copy. Adding a claim, changing an amount or changing the workflow belongs in the workbench, where the recorded plan, journal and provider states already exist. Keep `/landing.html` unreachable directly, with the document served only at `/`, and keep the workbench routes serving the app document.

Publishing a reviewed source creates a sandbox scenario for future test purchases. Freeze each purchase’s campaign and evidence requirements when the purchase is created. Preserve earlier pending purchases and claims when the active scenario changes. Show the exact source-required responses to both the customer and the merchant; missing responses block evidence review. A public notice used in a sandbox scenario does not imply manufacturer affiliation.

Evidence review must include a way to ask the customer for a correction. A merchant names the specific problem and whether a replacement photograph is required. Show the request prominently on the same private customer page, with the previous submission retained. Updating a requested photograph requires a new upload; a customer describes their response before resubmitting. This is a request for reviewable information, not an automated denial or an authenticity decision. Clear the prior evidence approval immediately, require a new review after the response, and prevent corrections once a payment is reserved. Both parties see the latest request and response; no email is sent by this feature.

A new merchant with no claims should see a clear first action to prepare a source-backed claim form. Explain the sequence in plain language before the optional fictional example. In the active desk, separate ordinary submitted evidence awaiting review from exceptional manual cases and from reviewed claims awaiting payment approval. The assistant’s wording and case views must use the same distinctions; finding a queue never approves its contents.

Customer page headings and lead content follow the recorded state. An open claim leads with the evidence action, a correction leads with the merchant request, a submitted claim names the merchant as the next actor, and a completed claim leads with its verified receipt. General submission instructions must not remain above a completed refund. Keep source instructions, previous responses and the scenario disclosure available as supporting context.

Source setup exposes the current stage: import, review fields, or publish. After instructions are saved, compress earlier drafting into an explicit edit affordance and bring publication forward. Keep unsupported-route reasons next to the blocked action, and expose saved-setup loading failures with a retry.
