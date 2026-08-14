import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { maskAccountNumber, requireOwner, requireProfile } from "./authz";

export const listBankAccounts = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const ownerProfileId =
      profile.role === "OWNER" ? profile._id : profile.ownerProfileId!;
    const rows = await ctx.db
      .query("bankAccounts")
      .withIndex("by_owner_profile_id_and_active", (q) =>
        q.eq("ownerProfileId", ownerProfileId).eq("active", args.activeOnly ?? true),
      )
      .take(100);

    return rows.map((row) => ({
      _id: row._id,
      _creationTime: row._creationTime,
      ownerProfileId: row.ownerProfileId,
      bankName: row.bankName,
      accountHolderName: row.accountHolderName,
      accountLast4: row.accountLast4,
      ifscCode: row.ifscCode,
      nickname: row.nickname,
      active: row.active,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      maskedAccount: `****${row.accountLast4}`,
    }));
  },
});

export const createBankAccount = mutation({
  args: {
    bankName: v.string(),
    accountHolderName: v.string(),
    accountNumber: v.string(),
    ifscCode: v.string(),
    nickname: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const now = Date.now();
    const accountNumberProtected = args.accountNumber.replace(/\s+/g, "");
    const bankAccountId = await ctx.db.insert("bankAccounts", {
      ownerProfileId: owner._id,
      bankName: args.bankName.trim(),
      accountHolderName: args.accountHolderName.trim(),
      accountNumberProtected,
      accountLast4: maskAccountNumber(args.accountNumber),
      ifscCode: args.ifscCode.trim().toUpperCase(),
      nickname: args.nickname?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: owner._id,
      actorProfileId: owner._id,
      action: "bank_account_created",
      entityType: "bankAccount",
      entityId: bankAccountId,
      afterJson: JSON.stringify({
        bankName: args.bankName.trim(),
        accountLast4: maskAccountNumber(args.accountNumber),
      }),
    });

    return bankAccountId;
  },
});

export const updateBankAccount = mutation({
  args: {
    bankAccountId: v.id("bankAccounts"),
    bankName: v.string(),
    accountHolderName: v.string(),
    accountNumber: v.string(),
    ifscCode: v.string(),
    nickname: v.optional(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const account = await ctx.db.get(args.bankAccountId);
    if (account === null || account.ownerProfileId !== owner._id) {
      throw new Error("Bank account not found.");
    }

    const before = JSON.stringify({
      ...account,
      accountNumberProtected: undefined,
    });
    await ctx.db.patch(account._id, {
      bankName: args.bankName.trim(),
      accountHolderName: args.accountHolderName.trim(),
      accountNumberProtected: args.accountNumber.replace(/\s+/g, ""),
      accountLast4: maskAccountNumber(args.accountNumber),
      ifscCode: args.ifscCode.trim().toUpperCase(),
      nickname: args.nickname?.trim() || undefined,
      active: args.active,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(account._id);
    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: owner._id,
      actorProfileId: owner._id,
      action: "bank_account_updated",
      entityType: "bankAccount",
      entityId: account._id,
      beforeJson: before,
      afterJson: JSON.stringify(updated),
    });

    return updated;
  },
});
