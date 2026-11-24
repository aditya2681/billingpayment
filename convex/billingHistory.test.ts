/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import type { FunctionReturnType } from "convex/server";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"]);
const makeTest = () => convexTest(schema, modules);

async function seed(t: ReturnType<typeof makeTest>, count = 350) {
  return t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", { name: "Owner" });
    const otherUserId = await ctx.db.insert("users", { name: "Other owner" });
    const employeeUserId = await ctx.db.insert("users", { name: "Employee" });
    const ownerProfileId = await ctx.db.insert("profiles", { authUserId: userId, role: "OWNER", name: "Owner", loginIdentifier: "owner", active: true, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("profiles", { authUserId: otherUserId, role: "OWNER", name: "Other", loginIdentifier: "other", active: true, createdAt: 1, updatedAt: 1 });
    await ctx.db.insert("profiles", { authUserId: employeeUserId, role: "EMPLOYEE", ownerProfileId, name: "Employee", loginIdentifier: "employee", active: true, createdAt: 1, updatedAt: 1 });
    const outletId = await ctx.db.insert("outlets", { ownerProfileId, name: "Test outlet", active: true, createdAt: 1, updatedAt: 1 });
    // Historical bills remain searchable even when their distributor is inactive.
    const distributorId = await ctx.db.insert("distributors", { ownerProfileId, name: "Kiran supplies", gstNumber: "TEST", active: false, createdAt: 1, updatedAt: 1 });
    const bankAccountId = await ctx.db.insert("bankAccounts", { ownerProfileId, bankName: "Test bank", accountHolderName: "Owner", accountNumberProtected: "12345678", accountLast4: "5678", ifscCode: "TEST0001", active: true, createdAt: 1, updatedAt: 1 });
    const billIds = [];
    for (let i = 0; i < count; i++) billIds.push(await ctx.db.insert("bills", {
      ownerProfileId, outletId, distributorId,
      billNumber: `B-${i}`, billNumberNormalized: `B-${i}`,
      billDate: i === 0 ? "2026-08-01" : i === count - 1 ? "2026-11-11" : "2026-10-01",
      amountPaise: 10000 + i, status: "UNPAID",
      createdByProfileId: ownerProfileId, updatedByProfileId: ownerProfileId, createdAt: i, updatedAt: i,
    }));
    return { userId, otherUserId, employeeUserId, ownerProfileId, outletId, distributorId, bankAccountId, billIds };
  });
}

test("bill history reaches every bill past the old 300-row cutoff, newest dates first", async () => {
  const t = makeTest();
  const data = await seed(t);
  const owner = t.withIdentity({ subject: data.userId });
  const legacy = await owner.query(api.bills.listBills, { outletId: data.outletId });
  expect(legacy).toHaveLength(300);
  const rows = [];
  let cursor: string | null = null;
  for (;;) {
    const page: FunctionReturnType<typeof api.bills.listBillsPage> = await owner.query(api.bills.listBillsPage, { outletId: data.outletId, paginationOpts: { cursor, numItems: 30 } });
    rows.push(...page.page);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(rows).toHaveLength(350);
  expect(new Set(rows.map((bill) => bill._id)).size).toBe(350);
  expect(rows[0]._id).toBe(data.billIds[349]);
  expect(rows.at(-1)?._id).toBe(data.billIds[0]);
  expect(rows[0].distributor?.name).toBe("Kiran supplies");
});

test("search follows empty pages to find an old bill instead of dropping it", async () => {
  const t = makeTest(); const data = await seed(t);
  const owner = t.withIdentity({ subject: data.userId });
  let cursor: string | null = null;
  const matches = [];
  let emptyPages = 0;
  for (;;) {
    const page: FunctionReturnType<typeof api.bills.listBillsPage> = await owner.query(api.bills.listBillsPage, { outletId: data.outletId, search: "B-0", paginationOpts: { cursor, numItems: 30 } });
    matches.push(...page.page);
    if (!page.page.length) emptyPages++;
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(emptyPages).toBeGreaterThan(0);
  expect(matches.map((bill) => bill._id)).toEqual([data.billIds[0]]);
});

test("bill date/distributor/status filters reach newer bills beyond the old cutoff", async () => {
  const t = makeTest(); const data = await seed(t);
  const page = await t.withIdentity({ subject: data.userId }).query(api.bills.listBillsPage, {
    outletId: data.outletId, distributorId: data.distributorId, status: "UNPAID",
    billDateFrom: "2026-11-01", billDateTo: "2026-11-30", paginationOpts: { cursor: null, numItems: 30 },
  });
  expect(page.page.map((bill) => bill._id)).toEqual([data.billIds[349]]);
});

test("payment date filtering uses the linked payment and excludes unpaid bills", async () => {
  const t = makeTest(); const data = await seed(t, 8);
  const owner = t.withIdentity({ subject: data.userId });
  await owner.mutation(api.payments.recordPayment, { outletId: data.outletId, distributorId: data.distributorId, bankAccountId: data.bankAccountId, paymentDate: "2026-11-10", billIds: [data.billIds[7]] });
  const page: FunctionReturnType<typeof api.bills.listBillsPage> = await owner.query(api.bills.listBillsPage, { outletId: data.outletId, paymentDateFrom: "2026-11-01", paymentDateTo: "2026-11-30", paginationOpts: { cursor: null, numItems: 30 } });
  expect(page.page.map((bill) => bill._id)).toEqual([data.billIds[7]]);
  expect(page.page[0].payment?.paymentDate).toBe("2026-11-10");
  expect(page.page[0].bankAccount).not.toHaveProperty("accountNumberProtected");
});

test("the summary resolves exact selected IDs past the pending-bill cap and detects paid selections", async () => {
  const t = makeTest(); const data = await seed(t, 220);
  const owner = t.withIdentity({ subject: data.userId });
  const ids = data.billIds.slice(205, 215);
  const selection = await owner.query(api.bills.getPaymentSelection, { outletId: data.outletId, distributorId: data.distributorId, billIds: ids });
  expect(selection.bills).toHaveLength(10);
  expect(selection.invalidCount).toBe(0);
  await owner.mutation(api.payments.recordPayment, { outletId: data.outletId, distributorId: data.distributorId, bankAccountId: data.bankAccountId, paymentDate: "2026-11-10", billIds: [ids[0]] });
  const changed = await owner.query(api.bills.getPaymentSelection, { outletId: data.outletId, distributorId: data.distributorId, billIds: ids });
  expect(changed.bills).toHaveLength(9);
  expect(changed.invalidCount).toBe(1);
});

test("payment history reaches all groups past 300 and preserves historical amounts", async () => {
  const t = makeTest(); const data = await seed(t, 310);
  await t.run(async (ctx) => {
    for (const [i, billId] of data.billIds.entries()) {
      const paymentId = await ctx.db.insert("payments", { ownerProfileId: data.ownerProfileId, outletId: data.outletId, distributorId: data.distributorId, bankAccountId: data.bankAccountId, paymentDate: i === 309 ? "2026-11-11" : "2026-10-01", totalAmountPaise: 10000, billCount: 1, createdByProfileId: data.ownerProfileId, createdAt: i });
      await ctx.db.insert("paymentBills", { paymentId, billId, amountAtPaymentPaise: 10000 });
      await ctx.db.patch(billId, { status: "PAID", paymentId });
    }
  });
  const owner = t.withIdentity({ subject: data.userId });
  let cursor: string | null = null;
  const rows = [];
  for (;;) {
    const page: FunctionReturnType<typeof api.payments.listPaymentsPage> = await owner.query(api.payments.listPaymentsPage, { outletId: data.outletId, paginationOpts: { cursor, numItems: 30 } });
    rows.push(...page.page);
    if (page.isDone) break;
    cursor = page.continueCursor;
  }
  expect(rows).toHaveLength(310);
  expect(new Set(rows.map((r) => r.payment._id)).size).toBe(310);
  expect(rows[0].payment.paymentDate).toBe("2026-11-11");
  expect(rows[0].bills[0].amountPaise).toBe(10000);
});

test("histories and selected bills reject anonymous callers, employees, and another owner", async () => {
  const t = makeTest(); const data = await seed(t, 1);
  for (const caller of [t, t.withIdentity({ subject: data.otherUserId }), t.withIdentity({ subject: data.employeeUserId })]) {
    await expect(caller.query(api.bills.listBillsPage, { outletId: data.outletId, paginationOpts: { cursor: null, numItems: 30 } })).rejects.toThrow();
    await expect(caller.query(api.payments.listPaymentsPage, { outletId: data.outletId, paginationOpts: { cursor: null, numItems: 30 } })).rejects.toThrow();
    await expect(caller.query(api.bills.getPaymentSelection, { outletId: data.outletId, distributorId: data.distributorId, billIds: data.billIds })).rejects.toThrow();
  }
});

test("payment recording rejects duplicate bill IDs instead of doubling the amount", async () => {
  const t = makeTest(); const data = await seed(t, 1);
  await expect(t.withIdentity({ subject: data.userId }).mutation(api.payments.recordPayment, { outletId: data.outletId, distributorId: data.distributorId, bankAccountId: data.bankAccountId, paymentDate: "2026-11-10", billIds: [data.billIds[0], data.billIds[0]] })).rejects.toThrow("different bills");
});

test("creating and editing bills rejects zero, negative and fractional-paise amounts", async () => {
  const t = makeTest(); const data = await seed(t, 1);
  const owner = t.withIdentity({ subject: data.userId });
  for (const amountPaise of [0, -100, 1.5, Number.NaN]) {
    await expect(owner.mutation(api.bills.createBill, {
      outletId: data.outletId, distributorId: data.distributorId, billNumber: "INVALID",
      billDate: "2026-11-11", amountPaise,
    })).rejects.toThrow("greater than zero");
    await expect(owner.mutation(api.bills.updateBill, {
      billId: data.billIds[0], distributorId: data.distributorId, billNumber: "B-0",
      billDate: "2026-11-11", amountPaise,
    })).rejects.toThrow("greater than zero");
  }
});

test("a legacy bill with an invalid amount cannot create a zero-total payment", async () => {
  const t = makeTest(); const data = await seed(t, 1);
  await t.run(async (ctx) => { await ctx.db.patch(data.billIds[0], { amountPaise: 0 }); });
  await expect(t.withIdentity({ subject: data.userId }).mutation(api.payments.recordPayment, {
    outletId: data.outletId, distributorId: data.distributorId, bankAccountId: data.bankAccountId,
    paymentDate: "2026-11-11", billIds: data.billIds,
  })).rejects.toThrow("invalid amount");
});

test("editing bank details preserves a masked account number when no replacement is entered", async () => {
  const t = makeTest(); const data = await seed(t, 1);
  const response = await t.withIdentity({ subject: data.userId }).mutation(api.bankAccounts.updateBankAccount, {
    bankAccountId: data.bankAccountId, bankName: "Updated bank", accountHolderName: "Owner",
    accountNumber: "", ifscCode: "TEST0001", active: true,
  });
  expect(response).toBeNull();
  const account = await t.run((ctx) => ctx.db.get(data.bankAccountId));
  expect(account?.accountNumberProtected).toBe("12345678");
  expect(account?.accountLast4).toBe("5678");
  expect(account?.bankName).toBe("Updated bank");
  const logs = await t.run((ctx) => ctx.db.query("auditLogs").take(10));
  expect(logs[0].afterJson).not.toContain("12345678");
});
