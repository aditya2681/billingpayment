import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import {
  normalizeBillNumber,
  requireOutletAccess,
  requireOwner,
} from "./authz";

function maskBankAccount(
  bankAccount:
    | {
        _id: Id<"bankAccounts">;
        bankName: string;
        accountLast4: string;
        accountHolderName?: string;
      }
    | null,
) {
  if (bankAccount === null) return null;
  return {
    _id: bankAccount._id,
    bankName: bankAccount.bankName,
    accountLast4: bankAccount.accountLast4,
    accountHolderName: bankAccount.accountHolderName,
  };
}

const billFiltersValidator = {
  outletId: v.id("outlets"),
  status: v.optional(v.union(v.literal("ALL"), v.literal("UNPAID"), v.literal("PAID"))),
  distributorId: v.optional(v.id("distributors")),
  fromDate: v.optional(v.string()),
  toDate: v.optional(v.string()),
  search: v.optional(v.string()),
};

async function listSimilarBillsByDateAndAmount(
  ctx: QueryCtx,
  args: {
    outletId: Id<"outlets">;
    distributorId: Id<"distributors">;
    billDate: string;
    amountPaise: number;
    excludeBillId?: Id<"bills">;
  },
) {
  const rows = await ctx.db
    .query("bills")
    .withIndex("by_outlet_id_and_distributor_id_and_bill_date", (q) =>
      q
        .eq("outletId", args.outletId)
        .eq("distributorId", args.distributorId)
        .eq("billDate", args.billDate),
    )
    .take(20);

  return rows.filter(
    (bill) =>
      bill.amountPaise === args.amountPaise &&
      bill._id !== args.excludeBillId,
  );
}

export const dashboardBillStats = query({
  args: {
    outletId: v.id("outlets"),
  },
  handler: async (ctx, args) => {
    const { ownerProfileId } = await requireOutletAccess(ctx, args.outletId);
    const bills = await ctx.db
      .query("bills")
      .withIndex("by_owner_profile_id_and_outlet_id", (q) =>
        q.eq("ownerProfileId", ownerProfileId).eq("outletId", args.outletId),
      )
      .take(200);

    const totalBills = bills.length;
    const unpaidBills = bills.filter((bill) => bill.status === "UNPAID");
    const paidBills = bills.filter((bill) => bill.status === "PAID");

    return {
      totalBills,
      unpaidCount: unpaidBills.length,
      unpaidAmountPaise: unpaidBills.reduce((sum, bill) => sum + bill.amountPaise, 0),
      paidCount: paidBills.length,
      paidAmountPaise: paidBills.reduce((sum, bill) => sum + bill.amountPaise, 0),
      recentBills: bills
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 6),
    };
  },
});

export const listBills = query({
  args: billFiltersValidator,
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const access = await requireOutletAccess(ctx, args.outletId);
    let bills = await ctx.db
      .query("bills")
      .withIndex("by_owner_profile_id_and_outlet_id", (q) =>
        q.eq("ownerProfileId", access.ownerProfileId).eq("outletId", args.outletId),
      )
      .take(300);

    if (args.status && args.status !== "ALL") {
      bills = bills.filter((bill) => bill.status === args.status);
    }

    if (args.distributorId) {
      bills = bills.filter((bill) => bill.distributorId === args.distributorId);
    }

    if (args.fromDate) {
      bills = bills.filter((bill) => bill.billDate >= args.fromDate!);
    }

    if (args.toDate) {
      bills = bills.filter((bill) => bill.billDate <= args.toDate!);
    }

    const distributors = await Promise.all(
      bills.map((bill) => ctx.db.get(bill.distributorId)),
    );
    const bankAccounts = await Promise.all(
      bills.map((bill) => (bill.paymentId ? loadPaymentBank(ctx, bill.paymentId) : Promise.resolve(null))),
    );

    const searchTerm = args.search?.trim().toLowerCase();
    const rows = bills.map((bill, index) => ({
      ...bill,
      distributor: distributors[index],
      bankAccount: maskBankAccount(bankAccounts[index]),
    }));

    const filtered = searchTerm
      ? rows.filter((row) => {
          const amountString = (row.amountPaise / 100).toFixed(2);
          return (
            row.billNumber.toLowerCase().includes(searchTerm) ||
            row.distributor?.name.toLowerCase().includes(searchTerm) ||
            amountString.includes(searchTerm)
          );
        })
      : rows;

    return filtered.sort((a, b) => b.billDate.localeCompare(a.billDate));
  },
});

export const getBill = query({
  args: {
    billId: v.id("bills"),
  },
  handler: async (ctx, args) => {
    const bill = await ctx.db.get(args.billId);
    if (bill === null) {
      throw new Error("Bill not found.");
    }

    await requireOutletAccess(ctx, bill.outletId);
    const distributor = await ctx.db.get(bill.distributorId);
    const payment = bill.paymentId ? await ctx.db.get(bill.paymentId) : null;
    const bankAccount = payment ? await ctx.db.get(payment.bankAccountId) : null;
    return { bill, distributor, payment, bankAccount: maskBankAccount(bankAccount) };
  },
});

export const getPendingBills = query({
  args: {
    outletId: v.id("outlets"),
    distributorId: v.id("distributors"),
  },
  handler: async (ctx, args) => {
    const access = await requireOutletAccess(ctx, args.outletId);
    const distributor = await ctx.db.get(args.distributorId);
    if (distributor === null || distributor.ownerProfileId !== access.ownerProfileId) {
      throw new Error("Distributor not found.");
    }

    return await ctx.db
      .query("bills")
      .withIndex("by_outlet_id_and_distributor_id_and_status", (q) =>
        q
          .eq("outletId", args.outletId)
          .eq("distributorId", args.distributorId)
          .eq("status", "UNPAID"),
      )
      .take(200);
  },
});

export const listPendingDistributorSummaries = query({
  args: {
    outletId: v.id("outlets"),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOutletAccess(ctx, args.outletId);
    const unpaidBills = await ctx.db
      .query("bills")
      .withIndex("by_outlet_id_and_status", (q) =>
        q.eq("outletId", args.outletId).eq("status", "UNPAID"),
      )
      .take(500);

    const summaryMap = new Map<
      Id<"distributors">,
      {
        distributorId: Id<"distributors">;
        billCount: number;
        totalAmountPaise: number;
        latestBillDate: string;
      }
    >();

    for (const bill of unpaidBills) {
      if (bill.ownerProfileId !== access.ownerProfileId) continue;
      const existing = summaryMap.get(bill.distributorId);
      if (existing) {
        existing.billCount += 1;
        existing.totalAmountPaise += bill.amountPaise;
        if (bill.billDate > existing.latestBillDate) {
          existing.latestBillDate = bill.billDate;
        }
        continue;
      }

      summaryMap.set(bill.distributorId, {
        distributorId: bill.distributorId,
        billCount: 1,
        totalAmountPaise: bill.amountPaise,
        latestBillDate: bill.billDate,
      });
    }

    const baseRows = await Promise.all(
      Array.from(summaryMap.values()).map(async (summary) => {
        const distributor = await ctx.db.get(summary.distributorId);
        if (
          distributor === null ||
          distributor.ownerProfileId !== access.ownerProfileId
        ) {
          return null;
        }
        return {
          ...summary,
          distributor,
        };
      }),
    );

    const searchTerm = args.search?.trim().toLowerCase();
    const filteredRows = baseRows
      .filter(
        (
          row,
        ): row is NonNullable<(typeof baseRows)[number]> => row !== null,
      )
      .filter((row) => {
        if (!searchTerm) return true;
        return (
          row.distributor.name.toLowerCase().includes(searchTerm) ||
          row.billCount.toString().includes(searchTerm) ||
          (row.totalAmountPaise / 100).toFixed(2).includes(searchTerm)
        );
      });

    return filteredRows.sort((a, b) => {
      if (b.totalAmountPaise !== a.totalAmountPaise) {
        return b.totalAmountPaise - a.totalAmountPaise;
      }
      return a.distributor.name.localeCompare(b.distributor.name);
    });
  },
});

export const findPotentialDuplicateBill = query({
  args: {
    outletId: v.id("outlets"),
    distributorId: v.id("distributors"),
    billDate: v.string(),
    amountPaise: v.number(),
    excludeBillId: v.optional(v.id("bills")),
  },
  handler: async (ctx, args) => {
    const access = await requireOutletAccess(ctx, args.outletId);
    const distributor = await ctx.db.get(args.distributorId);
    if (distributor === null || distributor.ownerProfileId !== access.ownerProfileId) {
      throw new Error("Distributor not found.");
    }

    const duplicates = await listSimilarBillsByDateAndAmount(ctx, args);
    return duplicates.map((bill) => ({
      _id: bill._id,
      billNumber: bill.billNumber,
      billDate: bill.billDate,
      amountPaise: bill.amountPaise,
      status: bill.status,
    }));
  },
});

export const createBill = mutation({
  args: {
    outletId: v.id("outlets"),
    distributorId: v.id("distributors"),
    billNumber: v.string(),
    billDate: v.string(),
    amountPaise: v.number(),
    allowSimilarDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const access = await requireOutletAccess(ctx, args.outletId);
    const distributor = await ctx.db.get(args.distributorId);
    if (distributor === null || distributor.ownerProfileId !== access.ownerProfileId) {
      throw new Error("Distributor not found.");
    }

    if (args.amountPaise <= 0) {
      throw new Error("Amount must be greater than zero.");
    }

    const billNumberNormalized = normalizeBillNumber(args.billNumber);
    const duplicate = await ctx.db
      .query("bills")
      .withIndex("by_outlet_id_and_distributor_id_and_bill_number_normalized", (q) =>
        q
          .eq("outletId", args.outletId)
          .eq("distributorId", args.distributorId)
          .eq("billNumberNormalized", billNumberNormalized),
      )
      .unique();

    if (duplicate !== null) {
      throw new Error("A bill with the same distributor and bill number already exists.");
    }

    const similarBills = await listSimilarBillsByDateAndAmount(ctx, args);
    if (similarBills.length > 0 && !args.allowSimilarDuplicate) {
      throw new Error("A bill with the same distributor, date and amount already exists. Confirm to save another bill.");
    }

    const now = Date.now();
    const billId = await ctx.db.insert("bills", {
      ownerProfileId: access.ownerProfileId,
      outletId: args.outletId,
      distributorId: args.distributorId,
      billNumber: args.billNumber.trim(),
      billNumberNormalized,
      billDate: args.billDate,
      amountPaise: args.amountPaise,
      status: "UNPAID",
      createdByProfileId: access.profile._id,
      createdAt: now,
      updatedByProfileId: access.profile._id,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: access.ownerProfileId,
      outletId: args.outletId,
      actorProfileId: access.profile._id,
      action: "bill_created",
      entityType: "bill",
      entityId: billId,
      afterJson: JSON.stringify(args),
    });

    return billId;
  },
});

export const updateBill = mutation({
  args: {
    billId: v.id("bills"),
    distributorId: v.id("distributors"),
    billNumber: v.string(),
    billDate: v.string(),
    amountPaise: v.number(),
    allowSimilarDuplicate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const bill = await ctx.db.get(args.billId);
    if (bill === null) {
      throw new Error("Bill not found.");
    }

    const access = await requireOutletAccess(ctx, bill.outletId);
    const distributor = await ctx.db.get(args.distributorId);
    if (distributor === null || distributor.ownerProfileId !== access.ownerProfileId) {
      throw new Error("Distributor not found.");
    }

    const billNumberNormalized = normalizeBillNumber(args.billNumber);
    const duplicateBillNumber = await ctx.db
      .query("bills")
      .withIndex("by_outlet_id_and_distributor_id_and_bill_number_normalized", (q) =>
        q
          .eq("outletId", bill.outletId)
          .eq("distributorId", args.distributorId)
          .eq("billNumberNormalized", billNumberNormalized),
      )
      .unique();

    if (duplicateBillNumber !== null && duplicateBillNumber._id !== bill._id) {
      throw new Error("A bill with the same distributor and bill number already exists.");
    }

    const similarBills = await listSimilarBillsByDateAndAmount(ctx, {
      outletId: bill.outletId,
      distributorId: args.distributorId,
      billDate: args.billDate,
      amountPaise: args.amountPaise,
      excludeBillId: bill._id,
    });
    if (similarBills.length > 0 && !args.allowSimilarDuplicate) {
      throw new Error("A bill with the same distributor, date and amount already exists. Confirm to save another bill.");
    }

    const before = JSON.stringify(bill);
    await ctx.db.patch(bill._id, {
      distributorId: args.distributorId,
      billNumber: args.billNumber.trim(),
      billNumberNormalized,
      billDate: args.billDate,
      amountPaise: args.amountPaise,
      updatedByProfileId: access.profile._id,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(bill._id);
    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: access.ownerProfileId,
      outletId: bill.outletId,
      actorProfileId: access.profile._id,
      action: bill.status === "PAID" ? "paid_bill_corrected" : "bill_updated",
      entityType: "bill",
      entityId: bill._id,
      beforeJson: before,
      afterJson: JSON.stringify(updated),
    });

    return updated;
  },
});

export const deleteUnpaidBill = mutation({
  args: {
    billId: v.id("bills"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const bill = await ctx.db.get(args.billId);
    if (bill === null || bill.ownerProfileId !== owner._id) {
      throw new Error("Bill not found.");
    }

    if (bill.status !== "UNPAID") {
      throw new Error("Only unpaid bills can be deleted.");
    }

    await ctx.db.delete(bill._id);
    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: owner._id,
      outletId: bill.outletId,
      actorProfileId: owner._id,
      action: "bill_deleted",
      entityType: "bill",
      entityId: bill._id,
      beforeJson: JSON.stringify(bill),
    });
  },
});

async function loadPaymentBank(ctx: QueryCtx, paymentId: Id<"payments">) {
  const payment = await ctx.db.get(paymentId);
  if (payment === null) {
    return null;
  }
  return await ctx.db.get(payment.bankAccountId);
}
