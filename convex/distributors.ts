import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireOwner, requireProfile } from "./authz";

export const listDistributors = query({
  args: { activeOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const profile = await requireProfile(ctx);
    const ownerProfileId =
      profile.role === "OWNER" ? profile._id : profile.ownerProfileId!;
    const rows = await ctx.db
      .query("distributors")
      .withIndex("by_owner_profile_id_and_active", (q) =>
        q.eq("ownerProfileId", ownerProfileId).eq("active", args.activeOnly ?? true),
      )
      .take(100);
    return rows;
  },
});

export const createDistributor = mutation({
  args: {
    name: v.string(),
    gstNumber: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const now = Date.now();
    const distributorId = await ctx.db.insert("distributors", {
      ownerProfileId: owner._id,
      name: args.name.trim(),
      gstNumber: args.gstNumber.trim().toUpperCase(),
      phone: args.phone?.trim() || undefined,
      address: args.address?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: owner._id,
      actorProfileId: owner._id,
      action: "distributor_created",
      entityType: "distributor",
      entityId: distributorId,
      afterJson: JSON.stringify(args),
    });

    return distributorId;
  },
});

export const updateDistributor = mutation({
  args: {
    distributorId: v.id("distributors"),
    name: v.string(),
    gstNumber: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const distributor = await ctx.db.get(args.distributorId);
    if (distributor === null || distributor.ownerProfileId !== owner._id) {
      throw new Error("Distributor not found.");
    }

    const before = JSON.stringify(distributor);
    await ctx.db.patch(distributor._id, {
      name: args.name.trim(),
      gstNumber: args.gstNumber.trim().toUpperCase(),
      phone: args.phone?.trim() || undefined,
      address: args.address?.trim() || undefined,
      active: args.active,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(distributor._id);
    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: owner._id,
      actorProfileId: owner._id,
      action: "distributor_updated",
      entityType: "distributor",
      entityId: distributor._id,
      beforeJson: before,
      afterJson: JSON.stringify(updated),
    });

    return updated;
  },
});
