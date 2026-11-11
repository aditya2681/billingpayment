import { v } from "convex/values";
import schema from "./schema";

export const billDocumentValidator = v.object({
  ...schema.tables.bills.validator.fields,
  _id: v.id("bills"),
  _creationTime: v.number(),
});

export const paymentDocumentValidator = v.object({
  ...schema.tables.payments.validator.fields,
  _id: v.id("payments"),
  _creationTime: v.number(),
});

export const distributorSummaryValidator = v.union(v.null(), v.object({
  _id: v.id("distributors"),
  name: v.string(),
}));

export const bankSummaryValidator = v.union(v.null(), v.object({
  _id: v.id("bankAccounts"),
  bankName: v.string(),
  accountLast4: v.string(),
  accountHolderName: v.optional(v.string()),
}));

export const billHistoryRowValidator = billDocumentValidator.extend({
  distributor: distributorSummaryValidator,
  payment: v.union(v.null(), paymentDocumentValidator),
  bankAccount: bankSummaryValidator,
});

export const paymentHistoryRowValidator = v.object({
  payment: paymentDocumentValidator,
  distributor: distributorSummaryValidator,
  bankAccount: bankSummaryValidator,
  bills: v.array(v.object({
    _id: v.id("bills"),
    billNumber: v.string(),
    billDate: v.string(),
    amountPaise: v.number(),
  })),
});
