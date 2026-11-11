import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
} from "convex/react";
import { useAction, useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useHistoryPagination } from "./hooks/useHistoryPagination";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import {
  ChevronRight,
  ChevronDown,
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  Search,
  SlidersHorizontal,
  Building2,
  CircleDollarSign,
  CreditCard,
  Download,
  FilePlus2,
  Files,
  LayoutDashboard,
  LogOut,
  MoreHorizontal,
  Plus,
  ReceiptIndianRupee,
  ShieldCheck,
  Store,
  Trash2,
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
import { signInErrorMessage, userErrorMessage } from "./lib/errors";

type Profile = Doc<"profiles">;
type DatePreset = "THIS_MONTH" | "PREV_MONTH" | "DATE_RANGE" | "ALL_TIME";
type DateFilterState = {
  preset: DatePreset;
  fromDate: string;
  toDate: string;
};

function resolveDateFilter(filter: DateFilterState) {
  if (filter.preset === "ALL_TIME") {
    return { fromDate: undefined, toDate: undefined };
  }
  if (filter.preset === "DATE_RANGE") {
    return {
      fromDate: filter.fromDate || undefined,
      toDate: filter.toDate || undefined,
    };
  }
  const referenceDate =
    filter.preset === "PREV_MONTH" ? subMonths(new Date(), 1) : new Date();
  return {
    fromDate: format(startOfMonth(referenceDate), "yyyy-MM-dd"),
    toDate: format(endOfMonth(referenceDate), "yyyy-MM-dd"),
  };
}

function summarizeDateFilter(filter: DateFilterState) {
  if (filter.preset === "ALL_TIME") {
    return "All time";
  }
  if (filter.preset === "THIS_MONTH") {
    return "This month";
  }
  if (filter.preset === "PREV_MONTH") {
    return "Previous month";
  }
  if (!filter.fromDate && !filter.toDate) {
    return "Custom range";
  }
  return `${filter.fromDate || "Start"} to ${filter.toDate || "End"}`;
}

export default function App() {
  return (
    <>
      <AuthLoading>
        <FullscreenMessage title="Checking session" subtitle="Loading MyBilling..." />
      </AuthLoading>
      <Unauthenticated>
        <Routes>
          <Route path="/register-owner" element={<RegisterOwnerPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
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
      setError(signInErrorMessage(err));
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
        <div className="auth-heading"><h1>Welcome back</h1><p>Sign in to your billing workspace.</p></div>
        <label className="field">
          <span>Login Identifier</span>
          <input name="email" placeholder="Phone or username" autoComplete="username" autoCapitalize="none" spellCheck={false} required aria-invalid={!!error} />
        </label>
        <PasswordField name="password" label="Password" autoComplete="current-password" invalid={!!error} />
        {error ? <p className="form-error error-notice" role="alert">{error}</p> : null}
        <button className="primary-button" disabled={loading} type="submit">
          {loading ? "Signing In..." : "Sign In"}
        </button>
        <Link className="text-link" to="/forgot-password">
          Forgot password?
        </Link>
        <Link className="text-link" to="/register-owner">
          Create Owner Account
        </Link>
      </form>
    </AuthShell>
  );
}

function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Forgot your password?"
      subtitle="A business owner can set a new employee password from the Employees page."
    >
      <div className="auth-card">
        <BrandBlock />
        <div className="auth-heading"><h1>Forgot your password?</h1><p>Recover access to your workspace.</p></div>
        <p className="recovery-note">
          The owner of your MyBilling workspace can set a temporary password for your account from
          the Employees page. Sign in with that password once the owner shares it with you.
        </p>
        <Link className="text-link" to="/login">
          Back to Sign In
        </Link>
      </div>
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
      .catch((err) => setError(userErrorMessage(err, "Could not finish registration.")));
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
      setError(userErrorMessage(err, "Could not create owner account."));
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
        <div className="auth-heading"><h1>Create your workspace</h1><p>Start with an owner account, then add your shop.</p></div>
        <label className="field">
          <span>Owner Name</span>
          <input name="name" placeholder="Aditya Stores" required />
        </label>
        <label className="field">
          <span>Login Identifier</span>
          <input name="email" placeholder="mobile or username" required />
        </label>
        <PasswordField label="Password" name="password" autoComplete="new-password" />
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
      setError(userErrorMessage(err, "Could not create outlet."));
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
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

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
    { to: `/app/${outletId}/payments`, label: "View Payments", icon: CreditCard },
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
  const primaryMobileLinks =
    current.profile.role === "OWNER"
      ? [navLinks[0], navLinks[3], navLinks[1], navLinks[2]]
      : navLinks;
  const moreMobileLinks =
    current.profile.role === "OWNER"
      ? navLinks.filter((link) => !primaryMobileLinks.includes(link))
      : [];

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
                aria-label="Sign out"
                onClick={() => {
                  void signOut().then(() => navigate("/login"));
                }}
                type="button"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
          <div className="header-actions">
            <SearchableSelect
              className="outlet-switcher"
              leadingIcon={<Store size={17} aria-hidden="true" />}
              trailingIcon={<ChevronDown size={17} aria-hidden="true" />}
              autoFocusSearch={false}
              label="Outlet"
              options={current.accessibleOutlets.map((outlet) => ({
                value: outlet._id,
                label: outlet.name,
                description: outlet.address ?? "No address",
              }))}
              value={activeOutlet._id}
              onChange={(value) => navigate(`/app/${value}`)}
            />
          </div>
        </header>

        <Routes>
          <Route index element={<DashboardPage outlet={activeOutlet} current={current} />} />
          <Route path="bills/new" element={<BillFormPage current={current} outlet={activeOutlet} />} />
          <Route path="bills/:billId/edit" element={<BillFormPage current={current} outlet={activeOutlet} />} />
          <Route path="bills" element={<ViewBillsPage current={current} outlet={activeOutlet} />} />
          <Route path="bills/:billId" element={<BillDetailsPage current={current} />} />
          <Route path="payments/new" element={<PaymentStartPage current={current} outlet={activeOutlet} />} />
          <Route path="payments" element={<ViewPaymentsPage current={current} outlet={activeOutlet} />} />
          <Route path="payments/pending" element={<PendingBillsPage current={current} outlet={activeOutlet} />} />
          <Route path="payments/summary" element={<PaymentSummaryPage current={current} outlet={activeOutlet} />} />
          <Route path="payments/:paymentId/success" element={<PaymentSuccessPage current={current} />} />
          <Route path="distributors" element={<DistributorsPage />} />
          <Route path="bank-accounts" element={<BankAccountsPage />} />
          <Route path="outlets" element={<OutletsPage />} />
          <Route path="employees" element={<EmployeesPage />} />
        </Routes>
        {isMoreOpen && moreMobileLinks.length > 0 ? (
          <><button className="mobile-more-backdrop" aria-label="Close navigation menu" onClick={() => setIsMoreOpen(false)} type="button" /><div className="mobile-more-sheet">
            {moreMobileLinks.map((link) => {
              const Icon = link.icon;
              const active = location.pathname === link.to;
              return (
                <Link
                  className={active ? "mobile-more-link active" : "mobile-more-link"}
                  key={link.to}
                  onClick={() => setIsMoreOpen(false)}
                  to={link.to}
                >
                  <Icon size={18} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div></>
        ) : null}
        <nav className="mobile-bottom-nav" aria-label="Main navigation">
          {primaryMobileLinks.map((link) => {
            const Icon = link.icon;
            const active = location.pathname === link.to ||
              (link.to.endsWith("/payments/new") && /\/payments\/(pending|summary)/.test(location.pathname)) ||
              (link.to.endsWith("/bills") && location.pathname.startsWith(`${link.to}/`) && !location.pathname.endsWith("/bills/new"));
            return (
              <Link
                className={active ? "mobile-nav-link active" : "mobile-nav-link"}
                key={link.to}
                onClick={() => setIsMoreOpen(false)}
                to={link.to}
              >
                <Icon size={18} />
                <span>{({ Dashboard: "Home", "View Bills": "Bills", "Add Bill": "Add", Payments: "Pay" } as Record<string, string>)[link.label] ?? link.label}</span>
              </Link>
            );
          })}
          {moreMobileLinks.length > 0 ? (
            <button
              className={isMoreOpen || moreMobileLinks.some((link) => location.pathname === link.to) ? "mobile-nav-link active" : "mobile-nav-link"}
              aria-expanded={isMoreOpen}
              onClick={() => setIsMoreOpen((currentValue) => !currentValue)}
              type="button"
            >
              <MoreHorizontal size={18} />
              <span>More</span>
            </button>
          ) : null}
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
  const recentBillsPreview = stats.recentBills.slice(0, 3);

  return (
    <div className="page-stack">
      <header className="page-heading"><p className="eyebrow">{outlet.name}</p><h1>Overview</h1><p>Your bills, payments and daily tasks.</p></header>
      <section className="stats-grid">
        <StatsCard label={stats.totalBills >= 200 ? "Bills in snapshot" : "Total bills"} value={String(stats.totalBills)} accent="blue" />
        <StatsCard label="Unpaid amount" value={formatCurrency(stats.unpaidAmountPaise)} accent="red" />
        <StatsCard label="Paid amount" value={formatCurrency(stats.paidAmountPaise)} accent="green" />
      </section>
      {stats.totalBills >= 200 ? <p className="compact-note">This dashboard is a snapshot of up to 200 bills. View Bills contains the complete history.</p> : null}

      <section className="content-grid">
        <div className="surface">
          <div className="section-head">
            <div>
              <p className="eyebrow">Activity</p>
              <h2>{stats.totalBills >= 200 ? "Bills in snapshot" : "Recent bills"}</h2>
            </div>
            {current.profile.role === "OWNER" ? (
              <button className="ghost-button" onClick={() => navigate(`bills`)} type="button">
                View all
              </button>
            ) : null}
          </div>
          <div className="bill-list">
            {recentBillsPreview.map((bill) => (
              <div className="bill-row" key={bill._id}>
                <div>
                  <Link to={current.profile.role === "OWNER" ? `bills/${bill._id}` : `bills/${bill._id}/edit`}><strong>#{bill.billNumber}</strong></Link>
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
            {stats.recentBills.length > recentBillsPreview.length ? (
              <div className="compact-note">
                Showing {recentBillsPreview.length} recent bills out of {stats.recentBills.length}.
              </div>
            ) : null}
          </div>
        </div>

        <div className="surface">
          <div className="section-head">
            <div>
              <p className="eyebrow">Get things done</p>
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

  if (isEdit && billData === undefined) return <CardSkeleton title="Loading bill details" />;

  return (
    <section className="page-form surface">
      <div className="section-head">
        <div>
          <p className="eyebrow">{isEdit ? "Correct bill information" : "Capture distributor bills fast"}</p>
          <h2>{isEdit ? "Edit Bill" : "Add Bill"}</h2>
        </div>
      </div>
      <BillFormFields
        key={billId ?? "new"}
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

function FilterAccordion({
  children,
  description,
  open,
  onToggle,
  title,
}: {
  children: React.ReactNode;
  description: string;
  open: boolean;
  onToggle: () => void;
  title: string;
}) {
  return (
    <div className={open ? "filter-accordion open" : "filter-accordion"}>
      <button className="filter-accordion-trigger" aria-expanded={open} onClick={onToggle} type="button">
        <div className="filter-accordion-copy">
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <ChevronRight className={open ? "accordion-icon open" : "accordion-icon"} size={18} />
      </button>
      {open ? <div className="filter-accordion-body">{children}</div> : null}
    </div>
  );
}

function DateFilterFields({
  filter,
  label,
  onChange,
}: {
  filter: DateFilterState;
  label: string;
  onChange: (next: DateFilterState) => void;
}) {
  return (
    <div className="stack-form">
      <div className="segment-group">
        {([
          ["THIS_MONTH", "This Month"],
          ["PREV_MONTH", "Prev Month"],
          ["DATE_RANGE", "Date Range"],
          ["ALL_TIME", "All Time"],
        ] as const).map(([value, text]) => (
          <button
            className={filter.preset === value ? "segment active" : "segment"}
            key={`${label}-${value}`}
            onClick={() => onChange({ ...filter, preset: value })}
            type="button"
          >
            {text}
          </button>
        ))}
      </div>
      {filter.preset === "DATE_RANGE" ? (
        <div className="date-row">
          <DateField
            label={`${label} From`}
            value={filter.fromDate}
            onChange={(value) => onChange({ ...filter, fromDate: value })}
          />
          <DateField
            label={`${label} To`}
            value={filter.toDate}
            onChange={(value) => onChange({ ...filter, toDate: value })}
          />
        </div>
      ) : null}
    </div>
  );
}

function ViewBillsPage({ current, outlet }: { current: { profile: Profile }; outlet: Doc<"outlets"> }) {
  const activeDistributors = useQuery(api.distributors.listDistributors, { activeOnly: true }) ?? [];
  const inactiveDistributors = useQuery(api.distributors.listDistributors, { activeOnly: false }) ?? [];
  const initialFilters = {
    status: "ALL" as "ALL" | "UNPAID" | "PAID",
    distributorId: "",
    billDate: { preset: "ALL_TIME" as DatePreset, fromDate: "", toDate: "" },
    paymentDate: { preset: "ALL_TIME" as DatePreset, fromDate: "", toDate: "" },
    search: "",
  };
  const [filters, setFilters] = useState(initialFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [openSections, setOpenSections] = useState({ billDate: false, paymentDate: false });
  const billDates = resolveDateFilter(filters.billDate);
  const paymentDates = resolveDateFilter(filters.paymentDate);
  const args = {
    outletId: outlet._id,
    status: filters.status,
    distributorId: filters.distributorId ? filters.distributorId as Id<"distributors"> : undefined,
    billDateFrom: billDates.fromDate,
    billDateTo: billDates.toDate,
    paymentDateFrom: paymentDates.fromDate,
    paymentDateTo: paymentDates.toDate,
    search: filters.search.trim() || undefined,
  };
  const activeFilterCount = Number(!!filters.distributorId) + Number(filters.billDate.preset !== "ALL_TIME") + Number(filters.paymentDate.preset !== "ALL_TIME");
  if (current.profile.role !== "OWNER") return <AccessDenied />;

  return (
    <section className="page-stack history-page">
      <header className="page-heading">
        <div><p className="eyebrow">Your outlet ledger</p><h1>View bills</h1><p>Every bill, paid or unpaid. Newest bill dates first.</p></div>
        <Link className="heading-action" to={`/app/${outlet._id}/bills/new`} aria-label="Add a bill"><Plus size={20} /></Link>
      </header>
      <div className="history-controls">
        <label className="history-search"><Search size={18} /><input aria-label="Search bills" type="search" placeholder="Bill number, distributor or amount" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} /></label>
        <div className="history-toolbar">
          <div className="status-tabs" aria-label="Bill status">
            {(["ALL", "UNPAID", "PAID"] as const).map((status) => <button type="button" key={status} aria-pressed={filters.status === status} className={filters.status === status ? "active" : ""} onClick={() => setFilters((f) => ({ ...f, status }))}>{status === "ALL" ? "All bills" : status === "UNPAID" ? "Unpaid" : "Paid"}</button>)}
          </div>
          <button type="button" className="filter-toggle" aria-expanded={showFilters} onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal size={16} /><span>Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</span></button>
        </div>
        <div className="filter-context"><span>Bill date: {summarizeDateFilter(filters.billDate)}</span>{filters.paymentDate.preset !== "ALL_TIME" ? <span>Payment: {summarizeDateFilter(filters.paymentDate)}</span> : null}{activeFilterCount || filters.search || filters.status !== "ALL" ? <button type="button" onClick={() => setFilters(initialFilters)}>Clear all</button> : null}</div>
        {showFilters ? <div className="filter-grid advanced-filters">
          <SearchableSelect label="Distributor" options={[{ value: "", label: "All distributors" }, ...[...activeDistributors, ...inactiveDistributors].map((item) => ({ value: item._id, label: `${item.name}${item.active ? "" : " (inactive)"}` }))]} value={filters.distributorId} onChange={(value) => setFilters((f) => ({ ...f, distributorId: value }))} />
          <FilterAccordion title="Bill date" description={summarizeDateFilter(filters.billDate)} open={openSections.billDate} onToggle={() => setOpenSections((s) => ({ ...s, billDate: !s.billDate }))}><DateFilterFields label="Bill date" filter={filters.billDate} onChange={(value) => setFilters((f) => ({ ...f, billDate: value }))} /></FilterAccordion>
          <FilterAccordion title="Payment date" description={summarizeDateFilter(filters.paymentDate)} open={openSections.paymentDate} onToggle={() => setOpenSections((s) => ({ ...s, paymentDate: !s.paymentDate }))}><DateFilterFields label="Payment date" filter={filters.paymentDate} onChange={(value) => setFilters((f) => ({ ...f, paymentDate: value }))} /></FilterAccordion>
        </div> : null}
      </div>
      <BillHistoryResults key={JSON.stringify(args)} args={args} outletId={outlet._id} onClear={() => setFilters(initialFilters)} />
    </section>
  );
}

function BillHistoryResults({ args, outletId, onClear }: {
  args: Omit<FunctionArgs<typeof api.bills.listBillsPage>, "paginationOpts">;
  outletId: Id<"outlets">;
  onClear: () => void;
}) {
  const { results: bills, loading, exhausted, loadMore } = useHistoryPagination(api.bills.listBillsPage, args);
  const convex = useConvex();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  async function exportAll() {
    setExporting(true);
    setExportError("");
    try {
      const all: FunctionReturnType<typeof api.bills.listBillsPage>["page"] = [];
      let cursor: string | null = null;
      for (;;) {
        const page: FunctionReturnType<typeof api.bills.listBillsPage> = await convex.query(api.bills.listBillsPage, { ...args, paginationOpts: { cursor, numItems: 100 } });
        all.push(...page.page);
        if (page.isDone) break;
        cursor = page.continueCursor;
      }
      exportBillsCsv(all);
    } catch {
      setExportError("Could not export bills. Please try again.");
    } finally { setExporting(false); }
  }
  return <section className="history-results" aria-label="Bill results" aria-busy={loading}>
    <div className="results-heading"><span>{bills.length ? `${bills.length}${exhausted ? "" : "+"} bill${bills.length === 1 && exhausted ? "" : "s"}${exhausted ? "" : " loaded"}` : loading ? "Loading bills…" : "0 bills"}</span><button type="button" className="text-action" disabled={exporting || !bills.length} onClick={() => void exportAll()}><Download size={15} />{exporting ? "Exporting…" : "Export all"}</button></div>
    {exportError ? <p className="form-error" role="alert">{exportError}</p> : null}
    <div className="ledger-list">{bills.map((bill) => <Link className="ledger-row" key={bill._id} to={`/app/${outletId}/bills/${bill._id}`}>
      <div className="ledger-row-top"><strong>{bill.distributor?.name ?? "Unavailable distributor"}</strong><span className={bill.status === "PAID" ? "badge paid" : "badge unpaid"}>{bill.status === "PAID" ? "Paid" : "Unpaid"}</span></div>
      <div className="ledger-row-main"><div><span className="bill-reference">#{bill.billNumber}</span><time>{formatDateLabel(bill.billDate)}</time></div><strong className="money">{formatCurrency(bill.amountPaise)}</strong></div>
      {bill.payment ? <div className="ledger-row-foot"><Check size={12} /><span>Paid {formatDateLabel(bill.payment.paymentDate)}</span></div> : null}
    </Link>)}</div>
    {loading ? <div className="history-loading" role="status"><span className="loading-line" /><span className="loading-line" /><span>Loading bills…</span></div> : null}
    {!loading && !bills.length && exhausted ? <><EmptyState title="No bills match your filters" subtitle="Clear the filters to show the full bill history for this outlet." /><button className="ghost-button" type="button" onClick={onClear}>Show all bills</button></> : null}
    {!exhausted ? <button className="ghost-button load-more" type="button" disabled={loading} onClick={loadMore}>{loading ? "Loading…" : "Load more bills"}</button> : bills.length ? <p className="list-end">You’ve reached the end of these bills.</p> : null}
  </section>;
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
        <div className="section-actions">
          {data.bill.status === "UNPAID" ? (
            <Link
              className="primary-button"
              to={`/app/${outletId}/payments/pending?distributorId=${data.bill.distributorId}&paymentDate=${todayIso()}&billId=${data.bill._id}`}
            >
              Pay This Bill
            </Link>
          ) : null}
          <Link className="ghost-button" to={`/app/${outletId}/bills/${data.bill._id}/edit`}>
            Edit Bill
          </Link>
        </div>
      </div>
      <InfoGrid
        items={[
          ["Distributor", data.distributor?.name ?? "-"],
          ["Bill Date", formatDateLabel(data.bill.billDate)],
          ["Amount", formatCurrency(data.bill.amountPaise)],
          ["Status", data.bill.status],
          ["Payment Total", data.payment ? formatCurrency(data.payment.totalAmountPaise) : "-"],
          ["Payment Date", data.payment?.paymentDate ? formatDateLabel(data.payment.paymentDate) : "-"],
          ["Bank Account", data.bankAccount ? `${data.bankAccount.bankName} - ****${data.bankAccount.accountLast4}` : "-"],
        ]}
      />
      {data.payment ? (
        <Link className="ghost-button inline-link-button" to={`/app/${outletId}/payments?paymentId=${data.payment._id}`}>
          View Payment Group
        </Link>
      ) : null}
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
        <DateField
          label="Payment Date"
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
  const billId = searchParams.get("billId");
  const prefilledBillIds = searchParams.get("billIds")?.split(",").filter(Boolean) ?? [];
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
      key={`${distributorId}-${billId ?? "all"}`}
      prefilledBillId={billId}
      prefilledBillIds={prefilledBillIds}
      distributorId={distributorId}
      navigate={navigate}
      outletId={outlet._id}
      paymentDate={paymentDate}
      pendingBills={pendingBills}
    />
  );
}

function PendingBillsContent({
  prefilledBillId,
  prefilledBillIds,
  distributorId,
  navigate,
  outletId,
  paymentDate,
  pendingBills,
}: {
  prefilledBillId: string | null;
  prefilledBillIds: string[];
  distributorId: string;
  navigate: ReturnType<typeof useNavigate>;
  outletId: Id<"outlets">;
  paymentDate: string;
  pendingBills: Doc<"bills">[];
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    pendingBills.filter((bill) => prefilledBillIds.includes(bill._id) || bill._id === prefilledBillId).map((bill) => bill._id),
  );
  const [search, setSearch] = useState("");
  const visibleBills = pendingBills.filter((bill) => `${bill.billNumber} ${bill.billDate} ${(bill.amountPaise / 100).toFixed(2)}`.toLowerCase().includes(search.trim().toLowerCase()));
  const allVisibleSelected = visibleBills.length > 0 && visibleBills.every((bill) => selectedIds.includes(bill._id));

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
          <label className="history-search"><Search size={17} /><input type="search" aria-label="Search pending bills" placeholder="Find a bill number or amount" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          {prefilledBillId ? (
            <div className="compact-note">
              This bill was preselected from View Bills. You can keep just this one, or add more bills from the same distributor.
            </div>
          ) : null}
          <button
            className="ghost-button"
            onClick={() => setSelectedIds((ids) => allVisibleSelected ? ids.filter((id) => !visibleBills.some((bill) => bill._id === id)) : [...new Set([...ids, ...visibleBills.map((bill) => bill._id)])])}
            type="button"
          >
            {allVisibleSelected ? "Clear selection" : "Select all shown"}
          </button>
          {visibleBills.map((bill) => (
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

function PaymentSummaryPage({ current, outlet }: { current: { profile: Profile }; outlet: Doc<"outlets"> }) {
  const [searchParams] = useSearchParams();
  const distributorId = searchParams.get("distributorId");
  const billIds = searchParams.get("billIds")?.split(",").filter(Boolean) ?? [];
  const selection = useQuery(api.bills.getPaymentSelection,
    distributorId && current.profile.role === "OWNER" ? { outletId: outlet._id, distributorId: distributorId as Id<"distributors">, billIds: billIds as Id<"bills">[] } : "skip");
  const activeDistributors = useQuery(api.distributors.listDistributors, { activeOnly: true }) ?? [];
  const inactiveDistributors = useQuery(api.distributors.listDistributors, { activeOnly: false }) ?? [];
  const bankAccounts = useQuery(api.bankAccounts.listBankAccounts, { activeOnly: true }) ?? [];
  const recordPayment = useMutation(api.payments.recordPayment);
  const [bankAccountId, setBankAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(searchParams.get("paymentDate") ?? todayIso());
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();
  if (current.profile.role !== "OWNER") return <AccessDenied />;
  if (!distributorId) return <Navigate to={`/app/${outlet._id}/payments/new`} replace />;
  if (selection === undefined) return <CardSkeleton title="Loading payment summary" />;
  const distributor = [...activeDistributors, ...inactiveDistributors].find((item) => item._id === distributorId);
  const selectedBills = selection.bills;
  const totalAmount = selectedBills.reduce((sum, bill) => sum + bill.amountPaise, 0);
  const selectionChanged = selection.invalidCount > 0;
  const backToBills = `/app/${outlet._id}/payments/pending?distributorId=${distributorId}&paymentDate=${paymentDate}&billIds=${billIds.join(",")}`;
  async function copyAmount() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText((totalAmount / 100).toFixed(2));
      setCopied(true);
    } catch { setCopyError("Could not copy. You can select and copy the amount above."); }
  }
  async function handleRecordPayment() {
    if (!bankAccountId || selectionChanged || !selectedBills.length || !paymentDate || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await recordPayment({ outletId: outlet._id, distributorId: distributorId as Id<"distributors">, bankAccountId: bankAccountId as Id<"bankAccounts">, paymentDate, billIds: selectedBills.map((bill) => bill._id) });
      navigate(`/app/${outlet._id}/payments/${result.paymentId}/success`);
    } catch (err) { setError(userErrorMessage(err, "Could not record payment.")); }
    finally { setSubmitting(false); }
  }
  return <section className="page-stack payment-review">
    <header className="page-heading"><Link className="back-link" to={backToBills}><ArrowLeft size={17} />Bill selection</Link><p className="eyebrow">Step 3 of 3 · Review</p><h1>Payment summary</h1><p>Check the bills before recording your payment.</p></header>
    <section className="payment-amount-panel" aria-label="Total payment amount">
      <div className="payment-payee"><span>Paying to</span><strong>{distributor?.name ?? "Distributor"}</strong></div>
      <div className="payment-total-line"><div><span>Total amount</span><strong className="payment-total-value">{formatCurrency(totalAmount)}</strong></div><button className="copy-icon-button" aria-label={copied ? "Amount copied" : "Copy total amount"} title="Copy total amount" onClick={() => void copyAmount()} type="button">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>
      <div className="payment-amount-caption"><span>{selectedBills.length} bill{selectedBills.length === 1 ? "" : "s"} selected</span><span role="status">{copied ? "Amount copied" : ""}</span></div>
      {copyError ? <p className="form-error" role="alert">{copyError}</p> : null}
    </section>
    <section className="surface payment-details"><h2>Payment details</h2><DateField label="Payment date" value={paymentDate} onChange={setPaymentDate} /><SearchableSelect autoFocusSearch={false} label="Paid from" options={bankAccounts.map((item) => ({ value: item._id, label: item.bankName, description: item.maskedAccount }))} value={bankAccountId} onChange={setBankAccountId} />{bankAccounts.length === 0 ? <Link className="text-link" to={`/app/${outlet._id}/bank-accounts`}>Add a bank account to continue</Link> : null}</section>
    <section className="surface review-bills" aria-label="Selected bills"><div className="results-heading"><h2>Selected bills <span className="count-label">{selectedBills.length}</span></h2><Link className="text-action" to={backToBills}>Edit selection</Link></div><div className="review-bills-list">{selectedBills.map((bill, index) => <div className="review-bill-row" key={bill._id}><div><span className="review-bill-number">{String(index + 1).padStart(2, "0")}</span><div><strong>#{bill.billNumber}</strong><time>{formatDateLabel(bill.billDate)}</time></div></div><strong className="money">{formatCurrency(bill.amountPaise)}</strong></div>)}</div>{!selectedBills.length ? <p className="compact-note">No eligible bills selected. Return to bill selection.</p> : null}</section>
    <div className="payment-confirmation">{selectionChanged ? <p className="form-error" role="alert">Some selected bills were changed or paid already. Review your bill selection before continuing.</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}<p>This records a payment you have already made.</p><button className="primary-button" disabled={!bankAccountId || !paymentDate || submitting || !selectedBills.length || selectionChanged} onClick={() => void handleRecordPayment()} type="button">{submitting ? "Recording payment…" : "Confirm payment recorded"}</button></div>
  </section>;
}

function ViewPaymentsPage({ current, outlet }: { current: { profile: Profile }; outlet: Doc<"outlets"> }) {
  const activeDistributors = useQuery(api.distributors.listDistributors, { activeOnly: true }) ?? [];
  const inactiveDistributors = useQuery(api.distributors.listDistributors, { activeOnly: false }) ?? [];
  const [searchParams] = useSearchParams();
  const initialFilters = {
    distributorId: "", search: "",
    billDate: { preset: "ALL_TIME" as DatePreset, fromDate: "", toDate: "" },
    paymentDate: { preset: "ALL_TIME" as DatePreset, fromDate: "", toDate: "" },
  };
  const [filters, setFilters] = useState(initialFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [openSections, setOpenSections] = useState({ billDate: false, paymentDate: false });
  const billDates = resolveDateFilter(filters.billDate);
  const paymentDates = resolveDateFilter(filters.paymentDate);
  const args = { outletId: outlet._id,
    distributorId: filters.distributorId ? filters.distributorId as Id<"distributors"> : undefined,
    billDateFrom: billDates.fromDate, billDateTo: billDates.toDate,
    paymentDateFrom: paymentDates.fromDate, paymentDateTo: paymentDates.toDate,
    search: filters.search.trim() || undefined,
  };
  const activeFilterCount = Number(!!filters.distributorId) + Number(filters.billDate.preset !== "ALL_TIME") + Number(filters.paymentDate.preset !== "ALL_TIME");
  if (current.profile.role !== "OWNER") return <AccessDenied />;
  return <section className="page-stack history-page">
    <header className="page-heading"><p className="eyebrow">Your payment ledger</p><h1>View payments</h1><p>Payment groups and every bill included in them.</p></header>
    <div className="history-controls">
      <label className="history-search"><Search size={18} /><input aria-label="Search payments" type="search" placeholder="Distributor, bank or bill number" value={filters.search} onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))} /></label>
      <div className="filter-context"><span>Payment date: {summarizeDateFilter(filters.paymentDate)}</span><button type="button" className="filter-toggle" aria-expanded={showFilters} onClick={() => setShowFilters((v) => !v)}><SlidersHorizontal size={16} />Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}</button>{activeFilterCount || filters.search ? <button type="button" onClick={() => setFilters(initialFilters)}>Clear all</button> : null}</div>
      {showFilters ? <div className="filter-grid advanced-filters">
        <SearchableSelect label="Distributor" options={[{ value: "", label: "All distributors" }, ...[...activeDistributors, ...inactiveDistributors].map((item) => ({ value: item._id, label: `${item.name}${item.active ? "" : " (inactive)"}` }))]} value={filters.distributorId} onChange={(value) => setFilters((f) => ({ ...f, distributorId: value }))} />
        <FilterAccordion title="Payment date" description={summarizeDateFilter(filters.paymentDate)} open={openSections.paymentDate} onToggle={() => setOpenSections((v) => ({ ...v, paymentDate: !v.paymentDate }))}><DateFilterFields filter={filters.paymentDate} label="Payment date" onChange={(value) => setFilters((f) => ({ ...f, paymentDate: value }))} /></FilterAccordion>
        <FilterAccordion title="Bill date" description={summarizeDateFilter(filters.billDate)} open={openSections.billDate} onToggle={() => setOpenSections((v) => ({ ...v, billDate: !v.billDate }))}><DateFilterFields filter={filters.billDate} label="Bill date" onChange={(value) => setFilters((f) => ({ ...f, billDate: value }))} /></FilterAccordion>
      </div> : null}
    </div>
    <PaymentHistoryResults key={JSON.stringify(args)} args={args} outletId={outlet._id} highlightedPaymentId={searchParams.get("paymentId")} />
  </section>;
}

function PaymentHistoryResults({ args, outletId, highlightedPaymentId }: {
  args: Omit<FunctionArgs<typeof api.payments.listPaymentsPage>, "paginationOpts">;
  outletId: Id<"outlets">;
  highlightedPaymentId: string | null;
}) {
  const { results: payments, loading, exhausted, loadMore } = useHistoryPagination(api.payments.listPaymentsPage, args);
  return <section className="history-results" aria-label="Payment results" aria-busy={loading}>
    <div className="results-heading"><span>{payments.length}{exhausted ? "" : "+"} payment group{payments.length === 1 && exhausted ? "" : "s"}{exhausted ? "" : " loaded"}</span></div>
    <div className="payment-history-list">{payments.map((item) => <RecordedPaymentGroup key={item.payment._id} item={item} outletId={outletId} highlighted={highlightedPaymentId === item.payment._id} />)}</div>
    {loading ? <div className="history-loading" role="status"><span className="loading-line" /><span>Loading payments…</span></div> : null}
    {!loading && exhausted && !payments.length ? <EmptyState title="No payments match your filters" subtitle="Try clearing the filters or selecting a different date range." /> : null}
    {!exhausted ? <button type="button" className="ghost-button load-more" disabled={loading} onClick={loadMore}>{loading ? "Loading…" : "Load more payments"}</button> : payments.length ? <p className="list-end">You’ve reached the end of these payments.</p> : null}
  </section>;
}

function RecordedPaymentGroup({ item, outletId, highlighted }: {
  item: FunctionReturnType<typeof api.payments.listPaymentsPage>["page"][number];
  outletId: Id<"outlets">;
  highlighted: boolean;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const selectedBills = item.bills.filter((bill) => selectedIds.includes(bill._id));
  const selectedTotal = selectedBills.reduce((sum, bill) => sum + bill.amountPaise, 0);
  const allSelected = item.bills.length > 0 && selectedBills.length === item.bills.length;
  function changeSelection(ids: string[]) { setSelectedIds(ids); setCopied(false); setCopyError(""); }
  async function copySelection() {
    setCopyError("");
    try {
      await navigator.clipboard.writeText([
        item.distributor?.name ?? "Distributor",
        `Payment date: ${formatDateLabel(item.payment.paymentDate)}`,
        ...selectedBills.map((bill) => `${bill.billNumber} · ${formatDateLabel(bill.billDate)} · ${formatCurrency(bill.amountPaise)}`),
        `Selected total: ${formatCurrency(selectedTotal)} (${selectedBills.length} bills)`,
        `Payment group total: ${formatCurrency(item.payment.totalAmountPaise)}`,
      ].join("\n"));
      setCopied(true);
    } catch { setCopyError("Could not copy the selected bills. Please try again."); }
  }
  return <article className={highlighted ? "payment-history-card highlighted" : "payment-history-card"}>
    <div className="payment-group-title"><div><strong>{item.distributor?.name ?? "Unavailable distributor"}</strong><time>{formatDateLabel(item.payment.paymentDate)}</time></div><div className="recorded-total"><span>Paid total</span><strong className="money">{formatCurrency(item.payment.totalAmountPaise)}</strong></div></div>
    <div className="payment-history-meta"><span>{item.bankAccount?.bankName ?? "Unavailable bank"} · {item.bills.length} bills</span><Link className="text-action" to={`/app/${outletId}/payments/${item.payment._id}/success`}>Receipt<ChevronRight size={14} /></Link></div>
    <details className="payment-group-bills" open={highlighted || undefined}>
      <summary>View & select {item.bills.length} bill{item.bills.length === 1 ? "" : "s"}<ChevronRight size={16} /></summary>
      <div className="recorded-bills-content">
        <div className="recorded-selection-toolbar"><span>Choose bills to check their subtotal.</span><button type="button" className="text-action" onClick={() => changeSelection(allSelected ? [] : item.bills.map((bill) => bill._id))}>{allSelected ? "Clear all" : "Select all"}</button></div>
        <div>{item.bills.map((bill) => <div className={selectedIds.includes(bill._id) ? "recorded-bill-row selected" : "recorded-bill-row"} key={bill._id}>
          <label className="bill-checkbox-target"><input type="checkbox" checked={selectedIds.includes(bill._id)} onChange={(event) => changeSelection(event.target.checked ? [...selectedIds, bill._id] : selectedIds.filter((id) => id !== bill._id))} /><span className="sr-only">Select bill {bill.billNumber}</span></label>
          <Link to={`/app/${outletId}/bills/${bill._id}`}><strong>#{bill.billNumber}</strong><time>{formatDateLabel(bill.billDate)}</time></Link>
          <strong className="money">{formatCurrency(bill.amountPaise)}</strong>
        </div>)}</div>
        <div className="recorded-selection-summary" aria-live="polite"><div><span>{selectedBills.length} of {item.bills.length} bills selected</span><strong className="money">{formatCurrency(selectedTotal)}</strong></div><button className="copy-selection-button" type="button" disabled={!selectedBills.length} onClick={() => void copySelection()}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "Copied" : "Copy selection"}</button></div>
        {copyError ? <p className="form-error" role="alert">{copyError}</p> : null}
      </div>
    </details>
  </article>;
}

function PaymentSuccessPage({ current }: { current: { profile: Profile } }) {
  const { paymentId } = useParams();
  const outletId = useParams().outletId;
  const payment = useQuery(api.payments.getPayment, paymentId ? { paymentId: paymentId as Id<"payments"> } : "skip");
  const receiptRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState("");

  if (current.profile.role !== "OWNER") return <AccessDenied />;
  if (payment === undefined) return <CardSkeleton title="Loading receipt" />;

  return (
    <section className="page-stack">
      <div className="success-card">
        <div className="success-icon">✓</div>
        <h2>Payment receipt</h2>
        <p>{payment.payment.billCount} bills · Paid {formatDateLabel(payment.payment.paymentDate)}</p>
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

      {shareError ? <p className="form-error error-notice" role="alert">{shareError}</p> : null}
      <div className="button-row">
        <Link className="ghost-button" to={`/app/${outletId}`}>
          Done
        </Link>
        <button
          className="primary-button"
          disabled={sharing}
          onClick={async () => {
            if (!receiptRef.current) return;
            setSharing(true); setShareError("");
            try { await shareReceipt(receiptRef.current, `mybilling-payment-${payment.payment._id}.png`); }
            catch (err) { if (!(err instanceof DOMException && err.name === "AbortError")) setShareError("Could not share this receipt. Please try again."); }
            finally { setSharing(false); }
          }}
          type="button"
        >
          {sharing ? "Preparing receipt…" : "Share receipt"}
        </button>
      </div>
    </section>
  );
}

function DistributorsPage() {
  const activeDistributors = useQuery(api.distributors.listDistributors, { activeOnly: true }) ?? [];
  const inactiveDistributors = useQuery(api.distributors.listDistributors, { activeOnly: false }) ?? [];
  const distributors = [...activeDistributors, ...inactiveDistributors];
  const createDistributor = useMutation(api.distributors.createDistributor);
  const updateDistributor = useMutation(api.distributors.updateDistributor);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ name: "", gstNumber: "", phone: "", address: "" });
  const [editing, setEditing] = useState<Doc<"distributors"> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"ACTIVE" | "INACTIVE">("ACTIVE");

  const filteredDistributors = distributors.filter((item) => {
    const matchesTab = activeTab === "ACTIVE" ? item.active : !item.active;
    if (!matchesTab) return false;
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [item.name, item.gstNumber, item.phone ?? "", item.address ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });

  function resetForm() {
    setEditing(null);
    setShowForm(false);
    setForm({ name: "", gstNumber: "", phone: "", address: "" });
  }

  function startCreate() {
    setError("");
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    setEditing(null);
    setShowForm(true);
    setForm({ name: "", gstNumber: "", phone: "", address: "" });
  }

  function startEdit(item: Doc<"distributors">) {
    setError("");
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
    setEditing(item);
    setShowForm(true);
    setForm({
      name: item.name,
      gstNumber: item.gstNumber,
      phone: item.phone ?? "",
      address: item.address ?? "",
    });
  }

  async function toggleDistributor(item: Doc<"distributors">, active: boolean) {
    setError("");
    try { await updateDistributor({
      distributorId: item._id,
      name: item.name,
      gstNumber: item.gstNumber,
      phone: item.phone ?? undefined,
      address: item.address ?? undefined,
      active,
    });
    if (editing?._id === item._id) resetForm();
    } catch (err) { setError(userErrorMessage(err, "Could not update the distributor. Please try again.")); }
  }

  return (
    <section className="content-grid">
      <div className="surface page-stack">
        <div className="section-head">
          <div>
            <p className="eyebrow">Masters</p>
            <h2>Distributors</h2>
            <p>View distributors first, then add, edit, or remove them when needed.</p>
          </div>
          <button className="primary-button" onClick={startCreate} type="button">
            <Plus size={18} />
            Add Distributor
          </button>
        </div>
        {error && !showForm ? <p className="form-error error-notice" role="alert">{error}</p> : null}
        <FieldInput
          label="Search Distributor"
          value={search}
          onChange={setSearch}
          placeholder="Search by name, GST, phone or address"
        />
        <div className="segment-group">
          <button
            className={activeTab === "ACTIVE" ? "segment active" : "segment"}
            onClick={() => setActiveTab("ACTIVE")}
            type="button"
          >
            Active
          </button>
          <button
            className={activeTab === "INACTIVE" ? "segment active" : "segment"}
            onClick={() => setActiveTab("INACTIVE")}
            type="button"
          >
            Inactive
          </button>
        </div>
        <div className="master-list">
          {filteredDistributors.map((item) => (
            <div className="master-card" key={item._id}>
              <button className="master-card-main" onClick={() => startEdit(item)} type="button">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.gstNumber}</span>
                  <small>{item.phone || item.address || "Phone or address can be added later"}</small>
                </div>
                <span className={item.active ? "badge paid" : "badge unpaid"}>
                  {item.active ? "Active" : "Inactive"}
                </span>
              </button>
              <div className="master-card-actions">
                <button className="ghost-button" onClick={() => startEdit(item)} type="button">
                  Edit
                </button>
                {item.active ? (
                  <button className="danger-button" onClick={() => void toggleDistributor(item, false)} type="button">
                    <Trash2 size={16} />
                    Deactivate
                  </button>
                ) : (
                  <button className="ghost-button" onClick={() => void toggleDistributor(item, true)} type="button">
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
          {filteredDistributors.length === 0 ? (
            <EmptyState
              title={activeTab === "ACTIVE" ? "No distributors found." : "No inactive distributors."}
              subtitle={search ? "Try a different search." : activeTab === "ACTIVE" ? "Add your first distributor to start billing." : "Deactivated distributors appear here. You can restore them."}
            />
          ) : null}
        </div>
      </div>
      <div className="surface distributor-editor" ref={editorRef} hidden={!showForm}>
        {showForm ? (
        <form
          className="stack-form"
          onSubmit={async (event) => {
            event.preventDefault(); setSaving(true); setError("");
            const payload = { name: form.name, gstNumber: form.gstNumber, phone: form.phone || undefined, address: form.address || undefined };
            try {
              if (editing) await updateDistributor({ distributorId: editing._id, active: editing.active, ...payload });
              else await createDistributor(payload);
              resetForm();
            } catch (err) { setError(userErrorMessage(err, "Could not save the distributor. Please try again.")); }
            finally { setSaving(false); }
          }}
        >
          <div className="section-head">
            <div>
              <p className="eyebrow">{editing ? "Edit distributor" : "New distributor"}</p>
              <h2>{editing ? editing.name : "Add Distributor"}</h2>
              <p>Keep the master simple so bill entry and payments stay faster.</p>
            </div>
          </div>
          {error ? <p className="form-error error-notice" role="alert">{error}</p> : null}
          <FieldInput required label="Distributor Name" value={form.name} onChange={(value) => setForm((curr) => ({ ...curr, name: value }))} />
          <FieldInput label="GST Number" value={form.gstNumber} onChange={(value) => setForm((curr) => ({ ...curr, gstNumber: value }))} />
          <FieldInput label="Phone" value={form.phone} onChange={(value) => setForm((curr) => ({ ...curr, phone: value }))} />
          <FieldInput label="Address" value={form.address} onChange={(value) => setForm((curr) => ({ ...curr, address: value }))} />
          <div className="button-row">
            <button className="primary-button" disabled={saving} type="submit">{saving ? "Saving…" : editing ? "Save changes" : "Add distributor"}</button>
            <button className="ghost-button" onClick={resetForm} type="button">
              Cancel
            </button>
          </div>
          {editing?.active ? (
            <button className="danger-button" onClick={() => void toggleDistributor(editing, false)} type="button">
              <Trash2 size={16} />
              Deactivate distributor
            </button>
          ) : null}
        </form>
        ) : (
          <div className="empty-state">
            <strong>Select a distributor or add a new one.</strong>
            <span>The form stays hidden until you choose an item, so this page remains easier to scan on mobile.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function BankAccountsPage() {
  const activeAccounts = useQuery(api.bankAccounts.listBankAccounts, { activeOnly: true }) ?? [];
  const inactiveAccounts = useQuery(api.bankAccounts.listBankAccounts, { activeOnly: false }) ?? [];
  const bankAccounts = [...activeAccounts, ...inactiveAccounts];
  const createBankAccount = useMutation(api.bankAccounts.createBankAccount);
  const updateBankAccount = useMutation(api.bankAccounts.updateBankAccount);
  const emptyForm = { bankName: "", accountHolderName: "", accountNumber: "", ifscCode: "", nickname: "" };
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState<FunctionReturnType<typeof api.bankAccounts.listBankAccounts>[number] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setNotice(""); setSaving(true);
    try {
      const payload = { ...form, nickname: form.nickname || undefined };
      if (editing) await updateBankAccount({ bankAccountId: editing._id, active: editing.active, ...payload });
      else await createBankAccount(payload);
      setNotice(editing ? "Bank account updated." : "Bank account added.");
      if (!editing) setForm(emptyForm);
    } catch (err) { setError(userErrorMessage(err, "Could not save the bank account. Please try again.")); }
    finally { setSaving(false); }
  }
  return <MasterPage title="Bank Accounts" subtitle="Manage the accounts used to record payments." onCreate={() => { setEditing(null); setForm(emptyForm); setError(""); setNotice(""); }}
    items={bankAccounts.map((item) => ({ id: item._id, title: item.bankName, subtitle: `${item.accountHolderName} · ${item.maskedAccount}`, active: item.active,
      onEdit: () => { setEditing(item); setError(""); setNotice(""); setForm({ bankName: item.bankName, accountHolderName: item.accountHolderName, accountNumber: "", ifscCode: item.ifscCode, nickname: item.nickname ?? "" }); },
    }))}
    form={<form className="stack-form" onSubmit={save}>
      <FieldInput required label="Bank name" value={form.bankName} onChange={(bankName) => setForm((f) => ({ ...f, bankName }))} />
      <FieldInput required label="Account holder name" value={form.accountHolderName} onChange={(accountHolderName) => setForm((f) => ({ ...f, accountHolderName }))} />
      <FieldInput required={!editing} label={editing ? "Replacement account number (optional)" : "Account number"} inputMode="numeric" placeholder={editing ? `Keep current account ${editing.maskedAccount}` : "Enter account number"} value={form.accountNumber} onChange={(accountNumber) => setForm((f) => ({ ...f, accountNumber }))} />
      <FieldInput required label="IFSC code" value={form.ifscCode} onChange={(ifscCode) => setForm((f) => ({ ...f, ifscCode: ifscCode.toUpperCase() }))} />
      <FieldInput label="Nickname (optional)" value={form.nickname} onChange={(nickname) => setForm((f) => ({ ...f, nickname }))} />
      {error ? <p className="form-error error-notice" role="alert">{error}</p> : null}{notice ? <p className="form-success" role="status">{notice}</p> : null}
      <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add bank account"}</button>
    </form>} />;
}

function OutletsPage() {
  const outlets = useQuery(api.outlets.listAccessibleOutlets, {}) ?? [];
  const updateOutlet = useMutation(api.outlets.updateOutlet);
  const createOutlet = useMutation(api.outlets.createOutlet);
  const [form, setForm] = useState({ name: "", address: "" });
  const [editing, setEditing] = useState<Doc<"outlets"> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      if (editing) await updateOutlet({ outletId: editing._id, name: form.name, address: form.address || undefined, active: editing.active });
      else await createOutlet({ name: form.name, address: form.address || undefined });
      setNotice(editing ? "Outlet updated." : "Outlet added.");
      if (!editing) setForm({ name: "", address: "" });
    } catch (err) { setError(userErrorMessage(err, "Could not save the outlet. Please try again.")); }
    finally { setSaving(false); }
  }
  return <MasterPage title="Outlets" subtitle="Keep each shop’s bills and payments in its own workspace." onCreate={() => { setEditing(null); setForm({ name: "", address: "" }); setError(""); setNotice(""); }}
    items={outlets.map((item) => ({ id: item._id, title: item.name, subtitle: item.address ?? "No address added", active: item.active,
      onEdit: () => { setEditing(item); setForm({ name: item.name, address: item.address ?? "" }); setError(""); setNotice(""); },
    }))}
    form={<form className="stack-form" onSubmit={save}>
      <FieldInput required label="Outlet name" value={form.name} onChange={(name) => setForm((f) => ({ ...f, name }))} />
      <FieldInput label="Address (optional)" value={form.address} onChange={(address) => setForm((f) => ({ ...f, address }))} />
      {error ? <p className="form-error error-notice" role="alert">{error}</p> : null}{notice ? <p className="form-success" role="status">{notice}</p> : null}
      <button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : editing ? "Save changes" : "Add outlet"}</button>
    </form>} />;
}

function EmployeesPage() {
  const employees = useQuery(api.users.listEmployees, {}) ?? [];
  const outlets = useQuery(api.outlets.listAccessibleOutlets, {}) ?? [];
  const createEmployee = useAction(api.users.createEmployee);
  const updateEmployee = useMutation(api.users.updateEmployee);
  const [editingEmployee, setEditingEmployee] = useState<Doc<"profiles"> | null>(null);
  const [savingEmployee, setSavingEmployee] = useState(false);
  const [employeeError, setEmployeeError] = useState("");
  const [employeeNotice, setEmployeeNotice] = useState("");
  const resetEmployeePassword = useAction(api.users.resetEmployeePassword);
  const [resetEmployeeId, setResetEmployeeId] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState("");
  const [resetNotice, setResetNotice] = useState("");
  const [resetting, setResetting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    loginIdentifier: "",
    password: "",
    outletIds: [] as string[],
  });

  return (
    <MasterPage
      title="Employees"
      onCreate={() => { setEditingEmployee(null); setForm({ name: "", loginIdentifier: "", password: "", outletIds: [] }); setEmployeeError(""); setEmployeeNotice(""); }}
      subtitle="Employees use the same sign-in page but only see bill entry/edit work."
      items={employees.map((item) => ({
        id: item.employee._id,
        title: item.employee.name,
        subtitle: `${item.employee.loginIdentifier} · ${item.outlets.map((outlet) => outlet.name).join(", ") || "No outlets"}`,
        active: item.employee.active,
        onEdit: () => {
          setEditingEmployee(item.employee);
          setResetEmployeeId(item.employee._id);
          setNewPassword(""); setResetError(""); setResetNotice("");
          setEmployeeError(""); setEmployeeNotice("");
          setForm({
            name: item.employee.name,
            loginIdentifier: item.employee.loginIdentifier,
            password: "",
            outletIds: item.outlets.map((outlet) => outlet._id),
          });
        },
      }))}
      form={
        <div className="stack-form">
          <form
            className="stack-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setSavingEmployee(true); setEmployeeError(""); setEmployeeNotice("");
              try {
                if (editingEmployee) {
                  await updateEmployee({ employeeProfileId: editingEmployee._id, name: form.name, active: editingEmployee.active, outletIds: form.outletIds as Id<"outlets">[] });
                } else {
                  await createEmployee({ name: form.name, loginIdentifier: form.loginIdentifier, password: form.password, outletIds: form.outletIds as Id<"outlets">[] });
                  setForm({ name: "", loginIdentifier: "", password: "", outletIds: [] });
                }
                setEmployeeNotice(editingEmployee ? "Employee updated." : "Employee added.");
              } catch (err) { setEmployeeError(userErrorMessage(err, "Could not save the employee. Please try again.")); }
              finally { setSavingEmployee(false); }
            }}
          >
            <FieldInput required label="Employee name" value={form.name} onChange={(value) => setForm((curr) => ({ ...curr, name: value }))} />
            {editingEmployee ? <p className="compact-note">Username: {editingEmployee.loginIdentifier}</p> : <>
              <FieldInput required label="Login identifier" value={form.loginIdentifier} onChange={(value) => setForm((curr) => ({ ...curr, loginIdentifier: value }))} />
              <FieldInput required label="Initial password" type="password" value={form.password} onChange={(value) => setForm((curr) => ({ ...curr, password: value }))} />
            </>}
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
            {employeeError ? <p className="form-error error-notice" role="alert">{employeeError}</p> : null}
            {employeeNotice ? <p className="form-success" role="status">{employeeNotice}</p> : null}
            <button className="primary-button" disabled={savingEmployee} type="submit">{savingEmployee ? "Saving…" : editingEmployee ? "Save employee changes" : "Create employee"}</button>
          </form>
          {editingEmployee ? <form
            className="stack-form recovery-form"
            onSubmit={(event) => {
              event.preventDefault();
              setResetError("");
              setResetNotice("");
              setResetting(true);
              void resetEmployeePassword({
                employeeProfileId: resetEmployeeId as Id<"profiles">,
                newPassword,
              })
                .then(() => {
                  setResetNotice("Password reset. Share the temporary password with the employee securely.");
                  setNewPassword("");
                })
                .catch((err) => setResetError(userErrorMessage(err, "Could not reset password.")))
                .finally(() => setResetting(false));
            }}
          >
            <h3>Reset Employee Password</h3>
            <label className="field">
              <span>Employee</span>
              <select disabled={resetting} required value={resetEmployeeId} onChange={(event) => { setResetEmployeeId(event.target.value); setNewPassword(""); setResetError(""); setResetNotice(""); }}>
                <option value="">Choose an employee</option>
                {employees.map(({ employee }) => (
                  <option key={employee._id} value={employee._id}>{employee.name} · {employee.loginIdentifier}</option>
                ))}
              </select>
            </label>
            <FieldInput label="Temporary Password (at least 8 characters)" type="password" value={newPassword} onChange={setNewPassword} />
            {resetError ? <p className="form-error">{resetError}</p> : null}
            {resetNotice ? <p className="form-success">{resetNotice}</p> : null}
            <button className="primary-button" disabled={resetting || !resetEmployeeId || newPassword.length < 8} type="submit">
              {resetting ? "Resetting..." : "Set New Password"}
            </button>
          </form> : null}
        </div>
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
  const duplicateCandidates =
    useQuery(
      api.bills.findPotentialDuplicateBill,
      form.distributorId && form.billDate && Number(form.amount) > 0
        ? {
            outletId: outlet._id,
            distributorId: form.distributorId as Id<"distributors">,
            billDate: form.billDate,
            amountPaise: toPaise(form.amount),
            excludeBillId: billId ? (billId as Id<"bills">) : undefined,
          }
        : "skip",
    ) ?? [];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!form.distributorId || !form.billNumber.trim() || !form.billDate || !Number.isFinite(Number(form.amount)) || toPaise(form.amount) <= 0) {
      setError("Choose a distributor and enter a bill number, date and amount greater than zero.");
      return;
    }
    setSaving(true);
    const allowSimilarDuplicate =
      duplicateCandidates.length > 0
        ? window.confirm(
            `A bill with the same distributor, date and amount already exists (${duplicateCandidates
              .map((item) => item.billNumber)
              .join(", ")}). Do you still want to save this bill?`,
          )
        : false;
    if (duplicateCandidates.length > 0 && !allowSimilarDuplicate) {
      setSaving(false);
      return;
    }
    const payload = {
      distributorId: form.distributorId as Id<"distributors">,
      billNumber: form.billNumber,
      billDate: form.billDate,
      amountPaise: toPaise(form.amount),
      allowSimilarDuplicate,
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
      setError(userErrorMessage(err, "Could not save bill."));
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
      <FieldInput required label="Bill Number" value={form.billNumber} onChange={(value) => setForm((curr) => ({ ...curr, billNumber: value }))} />
      <DateField label="Bill Date" value={form.billDate} onChange={(value) => setForm((curr) => ({ ...curr, billDate: value }))} />
      <FieldInput required label="Amount" inputMode="decimal" value={form.amount} onChange={(value) => setForm((curr) => ({ ...curr, amount: value }))} />
      {duplicateCandidates.length > 0 ? (
        <div className="compact-note warning-note">
          Same distributor, same date and same amount already exist in bill
          {duplicateCandidates.length > 1 ? "s" : ""}:{" "}
          {duplicateCandidates.map((item) => item.billNumber).join(", ")}.
          You can still save it after confirmation.
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      <button className="primary-button" disabled={saving} type="submit">
        {saving ? "Saving..." : isEdit ? "Update Bill" : "Save Bill"}
      </button>
      {isEdit && current.profile.role === "OWNER" && billData?.bill.status === "UNPAID" ? (
        <button
          className="danger-button"
          disabled={saving}
          onClick={() => {
            if (!billId) return;
            setSaving(true); setError("");
            void deleteBill({ billId: billId as Id<"bills"> })
              .then(() => navigate(`/app/${outlet._id}/bills`))
              .catch((err) => setError(userErrorMessage(err, "Could not delete the bill. Please try again.")))
              .finally(() => setSaving(false));
          }}
          type="button"
        >
          Delete Bill
        </button>
      ) : null}
    </form>
  );
}

function MasterPage({ title, subtitle, items, form, onCreate }: {
  title: string; subtitle: string;
  items: { id: string; title: string; subtitle: string; active: boolean; onEdit: () => void }[];
  form: React.ReactNode; onCreate?: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editorTitle, setEditorTitle] = useState("Add details");
  const editorRef = useRef<HTMLDivElement>(null);
  function revealEditor(title: string) {
    setEditorTitle(title); setShowForm(true);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }));
  }
  return <section className="page-stack management-page">
    <header className="page-heading"><p className="eyebrow">Workspace settings</p><h1>{title}</h1><p>{subtitle}</p></header>
    <div className="management-toolbar"><span>{items.length} {items.length === 1 ? title === "Employees" ? "employee" : title === "Outlets" ? "outlet" : "bank account" : title.toLowerCase()}</span><button type="button" className="text-action" onClick={() => { onCreate?.(); revealEditor(`Add ${title === "Employees" ? "employee" : title === "Outlets" ? "outlet" : "bank account"}`); }}><Plus size={17} />Add new</button></div>
    <div className="master-list">{items.map((item) => <button className="management-row" key={item.id} type="button" onClick={() => { item.onEdit(); revealEditor(`Edit ${title === "Employees" ? "employee" : title === "Outlets" ? "outlet" : "bank account"}`); }}><div><strong>{item.title}</strong><span>{item.subtitle}</span><span className={item.active ? "badge paid" : "badge unpaid"}>{item.active ? "Active" : "Inactive"}</span></div><ChevronRight size={18} /></button>)}</div>
    {!items.length ? <EmptyState title={`No ${title.toLowerCase()} yet`} subtitle="Choose Add new to get started." /> : null}
    <div ref={editorRef} className="surface management-editor" hidden={!showForm}><div className="results-heading"><h2>{editorTitle}</h2><button type="button" className="text-action" onClick={() => setShowForm(false)}>Close</button></div>{form}</div>
  </section>;
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

function PasswordField({ label, name, autoComplete, invalid = false }: { label: string; name: string; autoComplete: string; invalid?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <label className="field"><span>{label}</span><div className="password-field"><input aria-label={label} name={name} type={visible ? "text" : "password"} autoComplete={autoComplete} minLength={autoComplete === "new-password" ? 8 : undefined} required aria-invalid={invalid} /><button type="button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} onClick={() => setVisible((value) => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>;
}

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        required={required}
        minLength={type === "password" ? 8 : undefined}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        value={value}
      />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="field"><span>{label}</span><input type="date" value={value} onChange={(event) => onChange(event.target.value)} /></label>;
}

function SearchableSelect({
  autoFocusSearch = true,
  className,
  label,
  value,
  onChange,
  options,
  leadingIcon,
  trailingIcon,
}: {
  autoFocusSearch?: boolean;
  className?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string }[];
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (!open) return;
    if (autoFocusSearch) {
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
    function handlePointerDown(event: PointerEvent) {
      if (wrapperRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setSearch("");
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [autoFocusSearch, open]);

  return (
    <div className={`field ${className ?? ""}`.trim()} ref={wrapperRef} onKeyDown={(event) => { if (event.key === "Escape") { setOpen(false); setSearch(""); } }}>
      <span>{label}</span>
      <div className="searchable-select">
        <button
          className="searchable-select-trigger"
          aria-label={`${label}: ${selectedOption?.label || "Select"}`}
          aria-expanded={open}
          onClick={() => { setOpen((value) => !value); setSearch(""); }}
          type="button"
        >
          <span className={leadingIcon ? "select-with-icon" : undefined}>{leadingIcon}<span>{selectedOption?.label || `Select ${label}`}</span></span>
          <span className="select-trailing">{trailingIcon ?? (selectedOption ? "Change" : "Search")}</span>
        </button>
        {open ? (
          <div className="searchable-select-panel">
            <input
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${label.toLowerCase()}`}
              ref={inputRef}
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
    </div>
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
