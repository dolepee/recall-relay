# Existing-purchase ledger import — implemented contract

Status: implemented preview. `POST /api/merchant/import-preview` reads a
merchant-declared ledger and returns a classification. It does not persist the
ledger, contact a payment provider, establish an allocation or authorize a
refund.

## Request

The merchant desk sends the declaration as JSON to
`POST /api/merchant/import-preview`. The route requires an authenticated
merchant session, the same origin and a JSON request body; `GET` is rejected
with 405, an unauthenticated request with 401 and a cross-origin request with
403.

```json
{
  "version": 1,
  "currency": "USD",
  "source": {
    "kind": "merchant-ledger",
    "label": "Merchant order export",
    "reference": "optional-file-or-export-id"
  },
  "orders": [
    {
      "orderId": "RR-EXISTING-001",
      "captureId": "CAPTURE-DECLARED-001",
      "capturedAt": "2026-10-01T12:00:00.000Z",
      "status": "COMPLETED",
      "lines": [
        {
          "declaredLineId": "LINE-001-CUP",
          "sku": "CUP-01",
          "lot": "LOT-A",
          "quantity": 1,
          "itemPaidCents": 2599,
          "taxCents": 0,
          "shippingCents": 0,
          "refundedCents": 0
        }
      ]
    }
  ]
}
```

Only these fields are accepted. An unexpected field is rejected, so a caller
cannot submit an authority field such as `workspaceId`, `allocationId`,
`verification` or `providerFacts`.

Limits: 1–50 orders, 1–200 lines in total, and each amount at most 100,000,000
cents. `version` must be `1`, `currency` must be `USD` and `source.kind` must be
`merchant-ledger`. `captureId`, `capturedAt`, `status`, `sku`, `lot` and
`reference` may be `null`. A date must parse if supplied. `declaredLineId` must
be unique within its order.

## Response

```json
{
  "version": 1,
  "mode": "DECLARED_PREVIEW",
  "currency": "USD",
  "source": {"kind": "merchant-ledger", "label": "…", "reference": null},
  "scope": {"sku": "CUP-01", "lot": "LOT-A"},
  "orders": [
    {
      "orderId": "RR-EXISTING-001",
      "captureId": "CAPTURE-DECLARED-001",
      "capturedAt": "2026-10-01T12:00:00.000Z",
      "status": "COMPLETED",
      "captureVerified": false,
      "providerFacts": null
    }
  ],
  "lines": [
    {
      "declaredLineId": "LINE-001-CUP",
      "sku": "CUP-01",
      "lot": "LOT-A",
      "quantity": 1,
      "itemPaidCents": 2599,
      "taxCents": 0,
      "shippingCents": 0,
      "refundedCents": 0,
      "orderIndex": 0,
      "lineIndex": 0,
      "orderId": "RR-EXISTING-001",
      "declaredCaptureId": "CAPTURE-DECLARED-001",
      "disposition": "AFFECTED",
      "reasons": [],
      "candidateCents": 2599,
      "allocationId": null,
      "verification": "UNVERIFIED",
      "paymentAllowed": false
    }
  ],
  "summary": {
    "affectedCount": 1,
    "unaffectedCount": 0,
    "manualCount": 0,
    "candidateCents": 2599,
    "verifiedRefundableCents": null,
    "confirmedRefundCents": null
  },
  "persisted": false,
  "providerChecked": false,
  "paymentAllowed": false
}
```

`scope` is the active campaign's published product and lot, or both `null` when
nothing is published. The caller cannot supply it.

## Classification

- No published SKU or lot: every line is `MANUAL` (`Publish reviewed product
  and lot scope first.`).
- Missing declared SKU: `MANUAL`. A different SKU: `UNAFFECTED` and never
  counted. A missing or different lot on the matching SKU: `MANUAL`; an exact
  SKU and lot match starts as `AFFECTED`.
- An `AFFECTED` line becomes `MANUAL` if the order lacks a capture, date or
  `COMPLETED` status; quantity is not 1; any amount is unknown; tax or shipping
  is positive; or prior refunds already cover the item total.
- Duplicate capture declarations across orders make every occurrence `MANUAL`
  with no candidate. More than one same-scope line in one order also makes those
  lines `MANUAL` with no candidate. A renamed order or line does not escape
  either rule.
- `candidateCents` is `itemPaidCents - refundedCents` for an `AFFECTED` line and
  `null` otherwise. Zero is a real candidate value; `null` means not counted or
  unknown.

## Amount rules

- `itemPaidCents` is the full line total after discounts, not a unit price.
- `0` is explicit zero. `null` or `"UNKNOWN"` is unknown and is returned as
  `null`. Unknown is never rendered or totalled as zero.
- `verifiedRefundableCents` and `confirmedRefundCents` are always `null`: this
  preview has no provider readback and records no refund.

## Not established

A declared capture, status or amount is not a provider fact. The preview creates
no allocation (`allocationId` is always `null`), does not bind the capture to
the workspace, does not verify purchase provenance and cannot authorize a
refund or approval. Those require separate server-side capture ownership and
line allocation work.
