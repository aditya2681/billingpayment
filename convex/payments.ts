import { v } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { paymentHistoryRowValidator } from "./billingValidators";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireOutletAccess, requireOwner } from "./authz";

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

export const getPayment = query({
  args: {
    paymentId: v.id("payments"),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (payment === null) {
      throw new Error("Payment not found.");
    }

    await requireOutletAccess(ctx, payment.outletId, payment.ownerProfileId);

    const distributor = await ctx.db.get(payment.distributorId);
    const bankAccount = await ctx.db.get(payment.bankAccountId);
    const paymentBills = await ctx.db
      .query("paymentBills")
      .withIndex("by_payment_id", (q) => q.eq("paymentId", payment._id))
      .take(200);
    const bills = await Promise.all(paymentBills.map((item) => ctx.db.get(item.billId)));

    return {
      payment,
      distributor,
      bankAccount: maskBankAccount(bankAccount),
      bills: bills.filter((bill): bill is Doc<"bills"> => bill !== null),
    };
  },
});

export const listPayments = query({
  args: {
    outletId: v.id("outlets"),
    distributorId: v.optional(v.id("distributors")),
    billDateFrom: v.optional(v.string()),
    billDateTo: v.optional(v.string()),
    paymentDateFrom: v.optional(v.string()),
    paymentDateTo: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const access = await requireOutletAccess(ctx, args.outletId);
    let payments = await ctx.db
      .query("payments")
      .withIndex("by_outlet_id_and_payment_date", (q) =>
        q.eq("outletId", args.outletId),
      )
      .take(300);

    payments = payments.filter((payment) => payment.ownerProfileId === access.ownerProfileId);

    if (args.distributorId) {
      payments = payments.filter((payment) => payment.distributorId === args.distributorId);
    }

    if (args.paymentDateFrom) {
      const paymentDateFrom = args.paymentDateFrom;
      payments = payments.filter((payment) => payment.paymentDate >= paymentDateFrom);
    }

    if (args.paymentDateTo) {
      const paymentDateTo = args.paymentDateTo;
      payments = payments.filter((payment) => payment.paymentDate <= paymentDateTo);
    }

    const paymentRows = await Promise.all(
      payments.map(async (payment) => {
        const distributor = await ctx.db.get(payment.distributorId);
        const bankAccount = await ctx.db.get(payment.bankAccountId);
        const paymentBills = await ctx.db
          .query("paymentBills")
          .withIndex("by_payment_id", (q) => q.eq("paymentId", payment._id))
          .take(200);
        const bills = await Promise.all(
          paymentBills.map(async (paymentBill) => {
            const bill = await ctx.db.get(paymentBill.billId);
            if (bill === null) return null;
            return {
              _id: bill._id,
              billNumber: bill.billNumber,
              billDate: bill.billDate,
              amountPaise: paymentBill.amountAtPaymentPaise,
            };
          }),
        );

        return {
          payment,
          distributor,
          bankAccount: maskBankAccount(bankAccount),
          bills: bills.filter((bill): bill is NonNullable<(typeof bills)[number]> => bill !== null),
        };
      }),
    );

    const billDateFilteredRows = paymentRows.filter((row) => {
      if (!args.billDateFrom && !args.billDateTo) {
        return true;
      }
      return row.bills.some((bill) => {
        if (args.billDateFrom && bill.billDate < args.billDateFrom) {
          return false;
        }
        if (args.billDateTo && bill.billDate > args.billDateTo) {
          return false;
        }
        return true;
      });
    });

    const searchTerm = args.search?.trim().toLowerCase();
    const filteredRows = billDateFilteredRows.filter((row) => {
      if (!searchTerm) return true;
      const totalAmount = (row.payment.totalAmountPaise / 100).toFixed(2);
      return (
        row.distributor?.name.toLowerCase().includes(searchTerm) ||
        row.bankAccount?.bankName.toLowerCase().includes(searchTerm) ||
        totalAmount.includes(searchTerm) ||
        row.bills.some((bill) => bill.billNumber.toLowerCase().includes(searchTerm))
      );
    });

    return filteredRows.sort((a, b) =>
      b.payment.paymentDate.localeCompare(a.payment.paymentDate),
    );
  },
});

export const recordPayment = mutation({
  args: {
    outletId: v.id("outlets"),
    distributorId: v.id("distributors"),
    bankAccountId: v.id("bankAccounts"),
    paymentDate: v.string(),
    billIds: v.array(v.id("bills")),
  },
  returns: v.object({ paymentId: v.id("payments"), totalAmountPaise: v.number(), billCount: v.number() }),
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const access = await requireOutletAccess(ctx, args.outletId, owner._id);

    if (args.billIds.length === 0) {
      throw new Error("Select at least one bill.");
    }
    if (args.billIds.length > 200 || new Set(args.billIds).size !== args.billIds.length) {
      throw new Error("Select up to 200 different bills per payment.");
    }

    const distributor = await ctx.db.get(args.distributorId);
    if (distributor === null || distributor.ownerProfileId !== owner._id) {
      throw new Error("Distributor not found.");
    }

    const bankAccount = await ctx.db.get(args.bankAccountId);
    if (
      bankAccount === null ||
      bankAccount.ownerProfileId !== owner._id ||
      !bankAccount.active
    ) {
      throw new Error("Bank account not found.");
    }

    const bills = await Promise.all(args.billIds.map((billId) => ctx.db.get(billId)));
    const resolvedBills = bills.filter((bill): bill is Doc<"bills"> => bill !== null);

    if (resolvedBills.length !== args.billIds.length) {
      throw new Error("One or more bills no longer exist.");
    }

    for (const bill of resolvedBills) {
      if (
        bill.ownerProfileId !== owner._id ||
        bill.outletId !== args.outletId ||
        bill.distributorId !== args.distributorId ||
        bill.status !== "UNPAID"
      ) {
        throw new Error("Selected bills are no longer eligible for payment.");
      }
      if (!Number.isSafeInteger(bill.amountPaise) || bill.amountPaise <= 0) {
        throw new Error("A selected bill has an invalid amount. Correct it before recording payment.");
      }
    }

    const totalAmountPaise = resolvedBills.reduce(
      (sum, bill) => sum + bill.amountPaise,
      0,
    );
    if (!Number.isSafeInteger(totalAmountPaise)) {
      throw new Error("The payment total is too large.");
    }
    const createdAt = Date.now();
    const paymentId = await ctx.db.insert("payments", {
      ownerProfileId: owner._id,
      outletId: args.outletId,
      distributorId: args.distributorId,
      bankAccountId: args.bankAccountId,
      paymentDate: args.paymentDate,
      totalAmountPaise,
      billCount: resolvedBills.length,
      createdByProfileId: owner._id,
      createdAt,
    });

    for (const bill of resolvedBills) {
      await ctx.db.insert("paymentBills", {
        paymentId,
        billId: bill._id,
        amountAtPaymentPaise: bill.amountPaise,
      });

      await ctx.db.patch(bill._id, {
        status: "PAID",
        paymentId,
        updatedByProfileId: owner._id,
        updatedAt: createdAt,
      });
    }

    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: owner._id,
      outletId: access.outlet._id,
      actorProfileId: owner._id,
      action: "payment_recorded",
      entityType: "payment",
      entityId: paymentId,
      afterJson: JSON.stringify({
        totalAmountPaise,
        billCount: resolvedBills.length,
      }),
    });

    return {
      paymentId,
      totalAmountPaise,
      billCount: resolvedBills.length,
    };
  },
});

export const listPaymentsPage = query({
  args: {
    outletId: v.id("outlets"),
    distributorId: v.optional(v.id("distributors")),
    billDateFrom: v.optional(v.string()),
    billDateTo: v.optional(v.string()),
    paymentDateFrom: v.optional(v.string()),
    paymentDateTo: v.optional(v.string()),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(paymentHistoryRowValidator),
  handler: async (ctx, args) => {
    await requireOwner(ctx);
    const access = await requireOutletAccess(ctx, args.outletId);
    const page = await ctx.db.query("payments")
      .withIndex("by_outlet_id_and_payment_date", (q) => {
        const range = q.eq("outletId", args.outletId);
        if (args.paymentDateFrom && args.paymentDateTo) return range.gte("paymentDate", args.paymentDateFrom).lte("paymentDate", args.paymentDateTo);
        if (args.paymentDateFrom) return range.gte("paymentDate", args.paymentDateFrom);
        if (args.paymentDateTo) return range.lte("paymentDate", args.paymentDateTo);
        return range;
      })
      .filter((q) => q.and(
        q.eq(q.field("ownerProfileId"), access.ownerProfileId),
        ...(args.distributorId ? [q.eq(q.field("distributorId"), args.distributorId)] : []),
      ))
      .order("desc")
      .paginate({ ...args.paginationOpts, maximumRowsRead: 200 });
    const rows = await Promise.all(page.page.map(async (payment) => {
      const distributor = await ctx.db.get(payment.distributorId);
      const bankAccount = await ctx.db.get(payment.bankAccountId);
      const links = await ctx.db.query("paymentBills")
        .withIndex("by_payment_id", (q) => q.eq("paymentId", payment._id)).take(200);
      const bills = await Promise.all(links.map(async (link) => {
        const bill = await ctx.db.get(link.billId);
        return bill ? {
          _id: bill._id,
          billNumber: bill.billNumber,
          billDate: bill.billDate,
          amountPaise: link.amountAtPaymentPaise,
        } : null;
      }));
      return {
        payment,
        distributor: distributor ? { _id: distributor._id, name: distributor.name } : null,
        bankAccount: maskBankAccount(bankAccount),
        bills: bills.filter((bill): bill is NonNullable<typeof bill> => bill !== null),
      };
    }));
    const search = args.search?.trim().toLowerCase();
    return {
      ...page,
      page: rows.filter((row) => {
        if ((args.billDateFrom || args.billDateTo) && !row.bills.some((bill) =>
          (!args.billDateFrom || bill.billDate >= args.billDateFrom) &&
          (!args.billDateTo || bill.billDate <= args.billDateTo),
        )) return false;
        return !search || !!row.distributor?.name.toLowerCase().includes(search) ||
          !!row.bankAccount?.bankName.toLowerCase().includes(search) ||
          (row.payment.totalAmountPaise / 100).toFixed(2).includes(search) ||
          row.bills.some((bill) => bill.billNumber.toLowerCase().includes(search));
      }),
    };
  },
});
