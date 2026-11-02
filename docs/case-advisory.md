# Read-only source advisory

The case advisory interprets public recall instructions: actor, timing, conditions
and a short explanation beside each complete source quotation. Recorded evidence
gaps are supplied by the server separately. The model does not inspect evidence,
classify a customer as eligible or approve payment.

`POST /api/merchant/case-context` accepts only `caseId`, `revision` and `section`
(`brief`, `source` or `gaps`). `POST /api/merchant/case-advisory` accepts only
`caseId` and `revision`. Both require the existing merchant session and same-origin
JSON boundary. They cannot enumerate another workspace. Responses include case,
revision, source and context digests, and `readOnly: true`. Context reads are limited
to 60 per workspace per minute; a bounded one-minute audit records the case and
section, never a prompt, image or customer response.

Only public source clauses are sent to inference. Photos, customer free text,
private links, purchase identifiers and credentials remain outside the model input.
A changed evidence revision returns `STALE_REVISION`; changed review, source,
correction or payment state during inference returns `STALE_CONTEXT`. Advice is
not persisted into claims, review records or payment reservations.

Hosted advisory uses gpt-oss-120b through the existing Workers AI binding and
admission budget. Source drafting and view selection retain Qwen3-30B. The local
adapter uses its configured local model; hosted evaluation results do not establish
local-model quality. Manual review remains available when inference is unavailable.

Output must contain exactly the supplied citation IDs with no duplicates, a
bounded explanation, supported actor/timing enums and an exact quoted condition.
Common unsafe paraphrases found during evaluation (omitted unplug/cut/only,
strengthened should/may, unsupported timing, or replacing confirmation with
verification) are withheld per clause. Withheld clauses retain their complete
source quotation and a server-authored abstention message. The response is
`INSUFFICIENT` if any interpretation is withheld. These checks are conservative,
incomplete safeguards, not a proof that accepted prose is correct. Suspicious
instruction text and missing or oversized source context abstain before inference.

Compare every explanation with its quotation. The source remains authoritative;
model actor/timing labels and prose are advisory. No accuracy, time-saving,
photo-authenticity or eligibility guarantee is made.
