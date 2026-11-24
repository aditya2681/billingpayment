# Reports and customer statements

Owners can open **More → Reports** on mobile, or **Reports** in the desktop navigation. Reports are scoped to the selected outlet.

1. Select all, paid or unpaid bills and an optional distributor.
2. Set the bill-date period: all time, this month, last month or custom start/end dates.
3. Open **Payment dates & more filters** for a payment-date period, bank account, payment-group reference, bill search or a customer/business name in **Prepared for**.
4. Choose **Generate report**. The report follows every result page, including empty intermediate pages, until all matching bills have been read.
5. Review **Bills**, **Payment groups** or **Table**. Mobile bill cards are readable without horizontal scrolling; the explicit table view scrolls within the table.
6. Choose **Download CSV** for Excel-compatible tabular data, or **Print / Save PDF** for a customer statement with the outlet, recipient, generation time, applied filters, totals, bill table and payment-group summary. The browser/system print dialog supplies the Save PDF option. Nothing is automatically sent to a customer.

Changing filters marks the old report as out of date and disables its export buttons until regeneration. Generation can be cancelled. Invalid and incomplete custom date ranges have inline feedback. Phone dates and report filenames use the local calendar date.

## Amount meanings

- **Bill amount / Bill value**: the current amount on each bill.
- **Paid against bill / Recorded paid**: the original `paymentBills.amountAtPaymentPaise` snapshot. Later corrections to a bill do not rewrite this payment history.
- **Payment group total**: the original total of the entire recorded payment. It can repeat in the individual-bill table and must not be summed once per bill.
- **Paid against included bills**: the part of a payment covered by bills included in this filtered report. A date or distributor filter can include only part of a payment group.
- **Unpaid value**: current amounts on the unpaid bills included in this report.

Missing snapshots are explicitly flagged and excluded from the paid total. Payment-date, bank and group filters naturally exclude unpaid bills. Bank numbers remain masked. CSV cells are escaped and protected against spreadsheet formula interpretation; a UTF-8 BOM supports Excel.

## Implementation and checks

`reports.listReportPage` reuses the existing indexed, owner/outlet-authorized bill-history pagination, then resolves original payment snapshots and report-specific bank/group filters. No schema migration is required. The report does not create, edit or mark bills paid.

Regression coverage includes corrected bill amounts, payment snapshots, partial groups, distinct group totals, sparse pagination past the previous 300-bill window, CSV escaping, date validation and rejection of anonymous, employee and unrelated-owner access.

Mobile browser checks at 390px loaded all 45 synthetic development bills, with 2 paid bills grouped into one ₹2,960.81 payment. A custom November paid-bill report at 320px correctly included one bill for ₹1,574.06 while retaining the original group total of ₹2,960.81. The table contained ten columns, scrolled internally, and did not overflow the page. Changing filters disabled stale exports. The generated CSV contained the filtered bill, paid amount, group and payment date, with no full bank account number.

The Print / Save PDF path uses print styles with an A4 landscape layout, repeated table headers, separate group totals, and hidden application controls. Physical printers and each phone's native PDF/share workflow have not been certified by the emulator checks.

The backend was verified on development `diligent-bobcat-974`. Production still requires its backend and frontend release.
