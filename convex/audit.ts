import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const appendAuditLog = internalMutation({
  args: {
    ownerProfileId: v.id("profiles"),
    outletId: v.optional(v.id("outlets")),
    actorProfileId: v.id("profiles"),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    beforeJson: v.optional(v.string()),
    afterJson: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
