# Evaluation access and capacity

The open synthetic reconciliation example at `/practice/reconciliation` runs in the browser without PayPal, model calls or a server admission quota. Guided practice at `/practice` uses isolated, expiring server sessions and simulated settlement. Neither route is provider payment evidence.

Invited evaluation access at `/evaluation` reserves capacity within the existing hosted budget. It grants no merchant ownership, customer capability, capture access or payment authority. Every browser still has its own workspace. The service operator distributes a high-entropy code privately; never publish it in the repository, query string or screenshots. The server stores only its SHA-256 digest in the `EVALUATION_ACCESS_HASH` secret. Rotation invalidates existing evaluation cookies. Code entry is same-origin JSON; the HttpOnly, SameSite=Strict cookie is limited to `/api`.

When configured, the existing ceilings are split into public and evaluation pools: 180 + 20 new workspaces daily, 60 + 20 model generations daily, and 360 + 40 practice sessions daily. Public model bursts use up to four of the existing five slots per minute; evaluation uses one. Per-workspace model limits still apply. All admissions consume the original overall ceilings as well. Existing records remain accessible after an admission pool is exhausted. This protects capacity from public admission exhaustion; it is not unlimited access, an uptime guarantee or a claim that provider outages are impossible.

Without the secret, reserved pools are disabled and the existing public limits apply. Keep the code and operator instructions outside the repository. Reaching a cap states the server reset time; manual source review and the browser-only synthetic example remain available.
