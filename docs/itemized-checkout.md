# Itemized Sandbox checkout

The merchant can choose two USD item prices from $0.01 to $1,000.00 each. The default prices belong to the fictional cup/tray example. Each new checkout saves its own campaign, item rows, affected ordinal, quantity and integer-cent amounts before dispatch. A failed create resumes the original request and original cart; changing the price controls never edits an existing attempt.

PayPal receives both item rows and their `item_total` breakdown. Before capture dispatch and again after completion, the server compares the provider order's SKU, quantity, item amounts, breakdown and total with the saved cart. The affected refund amount comes from that verified saved allocation. Extra tax, shipping, discounts, prior refunds, missing rows or mismatched amounts require manual reconciliation. Capture details must also match the original total.

Earlier checkouts without an itemized snapshot retain their original legacy handling. This release does not retroactively invent provider item evidence for them. Historical purchase binding uses the separate operator-reviewed grant contract. No automatic customer discovery, commerce-platform import or live-money support is implied.
