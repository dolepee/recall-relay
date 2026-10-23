---
name: Recall Relay
description: A merchant workbench for reviewing affected purchases and resolving refunds.
---

## Overview

Help a merchant move from a sourced product notice to reviewed customer cases and a confirmed refund to the original payment. The connected sandbox surface uses fictional merchandise and real sandbox payments; the separate training surface uses invented payment IDs. Show that limitation beside the work, and never describe a prepared refund as money returned.

## Colors

This is the first interface; there is no incumbent visual system to preserve. Use Tailwind defaults: white surfaces, slate text and borders, and teal for the main action. Use the system sans-serif stack, ordinary sentence case, clear numeric alignment, and restrained borders. Do not add animation, decorative charts, gradients, or a hero section.

## Layout

Start with the active notice and the next merchant action. Keep suggested product matches, affected cases, and the selected case within one workbench. On small screens, stack the notice, case list, and selected case in that order. The case detail names the exact order, evidence requirement, amount, and original payment before approval. AG Studio supports the case workspace; its configuration controls must not replace the merchant task.

## Components

Use accessible Base UI primitives for interactive controls and native form semantics. Provide visible keyboard focus, 44px minimum touch targets, inline errors, and an explicit loading message for source retrieval. Brand/model and keyword ranking do not establish eligibility or safety confidence. A merchant reviews scope and remedy evidence. Unsupported, incomplete, and provider-unknown outcomes remain visible. Empty results offer a clear way to revise the notice or inspect the catalog.

## Do's and Don'ts

The existing plan and journal modules distinguish reviewed scope, approval, reserved refunds, unresolved attempts, and provider-confirmed completion. Preserve those states in the interface. Purchase fixture records are invented; imported CPSC notices are public source material and cannot silently become approved policies for those purchases. The hosted sandbox keeps each browser's merchant workspace separate; local launch links remain a separate access method. The sponsor has explicitly allowed AG Studio's evaluation watermark during hackathon judging; retain it.

Keep customer claims separate from merchant controls. The customer page starts with the item and required next action, collects evidence inline, and retains a case status and receipt after submission. Merchant controls require the private local merchant session. Mark sandbox money and invented merchandise beside the transaction. The merchant reviews the exact evidence revision before the payment confirmation dialog. Never render a payment as completed before authenticated provider readback. Preserve the same white, slate and teal direction on both surfaces.

Keep notice preparation and case resolution as distinct merchant steps. Show proposed claim fields beside the exact source excerpt that supports them. The merchant reviews the current source version before saving instructions; a prepared setup is not a published campaign or payment authorization. The Studio assistant may change the case view and explain recorded blockers. It has no tool to approve evidence or send a refund.

Publishing a reviewed source creates a sandbox scenario for future test purchases. Freeze each purchase’s campaign and evidence requirements when the purchase is created. Preserve earlier pending purchases and claims when the active scenario changes. Show the exact source-required responses to both the customer and the merchant; missing responses block evidence review. A public notice used in a sandbox scenario does not imply manufacturer affiliation.
