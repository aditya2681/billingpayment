import { paginationOptsValidator, paginationResultValidator, type PaginationResult, type FunctionReturnType } from "convex/server";
import { v, type Infer } from "convex/values";
import { api } from "./_generated/api";
import { query } from "./_generated/server";
import { requireOwner } from "./authz";
import { billFiltersValidator } from "./bills";
import { billHistoryRowValidator } from "./billingValidators";

const reportRowValidator = billHistoryRowValidator.extend({
  paidAmountPaise: v.union(v.number(), v.null()),
  paymentReference: v.union(v.string(), v.null()),
  paymentDistributorName: v.union(v.string(), v.null()),
});

export const listReportPage = query({
  args: {
    ...billFiltersValidator,
    bankAccountId: v.optional(v.id("bankAccounts")),
    paymentGroup: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(reportRowValidator),
  handler: async (ctx, args): Promise<PaginationResult<Infer<typeof reportRowValidator>>> => {
    await requireOwner(ctx);
    if ((args.billDateFrom && args.billDateTo && args.billDateFrom > args.billDateTo) ||
        (args.paymentDateFrom && args.paymentDateTo && args.paymentDateFrom > args.paymentDateTo)) {
      throw new Error("The end date must be on or after the start date.");
    }
    const { bankAccountId, paymentGroup, ...billArgs } = args;
    const page: FunctionReturnType<typeof api.bills.listBillsPage> = await ctx.runQuery(api.bills.listBillsPage, billArgs);
    const groupSearch = paymentGroup?.trim().toLowerCase();
    const rows = await Promise.all(page.page.filter((row) => {
      if (bankAccountId && row.payment?.bankAccountId !== bankAccountId) return false;
      if (groupSearch) {
        const reference = row.payment ? `PAY-${row.payment._id.slice(-8)}` : "";
        if (!reference.toLowerCase().includes(groupSearch) && !row.payment?._id.toLowerCase().includes(groupSearch)) return false;
      }
      return true;
    }).map(async (row) => {
      const link = row.payment ? await ctx.db.query("paymentBills")
        .withIndex("by_bill_id", (q) => q.eq("billId", row._id))
        .filter((q) => q.eq(q.field("paymentId"), row.payment!._id))
        .unique() : null;
      const paymentDistributor = row.payment ? await ctx.db.get(row.payment.distributorId) : null;
      return {
        ...row,
        paidAmountPaise: link?.amountAtPaymentPaise ?? null,
        paymentReference: row.payment ? `PAY-${row.payment._id.slice(-8).toUpperCase()}` : null,
        paymentDistributorName: paymentDistributor?.name ?? null,
      };
    }));
    return { ...page, page: rows };
  },
});
