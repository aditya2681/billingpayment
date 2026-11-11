# Bill visibility and mobile payment review audit

Audit date: 11 November 2026. Production was inspected read-only. No production data was changed or migrated.

## Confirmed production cause

`bills.listBills` reads the first 300 documents from the owner/outlet index in ascending creation order. It then applies status, distributor, bill date, payment date and search filters, and finally sorts the remaining documents. Filtering and sorting cannot recover documents already excluded by the first 300-row read.

| Production outlet | Bills in database | Paid | Unpaid | Excluded by View Bills cutoff | Paid bills excluded |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dk department | 348 | 331 | 17 | 48 | 37 |
| Dk kirana stores | 197 | 176 | 21 | 0 | 0 |

The current-month default further hides historical bills. Production contains bills dated August through November 2026.

This was also reproduced by invoking the already-deployed `bills.listBills` query read-only as the outlet owner: it returns **300 rows for all time, zero rows for November 2026**, and a newest returned bill date of **27 October 2026**. The database contains **32 November bills** for Dk department; all 32 are outside the query's first 300 rows.

## Relationships checked

- `bills` identifies the owner, outlet and distributor, and optionally references a payment.
- `payments` contains the payment group, payment date, bank, total and bill count.
- `paymentBills` links each payment group to its bills and stores the amount at payment time.
- `outlets`, `profiles`, `distributors` and `bankAccounts` provide ownership and display data.

The read-only production scan covered 545 bills, 311 payments and 507 payment/bill links. None of the scan limits were reached. No missing bill outlets, missing distributors, bill/outlet ownership mismatches, paid bills without payments or matching links, unpaid bills with payment references, orphaned payment links, payment/bill scope mismatches or group bill-count mismatches were found. This validates those relationships; it is not a general audit of every business rule or transaction.

Payments can display the missing bills because they resolve bills by ID through `paymentBills`, bypassing the View Bills 300-document window. The data does not need a repair or migration to resolve this incident.

## Additional data-quality findings

The extended scan also checked payment snapshot sums, bank/distributor ownership, duplicate bill numbers, duplicate payment links, current payment references, date formats, and amount validity. Snapshot sums match payment totals, dates are ISO formatted, and no ownership or duplicate-link/number discrepancies were found. No production payment contains more than 200 bills.

Two paid bills currently have zero amounts:

- `k57683q14bqgh68kn6ba95xnys8cgf46`
- `k57fcsv5g8kbfvdhpcsxytskkd8fzws3`

One payment has a zero total: `ks75ej023ws7sm5adhv0n544sn8g7y9x`.

One bill's current amount differs from its amount-at-payment snapshot. The app allows corrections to paid bills, so a difference can be expected; the payment history correctly retains the recorded snapshot. These records should be reviewed against the original bills and receipts. They were not modified by this audit.

The edit-bill endpoint previously had no positive-amount check. Creation and editing now require a positive integer number of paise, and payment recording refuses invalid bill amounts and unsafe totals.

## Implemented changes

- New `bills.listBillsPage` and `payments.listPaymentsPage` endpoints use cursor pagination and descending date indexes. The original array endpoints remain available for older frontends during rollout.
- Date bounds and distributor selection use existing indexes where applicable. Remaining predicates operate within bounded reads. Search and joined payment-date filtering may produce sparse pages; the frontend follows cursors until enough matches are found or history is exhausted.
- Both history pages start at all time. Closing or collapsing filters preserves the applied values. A visible date summary, clear-all controls and empty/loading states explain the results.
- Bill CSV export follows all matching pages, rather than exporting only the currently visible page.
- Historical distributors remain selectable even when deactivated.
- Payment review resolves the exact selected bill IDs, validates their owner/outlet/distributor and unpaid status, and blocks confirmation if a selection became invalid. Returning to selection preserves the selected IDs.
- Duplicate bill IDs are rejected when recording payments. Each payment supports up to 200 distinct bills, matching the existing transaction/detail bounds.
- The copy control uses a 16px icon in its own 40px target, separate from the amount. Clipboard errors are shown inline.
- Date fields use the phone's native picker; dropdowns have explicit labels, expanded states and Escape handling.
- Payment review uses document scrolling, without fixed-height or clipped bill lists. The layout reserves space for the bottom navigation and phone safe area. The mobile header scrolls away so it does not obscure the review content.
- Mobile histories use compact search and filter controls, clear amount typography and direct Bills navigation. Payment groups expand to show their individual bills.

## Validation

The automated regression suite reproduces the original 300-bill defect and checks complete pagination, sparse search pages, date/distributor/status filters, payment-date joins, masked bank data, exact payment selections, changed selections, payment history over 300 groups, duplicate selection rejection, and refusal of anonymous/employee/other-owner access.

Ten regression tests pass, including checks that invalid bill edits and zero-total payments are refused.

Run `npm test`, `npm run lint`, `npm run build`, and `npx tsc --noEmit -p convex/tsconfig.json`.

The development deployment is `diligent-bobcat-974`. Mobile browser fixtures live in a separate synthetic development workspace named **Mobile QA Workspace**, with outlet **Mobile QA · Development only**. They are not production customer records.

Chrome mobile emulation at 390 × 844 and 320 × 640 verified eight selected bills, a total of ₹9,87,81,695.20, no horizontal overflow, no copy/amount overlap, and the last bill plus confirmation button reachable above the fixed navigation. Clipboard success feedback and preserving date filters when collapsed were also checked.

The development browser test additionally loaded 45 bills across multiple pages, searched for an August bill beyond the first page, restored eight selections when returning from review, and expanded a payment group into its two bill links.

## Release

The new backend endpoints must be deployed to the same production Convex deployment used by Netlify's `VITE_CONVEX_URL`, followed by a frontend release. Existing endpoints are retained to keep the currently deployed frontend compatible during rollout. This work does not itself authorize or perform a production deployment.

## Other scaling limits observed

The existing dashboard statistics still read at most 200 bills; pending-distributor summaries read at most 500 unpaid bills, and bill selection exposes up to 200 pending bills per distributor. These are separate from the history fix. Dashboard counts should be moved to maintained aggregates, and pending lists to pagination, before relying on them at larger volumes. The payment detail limit is now explicitly enforced as 200 distinct bills per payment.
