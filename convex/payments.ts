import { v } from "convex/values";
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

export const recordPayment = mutation({
  args: {
    outletId: v.id("outlets"),
    distributorId: v.id("distributors"),
    bankAccountId: v.id("bankAccounts"),
    paymentDate: v.string(),
    billIds: v.array(v.id("bills")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const access = await requireOutletAccess(ctx, args.outletId, owner._id);

    if (args.billIds.length === 0) {
      throw new Error("Select at least one bill.");
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
    }

    const totalAmountPaise = resolvedBills.reduce(
      (sum, bill) => sum + bill.amountPaise,
      0,
    );
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
