# Provisioned Sandbox purchases

The declared ledger preview grants no payment authority. A separate server-side
grant can link a supported existing PayPal Sandbox purchase to one authenticated
workspace. This is an operator-controlled evaluation path, not merchant onboarding
or arbitrary order-history import.

The service operator must establish the workspace owner from a trusted sales
record and review its catalog/lot mapping. PayPal verifies payment facts, not lot,
ownership of a physical product, photo authenticity or product safety.

## Server configuration

`PROVISIONED_PURCHASES` is an optional server secret containing a JSON array of
grants. It is absent by default. Never place real grants, workspace cookies,
credentials or private order records in this repository. The merchant state exposes
its workspace ID as a reference; that ID is not an authentication credential.

Each grant has these fields:

```json
{
  "version": 1,
  "id": "example-grant",
  "workspace": "authenticated-workspace-reference",
  "operator": "reviewing-operator-reference",
  "provisionedAt": "2026-11-02T12:00:00Z",
  "expiresAt": "2026-11-03T12:00:00Z",
  "salesRecordReference": "reviewed-sales-record-reference",
  "orderId": "EXAMPLE-ORDER",
  "captureId": "EXAMPLE-CAPTURE",
  "merchantId": "EXAMPLE-MERCHANT",
  "referenceId": "EXAMPLE-PURCHASE-UNIT-REFERENCE",
  "sku": "CUP-01",
  "lot": "LOT-A",
  "itemOrdinal": 0,
  "itemPaidCents": 3875,
  "captureCents": 7275
}
```

The example is invented and cannot be bound. Validate a real grant against the
operator's original sales record before installing the secret through the existing
authenticated Wrangler workflow. Removing an unused grant revokes it. A used grant
cannot transfer its capture; correcting an assignment requires manual reconciliation.
There is no public provisioning, registry lookup, unlink or transfer endpoint.

## Binding and payment checks

`POST /api/merchant/bind-purchase` accepts only `{ "grantId": "…" }` under
the existing merchant session and same-origin protections. An unprovisioned
workspace is rejected before any provider lookup. A new binding requires an active,
unexpired grant and published instructions with the same reviewed SKU and lot.

The server independently reads the order and capture. The supported path requires
one purchase unit and one completed capture, the expected merchant and order
relationship, an exact total in USD, explicit provider item totals, unique SKUs,
quantity one, and a matching selected item ordinal and price. Nonzero tax,
shipping or discounts, missing item details, prior refunds, ambiguous lines,
future capture dates and captures aged 180 days or more remain manual.

One SQLite Durable Object per Sandbox merchant/capture records immutable ownership
and its first claim, grant digest, operator and provisioning timestamp. Workspace,
SKU, lot, line names and amount are not alternate ownership keys. Concurrent binding
and retries return the same claim. A durable local slot is reserved before global
ownership; pending bindings and checkouts share the six-case capacity budget. A
lost ownership response can resume the same pending allocation without another slot. Ownership survives restarts and cannot be
reassigned by a changed server grant. The first release supports one affected
allocation per capture; other lines and transfers require manual handling.

Catalog/lot mapping is labelled `OPERATOR_REVIEWED`. The stored provider verification
time describes the readback at binding. Approval rechecks the provider order/capture
and current grant, then uses the existing exact-digest reservation and authenticated
refund readback. The model has no authority in this path.

An expired grant cannot create a new binding; it does not erase an existing claim.
Removing or changing the grant blocks new approval of that claim, while existing
payment reconciliation remains available. Configuring no grants leaves the declared
preview and original sandbox checkout workflow available.

## Validation limits

Automated binding and payment tests use an intercepted provider transport in real
workerd with SQLite. They do not prove that a particular real Sandbox order is
eligible. Missing or already-refunded historical proof purchases are deliberately
not admitted. A real positive binding must be recorded separately before claiming
an end-to-end existing-purchase Sandbox demonstration.
