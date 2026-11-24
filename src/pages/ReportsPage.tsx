import { useEffect, useRef, useState, type FormEvent, type Ref } from "react";
import { useConvex, useQuery } from "convex/react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { Download, FileText, Printer, SlidersHorizontal } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { formatCurrency, formatDateLabel, todayIso } from "../lib/format";
import { userErrorMessage } from "../lib/errors";
import { groupReportRows, reportCsv, summarizeReport, type ReportFilters, type ReportRow } from "../lib/reports";
import "./reports.css";

type DateRange = { period: "ALL" | "THIS_MONTH" | "LAST_MONTH" | "CUSTOM"; from: string; to: string };
const allDates: DateRange = { period: "ALL", from: "", to: "" };
function bounds(range: DateRange) {
  if (range.period === "ALL") return {};
  if (range.period === "CUSTOM") return { from: range.from, to: range.to };
  const date = range.period === "LAST_MONTH" ? subMonths(new Date(), 1) : new Date();
  return { from: format(startOfMonth(date), "yyyy-MM-dd"), to: format(endOfMonth(date), "yyyy-MM-dd") };
}
function dateDescription(range: DateRange) {
  const dates = bounds(range);
  return dates.from && dates.to ? `${formatDateLabel(dates.from)} – ${formatDateLabel(dates.to)}` : "All time";
}

type GeneratedReport = {
  rows: ReportRow[]; fingerprint: string; outletName: string; preparedFor: string;
  generatedAt: string; filters: string[];
};

export default function ReportsPage({ outlet }: { outlet: Doc<"outlets"> }) {
  const convex = useConvex();
  const activeDistributors = useQuery(api.distributors.listDistributors, { activeOnly: true }) ?? [];
  const inactiveDistributors = useQuery(api.distributors.listDistributors, { activeOnly: false }) ?? [];
  const activeBanks = useQuery(api.bankAccounts.listBankAccounts, { activeOnly: true }) ?? [];
  const inactiveBanks = useQuery(api.bankAccounts.listBankAccounts, { activeOnly: false }) ?? [];
  const distributors = [...activeDistributors, ...inactiveDistributors];
  const banks = [...activeBanks, ...inactiveBanks];
  const [status, setStatus] = useState<"ALL" | "PAID" | "UNPAID">("ALL");
  const [distributorId, setDistributorId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [billDates, setBillDates] = useState<DateRange>(allDates);
  const [paymentDates, setPaymentDates] = useState<DateRange>(allDates);
  const [paymentGroup, setPaymentGroup] = useState("");
  const [search, setSearch] = useState("");
  const [preparedFor, setPreparedFor] = useState("");
  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [view, setView] = useState<"BILLS" | "GROUPS" | "TABLE">("BILLS");
  const requestId = useRef(0);
  const statementRef = useRef<HTMLElement>(null);
  useEffect(() => () => { requestId.current++; }, []);
  const billRange = bounds(billDates);
  const paidRange = bounds(paymentDates);
  const filters: ReportFilters = {
    outletId: outlet._id, status,
    distributorId: distributorId ? distributorId as Id<"distributors"> : undefined,
    bankAccountId: bankAccountId ? bankAccountId as Id<"bankAccounts"> : undefined,
    billDateFrom: billRange.from, billDateTo: billRange.to,
    paymentDateFrom: paidRange.from, paymentDateTo: paidRange.to,
    paymentGroup: paymentGroup.trim() || undefined, search: search.trim() || undefined,
  };
  const fingerprint = JSON.stringify({ filters, preparedFor: preparedFor.trim() });
  const stale = report !== null && report.fingerprint !== fingerprint;

  function resetFilters() {
    setStatus("ALL"); setDistributorId(""); setBankAccountId(""); setBillDates(allDates);
    setPaymentDates(allDates); setPaymentGroup(""); setSearch(""); setPreparedFor(""); setError("");
  }
  async function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if ((billDates.period === "CUSTOM" && (!billDates.from || !billDates.to)) ||
        (paymentDates.period === "CUSTOM" && (!paymentDates.from || !paymentDates.to))) {
      setError("Choose both a start date and an end date for each custom date range."); return;
    }
    if ((billRange.from && billRange.to && billRange.from > billRange.to) ||
        (paidRange.from && paidRange.to && paidRange.from > paidRange.to)) {
      setError("The end date must be on or after the start date."); return;
    }
    const currentRequest = ++requestId.current;
    setLoading(true); setProgress(0);
    const rows: ReportRow[] = [];
    const seenIds = new Set<string>();
    const descriptions = [
      `Bill dates: ${dateDescription(billDates)}`, `Payment dates: ${dateDescription(paymentDates)}`,
      `Status: ${status === "ALL" ? "All bills" : status === "PAID" ? "Paid" : "Unpaid"}`,
      `Distributor: ${distributors.find((d) => d._id === distributorId)?.name ?? "All distributors"}`,
    ];
    if (bankAccountId) descriptions.push(`Bank: ${banks.find((b) => b._id === bankAccountId)?.bankName ?? "Selected bank"}`);
    if (paymentGroup.trim()) descriptions.push(`Payment group: ${paymentGroup.trim()}`);
    if (search.trim()) descriptions.push(`Search: ${search.trim()}`);
    try {
      let cursor: string | null = null;
      for (;;) {
        const page: { page: ReportRow[]; isDone: boolean; continueCursor: string } = await convex.query(api.reports.listReportPage, { ...filters, paginationOpts: { cursor, numItems: 100 } });
        if (requestId.current !== currentRequest) return;
        for (const row of page.page) {
          if (!seenIds.has(row._id)) { seenIds.add(row._id); rows.push(row); }
        }
        setProgress(rows.length);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      setReport({ rows, fingerprint, outletName: outlet.name, preparedFor: preparedFor.trim(), generatedAt: new Date().toLocaleString("en-IN"), filters: descriptions });
      requestAnimationFrame(() => statementRef.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
    } catch (err) {
      if (requestId.current === currentRequest) setError(userErrorMessage(err, "Could not generate the report. Please try again."));
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }
  function downloadCsv() {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([reportCsv(report.rows, report.outletName)], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a"); link.href = url; link.download = `mybilling-statement-${todayIso()}.csv`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className="page-stack reports-page">
    <header className="page-heading"><p className="eyebrow">Statements & records</p><h1>Reports</h1><p>Build a bill statement with payment dates and payment groups.</p></header>
    <form className="surface reports-controls" noValidate onSubmit={(event) => void generate(event)}>
      <div className="results-heading"><h2>Choose your report</h2><button type="button" className="text-action" disabled={loading} onClick={resetFilters}>Reset filters</button></div>
      <fieldset disabled={loading} className="report-filter-fields">
        <div className="report-filter-grid">
          <label className="field"><span>Bill status</span><select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}><option value="ALL">All bills</option><option value="PAID">Paid bills</option><option value="UNPAID">Unpaid bills</option></select></label>
          <label className="field"><span>Distributor</span><select value={distributorId} onChange={(e) => setDistributorId(e.target.value)}><option value="">All distributors</option>{distributors.map((d) => <option key={d._id} value={d._id}>{d.name}{d.active ? "" : " (inactive)"}</option>)}</select></label>
        </div>
        <ReportDateRange label="Bill date" value={billDates} onChange={setBillDates} />
        <details className="report-more-filters"><summary><SlidersHorizontal size={16} />Payment dates & more filters<Chevron /></summary><div className="report-filter-fields">
          <ReportDateRange label="Payment date" value={paymentDates} onChange={setPaymentDates} />
          <label className="field"><span>Bank account</span><select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}><option value="">All bank accounts</option>{banks.map((b) => <option key={b._id} value={b._id}>{b.bankName} · {b.maskedAccount}{b.active ? "" : " (inactive)"}</option>)}</select></label>
          <label className="field"><span>Payment group reference</span><input placeholder="e.g. PAY-1234ABCD" value={paymentGroup} onChange={(e) => setPaymentGroup(e.target.value)} /></label>
          <label className="field"><span>Search bills</span><input type="search" placeholder="Bill number, distributor or amount" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <label className="field"><span>Prepared for (optional)</span><input placeholder="Customer or business name" value={preparedFor} onChange={(e) => setPreparedFor(e.target.value)} /></label>
        </div></details>
      </fieldset>
      <p className="report-filter-hint">Payment dates, bank accounts and payment groups match paid bills only.</p>
      {error ? <p className="form-error error-notice" role="alert">{error}</p> : null}
      <button className="primary-button" disabled={loading} type="submit">{loading ? "Generating report…" : "Generate report"}</button>
      {loading ? <div className="report-progress" role="status"><span>{progress} matching bills loaded…</span><button type="button" className="text-action" onClick={() => { requestId.current++; setLoading(false); }}>Cancel</button></div> : null}
    </form>
    {stale ? <p className="compact-note report-status" role="status">Filters have changed. Generate the report again to update the statement below.</p> : null}
    {report ? <>
      <div className="report-actions"><button type="button" className="ghost-button" disabled={loading || stale || !report.rows.length} onClick={downloadCsv}><Download size={17} />Download CSV</button><button type="button" className="primary-button" disabled={loading || stale || !report.rows.length} onClick={() => window.print()}><Printer size={17} />Print / Save PDF</button></div>
      <div className="status-tabs report-view-tabs" aria-label="Report view">{([["BILLS", "Bills"], ["GROUPS", "Payment groups"], ["TABLE", "Table"]] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</div>
      <ReportStatement report={report} view={view} statementRef={statementRef} />
    </> : <div className="empty-state report-placeholder"><FileText size={24} /><strong>Your statement starts here</strong><span>Choose filters and generate a report. All matching bills will be included.</span></div>}
  </section>;
}

function Chevron() { return <span aria-hidden="true" className="report-chevron">⌄</span>; }
function ReportDateRange({ label, value, onChange }: { label: string; value: DateRange; onChange: (range: DateRange) => void }) {
  return <div className="report-date-range"><label className="field"><span>{label}</span><select value={value.period} onChange={(e) => onChange({ ...value, period: e.target.value as DateRange["period"] })}><option value="ALL">All time</option><option value="THIS_MONTH">This month</option><option value="LAST_MONTH">Last month</option><option value="CUSTOM">Custom dates</option></select></label>{value.period === "CUSTOM" ? <div className="report-filter-grid"><label className="field"><span>{label} from</span><input required type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} /></label><label className="field"><span>{label} to</span><input required type="date" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value })} /></label></div> : null}</div>;
}

function ReportStatement({ report, view, statementRef }: { report: GeneratedReport; view: "BILLS" | "GROUPS" | "TABLE"; statementRef: Ref<HTMLElement> }) {
  const summary = summarizeReport(report.rows);
  const groups = groupReportRows(report.rows);
  return <article ref={statementRef} className={`report-document report-mode-${view.toLowerCase()}`} aria-label="Generated billing statement">
    <header className="statement-heading"><div><span className="statement-brand">MyBilling</span><h2>Bill & payment statement</h2><strong>{report.outletName}</strong>{report.preparedFor ? <p>Prepared for: {report.preparedFor}</p> : null}</div><p className="statement-timestamp">Generated {report.generatedAt}</p></header>
    <div className="statement-filters">{report.filters.map((filter) => <span key={filter}>{filter}</span>)}</div>
    <div className="report-metrics"><div><span>Bills included</span><strong>{summary.billCount}</strong><small>{summary.paidCount} paid · {summary.unpaidCount} unpaid</small></div><div><span>Bill value</span><strong>{formatCurrency(summary.billAmountPaise)}</strong></div><div><span>Recorded paid</span><strong>{formatCurrency(summary.paidAmountPaise)}</strong><small>{summary.paymentGroupCount} payment group{summary.paymentGroupCount === 1 ? "" : "s"}</small></div><div><span>Unpaid value</span><strong>{formatCurrency(summary.unpaidAmountPaise)}</strong></div></div>
    {summary.missingSnapshots ? <p className="form-error" role="alert">{summary.missingSnapshots} paid bill(s) have no payment snapshot. Their paid amounts are unavailable and excluded from the paid total.</p> : null}
    {!report.rows.length ? <div className="empty-state"><strong>No matching bills</strong><span>Adjust the filters and generate a new report.</span></div> : null}
    <div className="report-bill-cards">{report.rows.map((row) => <article className="report-bill-card" key={row._id}><div className="ledger-row-top"><strong>#{row.billNumber}</strong><span className={row.status === "PAID" ? "badge paid" : "badge unpaid"}>{row.status === "PAID" ? "Paid" : "Unpaid"}</span></div><p>{row.distributor?.name ?? "Unavailable distributor"}</p><div className="report-bill-meta"><div><span>Bill date</span><strong>{formatDateLabel(row.billDate)}</strong></div><div><span>Bill amount</span><strong className="money">{formatCurrency(row.amountPaise)}</strong></div><div><span>Payment group</span><strong>{row.paymentReference ?? "—"}</strong></div><div><span>Payment date</span><strong>{row.payment ? formatDateLabel(row.payment.paymentDate) : "—"}</strong></div><div><span>Paid against bill</span><strong className="money">{row.paidAmountPaise === null ? "—" : formatCurrency(row.paidAmountPaise)}</strong></div><div><span>Bank</span><strong>{row.bankAccount ? `${row.bankAccount.bankName} · ****${row.bankAccount.accountLast4}` : "—"}</strong></div></div></article>)}</div>
    <section className="report-bill-table"><h3>Bill details</h3><p className="table-scroll-hint">Swipe across the table to see every column.</p><div className="report-table-scroll"><table><caption>Individual bills and their recorded payments</caption><thead><tr><th scope="col">Bill no.</th><th scope="col">Bill date</th><th scope="col">Distributor</th><th scope="col">Status</th><th scope="col">Bill amount</th><th scope="col">Paid against bill</th><th scope="col">Payment group</th><th scope="col">Payment date</th><th scope="col">Group total*</th><th scope="col">Bank / account</th></tr></thead><tbody>{report.rows.map((row) => <tr key={row._id}><td>{row.billNumber}</td><td>{formatDateLabel(row.billDate)}</td><td>{row.distributor?.name ?? "—"}</td><td>{row.status === "PAID" ? "Paid" : "Unpaid"}</td><td className="money">{formatCurrency(row.amountPaise)}</td><td className="money">{row.paidAmountPaise === null ? "—" : formatCurrency(row.paidAmountPaise)}</td><td title={row.payment?._id}>{row.paymentReference ?? "—"}</td><td>{row.payment ? formatDateLabel(row.payment.paymentDate) : "—"}</td><td className="money">{row.payment ? formatCurrency(row.payment.totalAmountPaise) : "—"}</td><td>{row.bankAccount ? `${row.bankAccount.bankName} · ****${row.bankAccount.accountLast4}` : "—"}</td></tr>)}</tbody></table></div></section>
    <section className="report-payment-groups"><h3>Payment groups <span className="count-label">{groups.length}</span></h3>{groups.length ? groups.map((group) => <article className="report-group" key={group.id}><header><div><strong>{group.reference}</strong><span>{group.distributor}</span><time>{formatDateLabel(group.paymentDate)}</time></div><div><span>Recorded group total</span><strong className="money">{formatCurrency(group.groupTotalPaise)}</strong></div></header><p>{group.bank}</p><div className="report-group-lines">{group.rows.map((row) => <div key={row._id}><span>#{row.billNumber}</span><strong className="money">{row.paidAmountPaise === null ? "Unavailable" : formatCurrency(row.paidAmountPaise)}</strong></div>)}</div><footer>{group.rows.length} bill{group.rows.length === 1 ? "" : "s"} included · Paid against these bills: <strong>{formatCurrency(group.includedPaidPaise)}</strong></footer></article>) : <p className="compact-note">No recorded payments match this report.</p>}{summary.unpaidCount ? <p className="compact-note">{summary.unpaidCount} unpaid bills have no payment group. See the Bills or Table view for their details.</p> : null}</section>
    {groups.length ? <section className="report-group-print-table"><h3>Payment group summary</h3><table><thead><tr><th>Group</th><th>Distributor</th><th>Payment date</th><th>Bills included</th><th>Paid against included bills</th><th>Recorded group total</th><th>Bank</th></tr></thead><tbody>{groups.map((group) => <tr key={group.id}><td>{group.reference}</td><td>{group.distributor}</td><td>{formatDateLabel(group.paymentDate)}</td><td>{group.rows.length}</td><td className="money">{formatCurrency(group.includedPaidPaise)}</td><td className="money">{formatCurrency(group.groupTotalPaise)}</td><td>{group.bank}</td></tr>)}</tbody></table></section> : null}
    <footer className="statement-notes"><p>* A payment-group total covers the entire payment and may repeat across bills. Use “Paid against bill” to total individual bill payments.</p><p>Paid amounts reflect the original payment record. Bill amounts reflect the current bill details. A filtered report may include only part of a payment group.</p><span>End of statement · {summary.billCount} bill{summary.billCount === 1 ? "" : "s"}</span></footer>
  </article>;
}
