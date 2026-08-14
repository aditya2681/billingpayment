import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
} from "convex/react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import {
  Building2,
  CircleDollarSign,
  CreditCard,
  Download,
  FilePlus2,
  Files,
  LayoutDashboard,
  LogOut,
  Plus,
  ReceiptIndianRupee,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import {
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import {
  formatCurrency,
  formatDateLabel,
  fromPaise,
  toPaise,
  todayIso,
} from "./lib/format";
import { shareReceipt } from "./lib/receipt";

type Profile = Doc<"profiles">;

export default function App() {
  return (
    <>
      <AuthLoading>
        <FullscreenMessage title="Checking session" subtitle="Loading MyBilling..." />
      </AuthLoading>
      <Unauthenticated>
        <Routes>
          <Route path="/register-owner" element={<RegisterOwnerPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Unauthenticated>
      <Authenticated>
        <Routes>
          <Route path="/register-owner" element={<RegisterOwnerPage />} />
          <Route path="/select-outlet" element={<SelectOutletPage />} />
          <Route path="/app/:outletId/*" element={<OutletLayout />} />
          <Route path="*" element={<AuthRedirect />} />
        </Routes>
      </Authenticated>
    </>
  );
}

function AuthRedirect() {
  const current = useQuery(api.users.getCurrentUser, {});
  if (current === undefined) {
    return <FullscreenMessage title="Preparing workspace" subtitle="Loading your business data..." />;
  }

  if (current.profile.role === "OWNER" && current.accessibleOutlets.length === 0) {
    return <Navigate to="/select-outlet" replace />;
  }

  if (current.accessibleOutlets.length === 1) {
    return <Navigate to={`/app/${current.accessibleOutlets[0]._id}`} replace />;
  }

  return <Navigate to="/select-outlet" replace />;
}

function LoginPage() {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const formData = new FormData(event.currentTarget);
    formData.set("flow", "signIn");
    try {
      const result = await signIn("password", formData);
      if (result.signingIn) {
        navigate("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Simple shop bill management"
      title="Track bills. Record payments. Stay outlet-ready."
      subtitle="One secure login for owners and employees."
    >
      <form className="auth-card" onSubmit={onSubmit}>
        <BrandBlock />
        <label className="field">
          <span>Login Identifier</span>
          <input name="email" placeholder="phone or username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" disabled={loading} type="submit">
          {loading ? "Signing In..." : "Sign In"}
        </button>
        <Link className="text-link" to="/register-owner">
          Create Owner Account
        </Link>
      </form>
    </AuthShell>
  );
}

function RegisterOwnerPage() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const bootstrapOwner = useMutation(api.users.bootstrapOwner);
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<{ name: string; loginIdentifier: string } | null>(() => {
    const stored = sessionStorage.getItem("pendingOwnerRegistration");
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (!isAuthenticated || pending === null) return;
    void bootstrapOwner(pending)
      .then(() => {
        sessionStorage.removeItem("pendingOwnerRegistration");
        setPending(null);
        navigate("/select-outlet", { replace: true });
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not finish registration."));
  }, [bootstrapOwner, isAuthenticated, navigate, pending]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "").trim();
    const loginIdentifier = String(formData.get("email") ?? "").trim();

    formData.set("flow", "signUp");
    try {
      sessionStorage.setItem(
        "pendingOwnerRegistration",
        JSON.stringify({ name, loginIdentifier }),
      );
      setPending({ name, loginIdentifier });
      await signIn("password", formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create owner account.");
      sessionStorage.removeItem("pendingOwnerRegistration");
      setPending(null);
      setSaving(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Owner onboarding"
      title="Create your MyBilling workspace"
      subtitle="Your first outlet comes right after this step."
    >
      <form className="auth-card" onSubmit={onSubmit}>
        <BrandBlock />
        <label className="field">
          <span>Owner Name</span>
          <input name="name" placeholder="Aditya Stores" required />
        </label>
        <label className="field">
          <span>Login Identifier</span>
          <input name="email" placeholder="mobile or username" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input name="password" type="password" required />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" disabled={saving} type="submit">
          {saving ? "Creating..." : "Create Account"}
        </button>
        <Link className="text-link" to="/login">
          Back to Sign In
        </Link>
      </form>
    </AuthShell>
  );
}

function SelectOutletPage() {
  const current = useQuery(api.users.getCurrentUser, {});
  const createOutlet = useMutation(api.outlets.createOutlet);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (current === undefined) {
    return <FullscreenMessage title="Loading outlets" subtitle="Checking your accessible outlets..." />;
  }

  if (current.accessibleOutlets.length === 1) {
    return <Navigate to={`/app/${current.accessibleOutlets[0]._id}`} replace />;
  }

  async function handleCreateOutlet(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const outletId = await createOutlet({ name, address });
      navigate(`/app/${outletId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create outlet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="selection-shell">
      <div className="selection-panel">
        <BrandBlock />
        <div className="panel-header">
          <div>
            <p className="eyebrow">Outlet context</p>
            <h1>Select Outlet</h1>
            <p>Everything inside MyBilling stays scoped to the outlet you choose.</p>
          </div>
        </div>
        <div className="outlet-grid">
          {current.accessibleOutlets.map((outlet) => (
            <button
              className="outlet-card"
              key={outlet._id}
              onClick={() => navigate(`/app/${outlet._id}`)}
              type="button"
            >
              <Store size={20} />
              <strong>{outlet.name}</strong>
              <span>{outlet.address || "Address can be added later"}</span>
            </button>
          ))}
        </div>

        {current.profile.role === "OWNER" ? (
          <form className="inline-form" onSubmit={handleCreateOutlet}>
            <div className="inline-form-header">
              <h2>{current.accessibleOutlets.length === 0 ? "Create First Outlet" : "Add New Outlet"}</h2>
              <p>Owners can create outlets and switch between them later.</p>
            </div>
            <label className="field">
              <span>Outlet Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Address</span>
              <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={3} />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button" disabled={saving} type="submit">
              {saving ? "Saving..." : "Create Outlet"}
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function OutletLayout() {
  const { outletId } = useParams();
  const current = useQuery(api.users.getCurrentUser, {});
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation();

  if (!outletId) return <Navigate to="/" replace />;
  if (current === undefined) {
    return <FullscreenMessage title="Loading outlet" subtitle="Preparing your dashboard..." />;
  }

  const activeOutlet = current.accessibleOutlets.find((item) => item._id === outletId);
  if (!activeOutlet) {
    return <Navigate to="/select-outlet" replace />;
  }

  const ownerLinks = [
    { to: `/app/${outletId}`, label: "Dashboard", icon: LayoutDashboard },
    { to: `/app/${outletId}/bills/new`, label: "Add Bill", icon: FilePlus2 },
    { to: `/app/${outletId}/payments/new`, label: "Payments", icon: ReceiptIndianRupee },
    { to: `/app/${outletId}/bills`, label: "View Bills", icon: Files },
    { to: `/app/${outletId}/distributors`, label: "Distributors", icon: Building2 },
    { to: `/app/${outletId}/bank-accounts`, label: "Bank Accounts", icon: CreditCard },
    { to: `/app/${outletId}/outlets`, label: "Outlets", icon: Store },
    { to: `/app/${outletId}/employees`, label: "Employees", icon: Users },
  ];
  const employeeLinks = [
    { to: `/app/${outletId}`, label: "Home", icon: LayoutDashboard },
    { to: `/app/${outletId}/bills/new`, label: "Add Bill", icon: FilePlus2 },
  ];
  const navLinks = current.profile.role === "OWNER" ? ownerLinks : employeeLinks;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <BrandBlock compact />
        <nav className="sidebar-nav">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const active = location.pathname === link.to;
            return (
              <Link className={active ? "nav-link active" : "nav-link"} key={link.to} to={link.to}>
                <Icon size={18} />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <button
          className="ghost-button"
          onClick={() => {
            void signOut().then(() => navigate("/login"));
          }}
          type="button"
        >
          <LogOut size={18} />
          Sign Out
        </button>
      </aside>

      <main className="main-shell">
        <header className="app-header">
          <div className="app-header-copy">
            <div className="mobile-brand-row">
              <BrandBlock compact />
              <button
                className="ghost-button mobile-signout"
                onClick={() => {
                  void signOut().then(() => navigate("/login"));
                }}
                type="button"
              >
                <LogOut size={16} />
              </button>
            </div>
            <p className="eyebrow">Current Outlet</p>
            <h1>{activeOutlet.name}</h1>
          </div>
          <div className="header-actions">
            <SearchableSelect
              className="outlet-switcher"
              label="Outlet"
              options={current.accessibleOutlets.map((outlet) => ({
                value: outlet._id,
                label: outlet.name,
                description: outlet.address ?? "No address",
              }))}
              value={activeOutlet._id}
              onChange={(value) => navigate(`/app/${value}`)}
            />
            <button className="ghost-button" onClick={() => navigate("/select-outlet")} type="button">
              Switch Outlet
            </button>
          </div>
        </header>

        <Routes>
          <Route index element={<DashboardPage outlet={activeOutlet} current={current} />} />
          <Route path="bills/new" element={<BillFormPage current={current} outlet={activeOutlet} />} />
          <Route path="bills/:billId/edit" element={<BillFormPage current={current} outlet={activeOutlet} />} />
          <Route path="bills" element={<ViewBillsPage current={current} outlet={activeOutlet} />} />
          <Route path="bills/:billId" element={<BillDetailsPage current={current} />} />
          <Route path="payments/new" element={<PaymentStartPage current={current} outlet={activeOutlet} />} />
          <Route path="payments/pending" element={<PendingBillsPage current={current} outlet={activeOutlet} />} />
          <Route path="payments/summary" element={<PaymentSummaryPage current={current} outlet={activeOutlet} />} />
          <Route path="payments/:paymentId/success" element={<PaymentSuccessPage current={current} />} />
          <Route path="distributors" element={<DistributorsPage />} />
          <Route path="bank-accounts" element={<BankAccountsPage />} />
          <Route path="outlets" element={<OutletsPage />} />
          <Route path="employees" element={<EmployeesPage />} />
        </Routes>
        <nav className="mobile-bottom-nav">
          {navLinks.slice(0, current.profile.role === "OWNER" ? 5 : 2).map((link) => {
            const Icon = link.icon;
            const active = location.pathname === link.to;
            return (
              <Link
                className={active ? "mobile-nav-link active" : "mobile-nav-link"}
                key={link.to}
                to={link.to}
              >
                <Icon size={18} />
                <span>{link.label === "Dashboard" ? "Home" : link.label}</span>
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}

function DashboardPage({
  outlet,
  current,
}: {
  outlet: Doc<"outlets">;
  current: { profile: Profile; accessibleOutlets: Doc<"outlets">[] };
}) {
  const stats = useQuery(api.bills.dashboardBillStats, { outletId: outlet._id });
  const navigate = useNavigate();
  if (stats === undefined) return <CardSkeleton title="Loading dashboard" />;

  return (
    <div className="page-stack">
      <section className="stats-grid">
        <StatsCard label="Total Bills" value={String(stats.totalBills)} accent="blue" />
        <StatsCard label="Unpaid Bills" value={formatCurrency(stats.unpaidAmountPaise)} accent="red" />
        <StatsCard label="Paid Bills" value={formatCurrency(stats.paidAmountPaise)} accent="green" />
        <StatsCard label="Role" value={current.profile.role === "OWNER" ? "Owner" : "Employee"} accent="gold" />
      </section>

      <section className="content-grid">
        <div className="surface">
          <div className="section-head">
            <div>
              <p className="eyebrow">Recent activity</p>
              <h2>Recent Bills</h2>
            </div>
            {current.profile.role === "OWNER" ? (
              <button className="ghost-button" onClick={() => navigate(`bills`)} type="button">
                View all
              </button>
            ) : null}
          </div>
          <div className="bill-list">
            {stats.recentBills.map((bill) => (
              <div className="bill-row" key={bill._id}>
                <div>
                  <strong>{bill.billNumber}</strong>
                  <span>{formatDateLabel(bill.billDate)}</span>
                </div>
                <div className="row-end">
                  <strong>{formatCurrency(bill.amountPaise)}</strong>
                  <span className={bill.status === "PAID" ? "badge paid" : "badge unpaid"}>
                    {bill.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="surface">
          <div className="section-head">
            <div>
              <p className="eyebrow">Fast actions</p>
              <h2>Quick Actions</h2>
            </div>
          </div>
          <div className="quick-actions">
            <Link className="quick-action blue" to="bills/new">
              <Plus size={18} /> Add New Bill
            </Link>
            {current.profile.role === "OWNER" ? (
              <>
                <Link className="quick-action green" to="payments/new">
                  <ReceiptIndianRupee size={18} /> Make Payment
                </Link>
                <Link className="quick-action orange" to="bills">
                  <Files size={18} /> View Bills
                </Link>
              </>
            ) : (
              <div className="hint-card">
                <ShieldCheck size={18} />
                Employees can create and edit bills in assigned outlets only.
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function BillFormPage({
  current,
  outlet,
}: {
  current: { profile: Profile };
  outlet: Doc<"outlets">;
}) {
  const { billId } = useParams();
  const distributors = useQuery(api.distributors.listDistributors, { activeOnly: true });
  const billData = useQuery(api.bills.getBill, billId ? { billId: billId as Id<"bills"> } : "skip");
  const createBill = useMutation(api.bills.createBill);
  const updateBill = useMutation(api.bills.updateBill);
  const deleteBill = useMutation(api.bills.deleteUnpaidBill);
  const isEdit = Boolean(billId);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const initialForm = billData
    ? {
        distributorId: billData.bill.distributorId,
        billNumber: billData.bill.billNumber,
        billDate: billData.bill.billDate,
        amount: fromPaise(billData.bill.amountPaise),
      }
    : {
        distributorId: "",
        billNumber: "",
        billDate: todayIso(),
        amount: "",
      };

  return (
    <section className="page-form surface">
      <div className="section-head">
        <div>
          <p className="eyebrow">{isEdit ? "Correct bill information" : "Capture distributor bills fast"}</p>
          <h2>{isEdit ? "Edit Bill" : "Add Bill"}</h2>
        </div>
      </div>
      <BillFormFields
        createBill={createBill}
        current={current}
        deleteBill={deleteBill}
        distributors={distributors ?? []}
        error={error}
        initialForm={initialForm}
        isEdit={isEdit}
        outlet={outlet}
        saving={saving}
        setError={setError}
        setSaving={setSaving}
        updateBill={updateBill}
      />
    </section>
  );
}

function ViewBillsPage({
  current,
  outlet,
}: {
  current: { profile: Profile };
  outlet: Doc<"outlets">;
}) {
  const distributors = useQuery(api.distributors.listDistributors, { activeOnly: true }) ?? [];
  const [filters, setFilters] = useState({
    status: "ALL" as "ALL" | "UNPAID" | "PAID",
    distributorId: "",
    datePreset: "THIS_MONTH" as "THIS_MONTH" | "PREV_MONTH" | "DATE_RANGE" | "ALL_TIME",
    fromDate: "",
    toDate: "",
    search: "",
  });
  const dateFilters = useMemo(() => {
    if (filters.datePreset === "ALL_TIME") {
      return { fromDate: undefined, toDate: undefined };
    }
    if (filters.datePreset === "DATE_RANGE") {
      return {
        fromDate: filters.fromDate || undefined,
        toDate: filters.toDate || undefined,
      };
    }
    const referenceDate =
      filters.datePreset === "PREV_MONTH" ? subMonths(new Date(), 1) : new Date();
    return {
      fromDate: format(startOfMonth(referenceDate), "yyyy-MM-dd"),
      toDate: format(endOfMonth(referenceDate), "yyyy-MM-dd"),
    };
  }, [filters.datePreset, filters.fromDate, filters.toDate]);
  const bills = useQuery(api.bills.listBills, {
    outletId: outlet._id,
    status: filters.status,
    distributorId: filters.distributorId ? (filters.distributorId as Id<"distributors">) : undefined,
    fromDate: dateFilters.fromDate,
    toDate: dateFilters.toDate,
    search: filters.search || undefined,
  });
  const navigate = useNavigate();

  if (current.profile.role !== "OWNER") {
    return <AccessDenied />;
  }

  return (
    <section className="page-stack">
      <div className="surface">
        <div className="section-head">
          <div>
            <p className="eyebrow">Visible filters by default</p>
            <h2>View Bills</h2>
          </div>
        </div>
        <div className="filter-grid">
          <div className="segment-group">
            {(["ALL", "UNPAID", "PAID"] as const).map((status) => (
              <button
                className={filters.status === status ? "segment active" : "segment"}
                key={status}
                onClick={() => setFilters((curr) => ({ ...curr, status }))}
                type="button"
              >
                {status === "ALL" ? "All" : status === "UNPAID" ? "Unpaid" : "Paid"}
              </button>
            ))}
          </div>
          <SearchableSelect
            label="Distributor"
            options={[{ value: "", label: "All Distributors" }, ...distributors.map((item) => ({ value: item._id, label: item.name }))]}
            value={filters.distributorId}
            onChange={(value) => setFilters((curr) => ({ ...curr, distributorId: value }))}
          />
          <div className="segment-group">
            {([
              ["THIS_MONTH", "This Month"],
              ["PREV_MONTH", "Prev Month"],
              ["DATE_RANGE", "Date Range"],
              ["ALL_TIME", "All Time"],
            ] as const).map(([value, label]) => (
              <button
                className={filters.datePreset === value ? "segment active" : "segment"}
                key={value}
                onClick={() => setFilters((curr) => ({ ...curr, datePreset: value }))}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          {filters.datePreset === "DATE_RANGE" ? (
            <div className="date-row">
              <FieldInput label="From" type="date" value={filters.fromDate} onChange={(value) => setFilters((curr) => ({ ...curr, fromDate: value }))} />
              <FieldInput label="To" type="date" value={filters.toDate} onChange={(value) => setFilters((curr) => ({ ...curr, toDate: value }))} />
            </div>
          ) : null}
          <FieldInput label="Search" value={filters.search} onChange={(value) => setFilters((curr) => ({ ...curr, search: value }))} placeholder="bill no, distributor or amount" />
        </div>
      </div>

      <div className="surface">
        <div className="section-head">
          <div>
            <p className="eyebrow">Filtered results</p>
            <h2>{bills?.length ?? 0} Bills</h2>
          </div>
          <button
            className="ghost-button"
            disabled={!bills || bills.length === 0}
            onClick={() => exportBillsCsv(bills ?? [])}
            type="button"
          >
            <Download size={18} />
            Export
          </button>
        </div>
        <div className="bill-list">
          {(bills ?? []).map((item) => (
            <button className="bill-card" key={item._id} onClick={() => navigate(`/app/${outlet._id}/bills/${item._id}`)} type="button">
              <div>
                <strong>{item.billNumber}</strong>
                <span>{item.distributor?.name}</span>
                <small>{formatDateLabel(item.billDate)}</small>
              </div>
              <div className="row-end">
                <strong>{formatCurrency(item.amountPaise)}</strong>
                <span className={item.status === "PAID" ? "badge paid" : "badge unpaid"}>{item.status}</span>
              </div>
            </button>
          ))}
          {bills?.length === 0 ? <EmptyState title="No bills match these filters." subtitle="Try clearing the distributor, date or search filters." /> : null}
        </div>
      </div>
    </section>
  );
}

function BillDetailsPage({ current }: { current: { profile: Profile } }) {
  const { billId, outletId } = useParams();
  const data = useQuery(api.bills.getBill, billId ? { billId: billId as Id<"bills"> } : "skip");
  if (current.profile.role !== "OWNER") return <AccessDenied />;
  if (data === undefined) return <CardSkeleton title="Loading bill" />;

  return (
    <section className="surface page-stack">
      <div className="section-head">
        <div>
          <p className="eyebrow">Bill details</p>
          <h2>{data.bill.billNumber}</h2>
        </div>
        <Link className="ghost-button" to={`/app/${outletId}/bills/${data.bill._id}/edit`}>
          Edit Bill
        </Link>
      </div>
      <InfoGrid
        items={[
          ["Distributor", data.distributor?.name ?? "-"],
          ["Bill Date", formatDateLabel(data.bill.billDate)],
          ["Amount", formatCurrency(data.bill.amountPaise)],
          ["Status", data.bill.status],
          ["Payment Date", data.payment?.paymentDate ? formatDateLabel(data.payment.paymentDate) : "-"],
          ["Bank Account", data.bankAccount ? `${data.bankAccount.bankName} - ****${data.bankAccount.accountLast4}` : "-"],
        ]}
      />
    </section>
  );
}

function PaymentStartPage({
  current,
  outlet,
}: {
  current: { profile: Profile };
  outlet: Doc<"outlets">;
}) {
  const [search, setSearch] = useState("");
  const pendingDistributorSummaries =
    useQuery(api.bills.listPendingDistributorSummaries, {
      outletId: outlet._id,
      search: search || undefined,
    }) ?? [];
  const navigate = useNavigate();
  const [distributorId, setDistributorId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayIso());

  if (current.profile.role !== "OWNER") return <AccessDenied />;

  return (
    <section className="surface page-form">
      <div className="section-head">
        <div>
          <p className="eyebrow">Start with what is pending</p>
          <h2>Choose Distributor for Payment</h2>
          <p>See pending bill count and total amount before you pick a distributor.</p>
        </div>
      </div>
      <div className="stack-form">
        <FieldInput
          label="Search Distributor"
          value={search}
          onChange={setSearch}
          placeholder="search by distributor, pending count or amount"
        />
        <FieldInput
          label="Payment Date"
          type="date"
          value={paymentDate}
          onChange={setPaymentDate}
        />
        <div className="pending-distributor-list">
          {pendingDistributorSummaries.map((item) => (
            <button
              className={
                distributorId === item.distributorId
                  ? "pending-distributor-card selected"
                  : "pending-distributor-card"
              }
              key={item.distributorId}
              onClick={() => setDistributorId(item.distributorId)}
              type="button"
            >
              <div className="pending-distributor-main">
                <div className="pending-distributor-copy">
                  <strong>{item.distributor.name}</strong>
                  <div className="meta-badges">
                    <span className="soft-badge">
                      {item.billCount} pending bill{item.billCount > 1 ? "s" : ""}
                    </span>
                    <span className="soft-badge">Tap to select</span>
                  </div>
                </div>
                <div className="row-end">
                  <strong>{formatCurrency(item.totalAmountPaise)}</strong>
                  <span>Latest {formatDateLabel(item.latestBillDate)}</span>
                </div>
              </div>
            </button>
          ))}
          {pendingDistributorSummaries.length === 0 ? (
            <EmptyState
              title="No pending distributors found."
              subtitle="Try another search or check whether all bills are already paid."
            />
          ) : null}
        </div>
        <button
          className="primary-button"
          disabled={!distributorId}
          onClick={() =>
            navigate(
              `/app/${outlet._id}/payments/pending?distributorId=${distributorId}&paymentDate=${paymentDate}`,
            )
          }
          type="button"
        >
          Continue to Bill Selection
        </button>
      </div>
    </section>
  );
}

function PendingBillsPage({
  current,
  outlet,
}: {
  current: { profile: Profile };
  outlet: Doc<"outlets">;
}) {
  const [searchParams] = useSearchParams();
  const distributorId = searchParams.get("distributorId");
  const paymentDate = searchParams.get("paymentDate") ?? todayIso();
  const pendingBills = useQuery(
    api.bills.getPendingBills,
    distributorId ? { outletId: outlet._id, distributorId: distributorId as Id<"distributors"> } : "skip",
  );
  const navigate = useNavigate();

  if (current.profile.role !== "OWNER") return <AccessDenied />;
  if (!distributorId) return <Navigate to={`/app/${outlet._id}/payments/new`} replace />;
  if (pendingBills === undefined) return <CardSkeleton title="Loading pending bills" />;

  return (
    <PendingBillsContent
      distributorId={distributorId}
      navigate={navigate}
      outletId={outlet._id}
      paymentDate={paymentDate}
      pendingBills={pendingBills}
    />
  );
}

function PendingBillsContent({
  distributorId,
  navigate,
  outletId,
  paymentDate,
  pendingBills,
}: {
  distributorId: string;
  navigate: ReturnType<typeof useNavigate>;
  outletId: Id<"outlets">;
  paymentDate: string;
  pendingBills: Doc<"bills">[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const totalAmount = pendingBills
    .filter((bill) => selectedIds.includes(bill._id))
    .reduce((sum, bill) => sum + bill.amountPaise, 0);

  return (
    <section className="page-stack">
      <div className="surface">
        <div className="section-head">
          <div>
            <p className="eyebrow">Step 2 of 3</p>
            <h2>Pending Bills</h2>
          </div>
        </div>
        <div className="bill-list">
          <button
            className="ghost-button"
            onClick={() => setSelectedIds(pendingBills.map((bill) => bill._id))}
            type="button"
          >
            Select All
          </button>
          {pendingBills.map((bill) => (
            <label className="bill-select-row" key={bill._id}>
              <input
                checked={selectedIds.includes(bill._id)}
                onChange={(e) =>
                  setSelectedIds((curr) =>
                    e.target.checked ? [...curr, bill._id] : curr.filter((item) => item !== bill._id),
                  )
                }
                type="checkbox"
              />
              <div>
                <strong>{bill.billNumber}</strong>
                <span>{formatDateLabel(bill.billDate)}</span>
              </div>
              <strong>{formatCurrency(bill.amountPaise)}</strong>
            </label>
          ))}
          {pendingBills.length === 0 ? <EmptyState title="No unpaid bills found." subtitle="Try changing the distributor or outlet." /> : null}
        </div>
      </div>
      <div className="sticky-summary">
        <div>
          <strong>{selectedIds.length} bills selected</strong>
          <span>{formatCurrency(totalAmount)}</span>
        </div>
        <button
          className="primary-button"
          disabled={selectedIds.length === 0}
          onClick={() =>
            navigate(
              `/app/${outletId}/payments/summary?distributorId=${distributorId}&paymentDate=${paymentDate}&billIds=${selectedIds.join(",")}`,
            )
          }
          type="button"
        >
          Next
        </button>
      </div>
    </section>
  );
}

function PaymentSummaryPage({
  current,
  outlet,
}: {
  current: { profile: Profile };
  outlet: Doc<"outlets">;
}) {
  const [searchParams] = useSearchParams();
  const distributorId = searchParams.get("distributorId");
  const billIds = searchParams.get("billIds")?.split(",").filter(Boolean) ?? [];
  const pendingBills = useQuery(
    api.bills.getPendingBills,
    distributorId ? { outletId: outlet._id, distributorId: distributorId as Id<"distributors"> } : "skip",
  );
  const bankAccounts = useQuery(api.bankAccounts.listBankAccounts, { activeOnly: true }) ?? [];
  const recordPayment = useMutation(api.payments.recordPayment);
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(searchParams.get("paymentDate") ?? todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  if (current.profile.role !== "OWNER") return <AccessDenied />;
  if (!distributorId || pendingBills === undefined) return <CardSkeleton title="Loading payment summary" />;
  const selectedBills = pendingBills.filter((bill) => billIds.includes(bill._id));
  const totalAmount = selectedBills.reduce((sum, bill) => sum + bill.amountPaise, 0);

  async function handleRecordPayment() {
    setSubmitting(true);
    setError("");
    try {
      const result = await recordPayment({
        outletId: outlet._id,
        distributorId: distributorId as Id<"distributors">,
        bankAccountId: bankAccountId as Id<"bankAccounts">,
        paymentDate,
        billIds: selectedBills.map((bill) => bill._id),
      });
      navigate(`/app/${outlet._id}/payments/${result.paymentId}/success`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="surface page-stack">
      <div className="section-head">
        <div>
          <p className="eyebrow">Step 3 of 3</p>
          <h2>Payment Summary</h2>
        </div>
      </div>
      <div className="stack-form">
        <FieldInput label="Payment Date" type="date" value={paymentDate} onChange={setPaymentDate} />
        <SearchableSelect
          label="Bank Account"
          options={bankAccounts.map((item) => ({
            value: item._id,
            label: `${item.bankName} - ${item.maskedAccount}`,
            description: item.accountHolderName,
          }))}
          value={bankAccountId}
          onChange={setBankAccountId}
        />
        <div className="summary-box">
          <div className="summary-total">
            <div>
              <span>Total Amount</span>
              <strong>{formatCurrency(totalAmount)}</strong>
            </div>
            <button className="ghost-button" onClick={() => navigator.clipboard.writeText(String(totalAmount / 100))} type="button">
              Copy
            </button>
          </div>
          {selectedBills.map((bill) => (
            <div className="bill-row" key={bill._id}>
              <div>
                <strong>{bill.billNumber}</strong>
                <span>{formatDateLabel(bill.billDate)}</span>
              </div>
              <strong>{formatCurrency(bill.amountPaise)}</strong>
            </div>
          ))}
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button className="primary-button" disabled={!bankAccountId || submitting} onClick={handleRecordPayment} type="button">
          {submitting ? "Recording..." : "I Have Paid the Bill"}
        </button>
      </div>
    </section>
  );
}

function PaymentSuccessPage({ current }: { current: { profile: Profile } }) {
  const { paymentId } = useParams();
  const outletId = useParams().outletId;
  const payment = useQuery(api.payments.getPayment, paymentId ? { paymentId: paymentId as Id<"payments"> } : "skip");
  const receiptRef = useRef<HTMLDivElement>(null);

  if (current.profile.role !== "OWNER") return <AccessDenied />;
  if (payment === undefined) return <CardSkeleton title="Loading receipt" />;

  return (
    <section className="page-stack">
      <div className="success-card">
        <div className="success-icon">✓</div>
        <h2>Payment Recorded Successfully</h2>
        <p>{payment.payment.billCount} bills were marked paid.</p>
      </div>

      <div className="receipt-card" ref={receiptRef}>
        <BrandBlock compact />
        <InfoGrid
          items={[
            ["Distributor", payment.distributor?.name ?? "-"],
            ["Payment Date", formatDateLabel(payment.payment.paymentDate)],
            ["Bank Account", payment.bankAccount ? `${payment.bankAccount.bankName} - ****${payment.bankAccount.accountLast4}` : "-"],
            ["Total", formatCurrency(payment.payment.totalAmountPaise)],
          ]}
        />
        <div className="receipt-bills">
          {payment.bills.map((bill) => (
            <div className="bill-row" key={bill._id}>
              <span>{bill.billNumber}</span>
              <strong>{formatCurrency(bill.amountPaise)}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="button-row">
        <Link className="ghost-button" to={`/app/${outletId}`}>
          Done
        </Link>
        <button
          className="primary-button"
          onClick={() => {
            if (receiptRef.current) {
              void shareReceipt(receiptRef.current, `mybilling-payment-${payment.payment._id}.png`);
            }
          }}
          type="button"
        >
          Share Receipt
        </button>
      </div>
    </section>
  );
}

function DistributorsPage() {
  const distributors = useQuery(api.distributors.listDistributors, { activeOnly: false }) ?? [];
  const createDistributor = useMutation(api.distributors.createDistributor);
  const updateDistributor = useMutation(api.distributors.updateDistributor);
  const [form, setForm] = useState({ name: "", gstNumber: "", phone: "", address: "" });
  const [editing, setEditing] = useState<Doc<"distributors"> | null>(null);

  return (
    <MasterPage
      title="Distributors"
      subtitle="Owner-level distributor master shared across outlets."
      items={distributors.map((item) => ({
        id: item._id,
        title: item.name,
        subtitle: item.gstNumber,
        active: item.active,
        onEdit: () => {
          setEditing(item);
          setForm({
            name: item.name,
            gstNumber: item.gstNumber,
            phone: item.phone ?? "",
            address: item.address ?? "",
          });
        },
      }))}
      form={
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            const payload = {
              name: form.name,
              gstNumber: form.gstNumber,
              phone: form.phone || undefined,
              address: form.address || undefined,
            };
            if (editing) {
              void updateDistributor({ distributorId: editing._id, active: editing.active, ...payload }).then(() => setEditing(null));
            } else {
              void createDistributor(payload);
            }
            setForm({ name: "", gstNumber: "", phone: "", address: "" });
          }}
        >
          <FieldInput label="Distributor Name" value={form.name} onChange={(value) => setForm((curr) => ({ ...curr, name: value }))} />
          <FieldInput label="GST Number" value={form.gstNumber} onChange={(value) => setForm((curr) => ({ ...curr, gstNumber: value }))} />
          <FieldInput label="Phone" value={form.phone} onChange={(value) => setForm((curr) => ({ ...curr, phone: value }))} />
          <FieldInput label="Address" value={form.address} onChange={(value) => setForm((curr) => ({ ...curr, address: value }))} />
          <button className="primary-button" type="submit">{editing ? "Update Distributor" : "Save Distributor"}</button>
        </form>
      }
    />
  );
}

function BankAccountsPage() {
  const bankAccounts = useQuery(api.bankAccounts.listBankAccounts, { activeOnly: false }) ?? [];
  const createBankAccount = useMutation(api.bankAccounts.createBankAccount);
  const updateBankAccount = useMutation(api.bankAccounts.updateBankAccount);
  const [form, setForm] = useState({
    bankName: "",
    accountHolderName: "",
    accountNumber: "",
    ifscCode: "",
    nickname: "",
  });
  const [editing, setEditing] = useState<Doc<"bankAccounts"> | null>(null);

  return (
    <MasterPage
      title="Bank Accounts"
      subtitle="Accounts are masked by default and reusable across the owner's outlets."
      items={bankAccounts.map((item) => ({
        id: item._id,
        title: item.bankName,
        subtitle: `${item.accountHolderName} - ${item.maskedAccount}`,
        active: item.active,
        onEdit: () => {
          setEditing(item as unknown as Doc<"bankAccounts">);
          setForm({
            bankName: item.bankName,
            accountHolderName: item.accountHolderName,
            accountNumber: "",
            ifscCode: item.ifscCode,
            nickname: item.nickname ?? "",
          });
        },
      }))}
      form={
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            const payload = {
              bankName: form.bankName,
              accountHolderName: form.accountHolderName,
              accountNumber: form.accountNumber,
              ifscCode: form.ifscCode,
              nickname: form.nickname || undefined,
            };
            if (editing) {
              void updateBankAccount({ bankAccountId: editing._id, active: editing.active, ...payload }).then(() => setEditing(null));
            } else {
              void createBankAccount(payload);
            }
            setForm({ bankName: "", accountHolderName: "", accountNumber: "", ifscCode: "", nickname: "" });
          }}
        >
          <FieldInput label="Bank Name" value={form.bankName} onChange={(value) => setForm((curr) => ({ ...curr, bankName: value }))} />
          <FieldInput label="Account Holder Name" value={form.accountHolderName} onChange={(value) => setForm((curr) => ({ ...curr, accountHolderName: value }))} />
          <FieldInput label="Account Number" inputMode="numeric" value={form.accountNumber} onChange={(value) => setForm((curr) => ({ ...curr, accountNumber: value }))} />
          <FieldInput label="IFSC Code" value={form.ifscCode} onChange={(value) => setForm((curr) => ({ ...curr, ifscCode: value }))} />
          <FieldInput label="Nickname" value={form.nickname} onChange={(value) => setForm((curr) => ({ ...curr, nickname: value }))} />
          <button className="primary-button" type="submit">{editing ? "Update Bank Account" : "Save Bank Account"}</button>
        </form>
      }
    />
  );
}

function OutletsPage() {
  const outlets = useQuery(api.outlets.listAccessibleOutlets, {}) ?? [];
  const updateOutlet = useMutation(api.outlets.updateOutlet);
  const createOutlet = useMutation(api.outlets.createOutlet);
  const [form, setForm] = useState({ name: "", address: "" });
  const [editing, setEditing] = useState<Doc<"outlets"> | null>(null);

  return (
    <MasterPage
      title="Outlets"
      subtitle="Deactivate old outlets instead of deleting history."
      items={outlets.map((item) => ({
        id: item._id,
        title: item.name,
        subtitle: item.address ?? "No address",
        active: item.active,
        onEdit: () => {
          setEditing(item);
          setForm({ name: item.name, address: item.address ?? "" });
        },
      }))}
      form={
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (editing) {
              void updateOutlet({ outletId: editing._id, name: form.name, address: form.address || undefined, active: editing.active }).then(() => setEditing(null));
            } else {
              void createOutlet({ name: form.name, address: form.address || undefined });
            }
            setForm({ name: "", address: "" });
          }}
        >
          <FieldInput label="Outlet Name" value={form.name} onChange={(value) => setForm((curr) => ({ ...curr, name: value }))} />
          <FieldInput label="Address" value={form.address} onChange={(value) => setForm((curr) => ({ ...curr, address: value }))} />
          <button className="primary-button" type="submit">{editing ? "Update Outlet" : "Create Outlet"}</button>
        </form>
      }
    />
  );
}

function EmployeesPage() {
  const employees = useQuery(api.users.listEmployees, {}) ?? [];
  const outlets = useQuery(api.outlets.listAccessibleOutlets, {}) ?? [];
  const createEmployee = useAction(api.users.createEmployee);
  const [form, setForm] = useState({
    name: "",
    loginIdentifier: "",
    password: "",
    outletIds: [] as string[],
  });

  return (
    <MasterPage
      title="Employees"
      subtitle="Employees use the same sign-in page but only see bill entry/edit work."
      items={employees.map((item) => ({
        id: item.employee._id,
        title: item.employee.name,
        subtitle: `${item.employee.loginIdentifier} · ${item.outlets.map((outlet) => outlet.name).join(", ") || "No outlets"}`,
        active: item.employee.active,
        onEdit: () => {
          setForm({
            name: item.employee.name,
            loginIdentifier: item.employee.loginIdentifier,
            password: "",
            outletIds: item.outlets.map((outlet) => outlet._id),
          });
        },
      }))}
      form={
        <form
          className="stack-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createEmployee({
              name: form.name,
              loginIdentifier: form.loginIdentifier,
              password: form.password,
              outletIds: form.outletIds as Id<"outlets">[],
            });
            setForm({ name: "", loginIdentifier: "", password: "", outletIds: [] });
          }}
        >
          <FieldInput label="Employee Name" value={form.name} onChange={(value) => setForm((curr) => ({ ...curr, name: value }))} />
          <FieldInput label="Login Identifier" value={form.loginIdentifier} onChange={(value) => setForm((curr) => ({ ...curr, loginIdentifier: value }))} />
          <FieldInput label="Initial Password" type="password" value={form.password} onChange={(value) => setForm((curr) => ({ ...curr, password: value }))} />
          <fieldset className="checkbox-group">
            <legend>Assigned Outlets</legend>
            {outlets.map((outlet) => (
              <label className="checkbox-row" key={outlet._id}>
                <input
                  checked={form.outletIds.includes(outlet._id)}
                  onChange={(e) =>
                    setForm((curr) => ({
                      ...curr,
                      outletIds: e.target.checked
                        ? [...curr.outletIds, outlet._id]
                        : curr.outletIds.filter((item) => item !== outlet._id),
                    }))
                  }
                  type="checkbox"
                />
                {outlet.name}
              </label>
            ))}
          </fieldset>
          <button className="primary-button" type="submit">Create Employee</button>
        </form>
      }
    />
  );
}

function BillFormFields({
  createBill,
  current,
  deleteBill,
  distributors,
  error,
  initialForm,
  isEdit,
  outlet,
  saving,
  setError,
  setSaving,
  updateBill,
}: {
  createBill: ReturnType<typeof useMutation<typeof api.bills.createBill>>;
  current: { profile: Profile };
  deleteBill: ReturnType<typeof useMutation<typeof api.bills.deleteUnpaidBill>>;
  distributors: Doc<"distributors">[];
  error: string;
  initialForm: {
    distributorId: string;
    billNumber: string;
    billDate: string;
    amount: string;
  };
  isEdit: boolean;
  outlet: Doc<"outlets">;
  saving: boolean;
  setError: (value: string) => void;
  setSaving: (value: boolean) => void;
  updateBill: ReturnType<typeof useMutation<typeof api.bills.updateBill>>;
}) {
  const { billId } = useParams();
  const billData = useQuery(api.bills.getBill, billId ? { billId: billId as Id<"bills"> } : "skip");
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const payload = {
      distributorId: form.distributorId as Id<"distributors">,
      billNumber: form.billNumber,
      billDate: form.billDate,
      amountPaise: toPaise(form.amount),
    };

    try {
      if (isEdit && billId) {
        await updateBill({ billId: billId as Id<"bills">, ...payload });
        navigate(`/app/${outlet._id}/bills/${billId}`);
      } else {
        await createBill({ outletId: outlet._id, ...payload });
        navigate(`/app/${outlet._id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save bill.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="stack-form" key={`${billId ?? "new"}-${initialForm.billNumber}`} onSubmit={handleSubmit}>
      <SearchableSelect
        label="Distributor"
        options={distributors.map((item) => ({ value: item._id, label: item.name }))}
        value={form.distributorId}
        onChange={(value) => setForm((curr) => ({ ...curr, distributorId: value }))}
      />
      <FieldInput label="Bill Number" value={form.billNumber} onChange={(value) => setForm((curr) => ({ ...curr, billNumber: value }))} />
      <FieldInput label="Bill Date" type="date" value={form.billDate} onChange={(value) => setForm((curr) => ({ ...curr, billDate: value }))} />
      <FieldInput label="Amount" inputMode="decimal" value={form.amount} onChange={(value) => setForm((curr) => ({ ...curr, amount: value }))} />
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button" disabled={saving} type="submit">
        {saving ? "Saving..." : isEdit ? "Update Bill" : "Save Bill"}
      </button>
      {isEdit && current.profile.role === "OWNER" && billData?.bill.status === "UNPAID" ? (
        <button
          className="danger-button"
          onClick={() => {
            if (!billId) return;
            void deleteBill({ billId: billId as Id<"bills"> }).then(() =>
              navigate(`/app/${outlet._id}/bills`),
            );
          }}
          type="button"
        >
          Delete Bill
        </button>
      ) : null}
    </form>
  );
}

function MasterPage({
  title,
  subtitle,
  items,
  form,
}: {
  title: string;
  subtitle: string;
  items: { id: string; title: string; subtitle: string; active: boolean; onEdit: () => void }[];
  form: React.ReactNode;
}) {
  return (
    <section className="content-grid">
      <div className="surface">
        <div className="section-head">
          <div>
            <p className="eyebrow">Masters</p>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>
        <div className="bill-list">
          {items.map((item) => (
            <button className="bill-card" key={item.id} onClick={item.onEdit} type="button">
              <div>
                <strong>{item.title}</strong>
                <span>{item.subtitle}</span>
              </div>
              <span className={item.active ? "badge paid" : "badge unpaid"}>
                {item.active ? "Active" : "Inactive"}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div className="surface">{form}</div>
    </section>
  );
}

function exportBillsCsv(
  bills: Array<{
    billNumber: string;
    billDate: string;
    amountPaise: number;
    status: string;
    distributor?: { name?: string | null } | null;
    bankAccount?: { bankName: string; accountLast4: string } | null;
  }>,
) {
  const rows = [
    [
      "Bill Number",
      "Distributor",
      "Bill Date",
      "Amount",
      "Status",
      "Bank Account",
    ],
    ...bills.map((bill) => [
      bill.billNumber,
      bill.distributor?.name ?? "",
      bill.billDate,
      (bill.amountPaise / 100).toFixed(2),
      bill.status,
      bill.bankAccount
        ? `${bill.bankAccount.bankName} - ****${bill.bankAccount.accountLast4}`
        : "",
    ]),
  ];

  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
        .join(","),
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `mybilling-bills-${todayIso()}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function SearchableSelect({
  className,
  label,
  value,
  onChange,
  options,
}: {
  className?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selectedOption =
    options.find((option) => option.value === value) ?? null;
  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => {
      return (
        option.label.toLowerCase().includes(term) ||
        option.description?.toLowerCase().includes(term)
      );
    });
  }, [options, search]);

  return (
    <label className={`field ${className ?? ""}`.trim()}>
      <span>{label}</span>
      <div className="searchable-select">
        <button
          className="searchable-select-trigger"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <span>{selectedOption?.label || `Select ${label}`}</span>
          <span>{open ? "Close" : "Search"}</span>
        </button>
        {open ? (
          <div className="searchable-select-panel">
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}`}
              value={search}
            />
            <div className="searchable-select-options">
              {filteredOptions.map((option) => (
                <button
                  className={
                    option.value === value
                      ? "searchable-option active"
                      : "searchable-option"
                  }
                  key={`${label}-${option.value || "empty"}`}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setSearch("");
                  }}
                  type="button"
                >
                  <strong>{option.label}</strong>
                  {option.description ? <span>{option.description}</span> : null}
                </button>
              ))}
              {filteredOptions.length === 0 ? (
                <div className="empty-state">
                  <strong>No match found</strong>
                  <span>Try a different search.</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </label>
  );
}

function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell">
      <div className="hero-panel">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        <div className="hero-points">
          <div><CircleDollarSign size={18} /> Faster bill capture</div>
          <div><ShieldCheck size={18} /> Owner/employee access control</div>
          <div><ReceiptIndianRupee size={18} /> Clean manual payment workflow</div>
        </div>
      </div>
      <div className="auth-form-wrap">{children}</div>
    </div>
  );
}

function BrandBlock({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "brand compact" : "brand"}>
      <div className="brand-mark">B</div>
      <div>
        <strong>MyBilling</strong>
        {!compact ? <span>Smart Billing. Simple Payments.</span> : null}
      </div>
    </div>
  );
}

function FullscreenMessage({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="center-screen">
      <BrandBlock />
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );
}

function StatsCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className={`stats-card ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CardSkeleton({ title }: { title: string }) {
  return <div className="surface"><h2>{title}</h2><p>Loading...</p></div>;
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="empty-state"><strong>{title}</strong><span>{subtitle}</span></div>;
}

function AccessDenied() {
  return <EmptyState title="Access denied" subtitle="This section is available to owners only." />;
}

function InfoGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="info-grid">
      {items.map(([label, value]) => (
        <div className="info-item" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
