import type { FunctionArgs, FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type ReportRow = FunctionReturnType<typeof api.reports.listReportPage>["page"][number];
export type ReportFilters = Omit<FunctionArgs<typeof api.reports.listReportPage>, "paginationOpts">;

export function summarizeReport(rows: ReportRow[]) {
  const paid = rows.filter((row) => row.status === "PAID");
  return {
    billCount: rows.length,
    paidCount: paid.length,
    unpaidCount: rows.length - paid.length,
    billAmountPaise: rows.reduce((sum, row) => sum + row.amountPaise, 0),
    paidAmountPaise: paid.reduce((sum, row) => sum + (row.paidAmountPaise ?? 0), 0),
    unpaidAmountPaise: rows.filter((row) => row.status === "UNPAID").reduce((sum, row) => sum + row.amountPaise, 0),
    paymentGroupCount: new Set(rows.flatMap((row) => row.payment ? [row.payment._id] : [])).size,
    missingSnapshots: paid.filter((row) => row.paidAmountPaise === null).length,
  };
}

export function groupReportRows(rows: ReportRow[]) {
  const groups = new Map<string, {
    id: string; reference: string; paymentDate: string; distributor: string;
    bank: string; groupTotalPaise: number; includedPaidPaise: number; rows: ReportRow[];
  }>();
  for (const row of rows) {
    if (!row.payment) continue;
    let group = groups.get(row.payment._id);
    if (!group) {
      group = {
        id: row.payment._id, reference: row.paymentReference ?? row.payment._id,
        paymentDate: row.payment.paymentDate,
        distributor: row.paymentDistributorName ?? "Unavailable distributor",
        bank: row.bankAccount ? `${row.bankAccount.bankName} · ****${row.bankAccount.accountLast4}` : "Unavailable bank",
        groupTotalPaise: row.payment.totalAmountPaise, includedPaidPaise: 0, rows: [],
      };
      groups.set(row.payment._id, group);
    }
    group.rows.push(row);
    group.includedPaidPaise += row.paidAmountPaise ?? 0;
  }
  return [...groups.values()].sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}

function csvCell(value: string | number) {
  const text = String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function reportCsv(rows: ReportRow[], outletName: string) {
  const table: (string | number)[][] = [[
    "Outlet", "Bill number", "Bill date", "Distributor", "Bill amount (INR)",
    "Status", "Paid against bill (INR)", "Payment group", "Payment ID", "Payment date",
    "Payment group total (INR, repeated per bill)", "Bank", "Masked account",
  ]];
  for (const row of rows) table.push([
    outletName, row.billNumber, row.billDate, row.distributor?.name ?? "Unavailable distributor",
    (row.amountPaise / 100).toFixed(2), row.status,
    row.paidAmountPaise === null ? "" : (row.paidAmountPaise / 100).toFixed(2),
    row.paymentReference ?? "", row.payment?._id ?? "", row.payment?.paymentDate ?? "",
    row.payment ? (row.payment.totalAmountPaise / 100).toFixed(2) : "",
    row.bankAccount?.bankName ?? "", row.bankAccount ? `****${row.bankAccount.accountLast4}` : "",
  ]);
  return "\uFEFF" + table.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
