import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

type AnyCtx = QueryCtx | MutationCtx;
type ProfileDoc = Doc<"profiles">;

export async function requireProfile(ctx: AnyCtx): Promise<ProfileDoc> {
  const authUserId = await getAuthUserId(ctx);
  if (authUserId === null) {
    throw new Error("You must be signed in.");
  }

  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_auth_user_id", (q) => q.eq("authUserId", authUserId))
    .unique();

  if (profile === null || !profile.active) {
    throw new Error("Your account is not active.");
  }

  return profile;
}

export async function requireOwner(ctx: AnyCtx) {
  const profile = await requireProfile(ctx);
  if (profile.role !== "OWNER") {
    throw new Error("Only owners can perform this action.");
  }
  return profile;
}

export async function getAccessibleOutlets(
  ctx: AnyCtx,
  profile: ProfileDoc,
): Promise<Doc<"outlets">[]> {
  if (profile.role === "OWNER") {
    return await ctx.db
      .query("outlets")
      .withIndex("by_owner_profile_id_and_active", (q) =>
        q.eq("ownerProfileId", profile._id).eq("active", true),
      )
      .take(50);
  }

  const memberships = await ctx.db
    .query("employeeOutletAccess")
    .withIndex("by_employee_profile_id_and_active", (q) =>
      q.eq("employeeProfileId", profile._id).eq("active", true),
    )
    .take(50);

  const outletDocs = await Promise.all(
    memberships.map((membership) => ctx.db.get(membership.outletId)),
  );

  return outletDocs.filter(
    (outlet): outlet is Doc<"outlets"> => outlet !== null && outlet.active,
  );
}

export async function requireOutletAccess(
  ctx: AnyCtx,
  outletId: Id<"outlets">,
  ownerProfileId?: Id<"profiles">,
) {
  const profile = await requireProfile(ctx);
  const outlet = await ctx.db.get(outletId);

  if (outlet === null || !outlet.active) {
    throw new Error("Outlet not found.");
  }

  const effectiveOwnerId =
    ownerProfileId ?? (profile.role === "OWNER" ? profile._id : profile.ownerProfileId);

  if (effectiveOwnerId === undefined || outlet.ownerProfileId !== effectiveOwnerId) {
    throw new Error("You do not have access to this outlet.");
  }

  if (profile.role === "OWNER") {
    return { profile, ownerProfileId: profile._id, outlet };
  }

  const membership = await ctx.db
    .query("employeeOutletAccess")
    .withIndex("by_employee_profile_id_and_active", (q) =>
      q.eq("employeeProfileId", profile._id).eq("active", true),
    )
    .take(50);

  const canAccess = membership.some((item) => item.outletId === outletId);
  if (!canAccess) {
    throw new Error("You do not have access to this outlet.");
  }

  return { profile, ownerProfileId: effectiveOwnerId, outlet };
}

export function normalizeLoginIdentifier(value: string) {
  return value.trim().toLowerCase();
}

export function normalizeBillNumber(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function maskAccountNumber(value: string) {
  const cleaned = value.replace(/\s+/g, "");
  return cleaned.slice(-4);
}
