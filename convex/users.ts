import { createAccount, getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import {
  getAccessibleOutlets,
  normalizeLoginIdentifier,
  requireOwner,
  requireProfile,
} from "./authz";

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const accessibleOutlets = await getAccessibleOutlets(ctx, profile);
    return {
      profile,
      accessibleOutlets,
    };
  },
});

export const bootstrapOwner = mutation({
  args: {
    name: v.string(),
    loginIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const authUserId = await getAuthUserId(ctx);
    if (authUserId === null) {
      throw new Error("You must be signed in.");
    }

    const existingProfile = await ctx.db
      .query("profiles")
      .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId))
      .unique();
    if (existingProfile) {
      return existingProfile;
    }

    const now = Date.now();
    const profileId = await ctx.db.insert("profiles", {
      authUserId,
      role: "OWNER",
      ownerProfileId: undefined,
      name: args.name.trim(),
      loginIdentifier: normalizeLoginIdentifier(args.loginIdentifier),
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: profileId,
      actorProfileId: profileId,
      action: "owner_bootstrap",
      entityType: "profile",
      entityId: profileId,
      afterJson: JSON.stringify({ name: args.name.trim() }),
    });

    return await ctx.db.get(profileId);
  },
});

export const listEmployees = query({
  args: {},
  handler: async (ctx) => {
    const owner = await requireOwner(ctx);
    const employees = await ctx.db
      .query("profiles")
      .withIndex("by_owner_profile_id_and_role", (q) =>
        q.eq("ownerProfileId", owner._id).eq("role", "EMPLOYEE"),
      )
      .take(100);

    const memberships = await Promise.all(
      employees.map(async (employee) => {
        const outletAccess = await ctx.db
          .query("employeeOutletAccess")
          .withIndex("by_employee_profile_id_and_active", (q) =>
            q.eq("employeeProfileId", employee._id).eq("active", true),
          )
          .take(20);
        const outlets = await Promise.all(
          outletAccess.map((item) => ctx.db.get(item.outletId)),
        );
        return {
          employee,
          outlets: outlets.filter((outlet): outlet is Doc<"outlets"> => outlet !== null),
        };
      }),
    );

    return memberships;
  },
});

export const createEmployee = action({
  args: {
    name: v.string(),
    loginIdentifier: v.string(),
    password: v.string(),
    outletIds: v.array(v.id("outlets")),
  },
  handler: async (ctx, args) => {
    const currentUser = await ctx.runQuery(internal.users.getCurrentUserForAction, {});
    if (currentUser.profile.role !== "OWNER") {
      throw new Error("Only owners can create employees.");
    }
    const owner = currentUser.profile;
    const normalizedLogin = normalizeLoginIdentifier(args.loginIdentifier);

    const outletChecks = currentUser.accessibleOutlets.filter((outlet: Doc<"outlets">) =>
      args.outletIds.includes(outlet._id),
    );

    if (outletChecks.length !== args.outletIds.length) {
      throw new Error("One or more outlet assignments are invalid.");
    }

    const created = await createAccount(ctx, {
      provider: "password",
      account: {
        id: normalizedLogin,
        secret: args.password,
      },
      profile: {
        email: normalizedLogin,
        name: args.name.trim(),
      },
    });

    const profileId: Id<"profiles"> = await ctx.runMutation(
      internal.users.insertEmployeeProfile,
      {
        authUserId: created.user._id,
        ownerProfileId: owner._id,
        name: args.name.trim(),
        loginIdentifier: normalizedLogin,
        outletIds: args.outletIds,
        actorProfileId: owner._id,
      },
    );

    return { profileId };
  },
});

export const updateEmployee = mutation({
  args: {
    employeeProfileId: v.id("profiles"),
    name: v.string(),
    active: v.boolean(),
    outletIds: v.array(v.id("outlets")),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const employee = await ctx.db.get(args.employeeProfileId);
    if (
      employee === null ||
      employee.role !== "EMPLOYEE" ||
      employee.ownerProfileId !== owner._id
    ) {
      throw new Error("Employee not found.");
    }

    const outlets = await Promise.all(args.outletIds.map((outletId) => ctx.db.get(outletId)));
    if (
      outlets.some(
        (outlet) => outlet === null || outlet.ownerProfileId !== owner._id || !outlet.active,
      )
    ) {
      throw new Error("Invalid employee outlet assignment.");
    }

    const before = JSON.stringify(employee);
    await ctx.db.patch(employee._id, {
      name: args.name.trim(),
      active: args.active,
      updatedAt: Date.now(),
    });

    const currentAccess = await ctx.db
      .query("employeeOutletAccess")
      .withIndex("by_employee_profile_id_and_active", (q) =>
        q.eq("employeeProfileId", employee._id).eq("active", true),
      )
      .take(20);

    for (const access of currentAccess) {
      await ctx.db.patch(access._id, { active: false });
    }

    for (const outletId of args.outletIds) {
      await ctx.db.insert("employeeOutletAccess", {
        employeeProfileId: employee._id,
        ownerProfileId: owner._id,
        outletId,
        active: true,
      });
    }

    const after = await ctx.db.get(employee._id);
    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: owner._id,
      actorProfileId: owner._id,
      action: "employee_updated",
      entityType: "profile",
      entityId: employee._id,
      beforeJson: before,
      afterJson: JSON.stringify(after),
    });

    return after;
  },
});

export const disableEmployee = mutation({
  args: {
    employeeProfileId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    const owner = await requireOwner(ctx);
    const employee = await ctx.db.get(args.employeeProfileId);
    if (
      employee === null ||
      employee.role !== "EMPLOYEE" ||
      employee.ownerProfileId !== owner._id
    ) {
      throw new Error("Employee not found.");
    }

    await ctx.db.patch(employee._id, {
      active: false,
      updatedAt: Date.now(),
    });

    const currentAccess = await ctx.db
      .query("employeeOutletAccess")
      .withIndex("by_employee_profile_id_and_active", (q) =>
        q.eq("employeeProfileId", employee._id).eq("active", true),
      )
      .take(20);

    for (const access of currentAccess) {
      await ctx.db.patch(access._id, { active: false });
    }

    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: owner._id,
      actorProfileId: owner._id,
      action: "employee_disabled",
      entityType: "profile",
      entityId: employee._id,
      beforeJson: JSON.stringify(employee),
      afterJson: JSON.stringify({ active: false }),
    });

    return employee._id;
  },
});

export const getCurrentUserForAction = internalQuery({
  args: {},
  handler: async (ctx) => {
    const profile = await requireProfile(ctx);
    const accessibleOutlets = await getAccessibleOutlets(ctx, profile);
    return { profile, accessibleOutlets };
  },
});

export const insertEmployeeProfile = internalMutation({
  args: {
    authUserId: v.id("users"),
    ownerProfileId: v.id("profiles"),
    name: v.string(),
    loginIdentifier: v.string(),
    outletIds: v.array(v.id("outlets")),
    actorProfileId: v.id("profiles"),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const profileId = await ctx.db.insert("profiles", {
      authUserId: args.authUserId,
      role: "EMPLOYEE",
      ownerProfileId: args.ownerProfileId,
      name: args.name,
      loginIdentifier: args.loginIdentifier,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    for (const outletId of args.outletIds) {
      await ctx.db.insert("employeeOutletAccess", {
        employeeProfileId: profileId,
        ownerProfileId: args.ownerProfileId,
        outletId,
        active: true,
      });
    }

    await ctx.runMutation(internal.audit.appendAuditLog, {
      ownerProfileId: args.ownerProfileId,
      actorProfileId: args.actorProfileId,
      action: "employee_created",
      entityType: "profile",
      entityId: profileId,
      afterJson: JSON.stringify({
        name: args.name,
        loginIdentifier: args.loginIdentifier,
      }),
    });

    return profileId;
  },
});
