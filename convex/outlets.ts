import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { getAccessibleOutlets, requireOwner, requireProfile } from "./authz";

export const listAccessibleOutlets = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    return await getAccessibleOutlets(ctx, profile);
  },
});

export const createOutlet = mutation({
  args: {
    name: v.string(),
    address: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const now = Date.now();
    const outletId = await ctx.db.insert("outlets", {
      ownerProfileId: owner._id,
      name: args.name.trim(),
      address: args.address?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: owner._id,
      actorProfileId: owner._id,
      action: "outlet_created",
      entityType: "outlet",
      entityId: outletId,
      afterJson: JSON.stringify({ name: args.name.trim() }),
    });

    return outletId;
  },
});

export const updateOutlet = mutation({
  args: {
    outletId: v.id("outlets"),
    name: v.string(),
    address: v.optional(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const outlet = await ctx.db.get(args.outletId);
    if (outlet === null || outlet.ownerProfileId !== owner._id) {
      throw new Error("Outlet not found.");
    }

    const before = JSON.stringify(outlet);
    await ctx.db.patch(outlet._id, {
      name: args.name.trim(),
      address: args.address?.trim() || undefined,
      active: args.active,
      updatedAt: Date.now(),
    });

    const updated = await ctx.db.get(outlet._id);
    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: owner._id,
      actorProfileId: owner._id,
      action: "outlet_updated",
      entityType: "outlet",
      entityId: outlet._id,
      beforeJson: before,
      afterJson: JSON.stringify(updated),
    });

    return updated;
  },
});
