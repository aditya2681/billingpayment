import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const roleValidator = v.union(v.literal("OWNER"), v.literal("EMPLOYEE"));

export default defineSchema({
  ...authTables,
  profiles: defineTable({
    authUserId: v.id("users"),
    role: roleValidator,
    ownerProfileId: v.optional(v.id("profiles")),
    name: v.string(),
    loginIdentifier: v.string(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_auth_user_id", ["authUserId"])
    .index("by_owner_profile_id_and_role", ["ownerProfileId", "role"])
    .index("by_owner_profile_id_and_login_identifier", [
      "ownerProfileId",
      "loginIdentifier",
    ]),
  employeeOutletAccess: defineTable({
    employeeProfileId: v.id("profiles"),
    ownerProfileId: v.id("profiles"),
    outletId: v.id("outlets"),
    active: v.boolean(),
  })
    .index("by_employee_profile_id_and_active", ["employeeProfileId", "active"])
    .index("by_owner_profile_id_and_outlet_id", ["ownerProfileId", "outletId"]),
  outlets: defineTable({
    ownerProfileId: v.id("profiles"),
    name: v.string(),
    address: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_profile_id_and_active", ["ownerProfileId", "active"]),
  distributors: defineTable({
    ownerProfileId: v.id("profiles"),
    name: v.string(),
    gstNumber: v.string(),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_profile_id_and_active", ["ownerProfileId", "active"]),
  bankAccounts: defineTable({
    ownerProfileId: v.id("profiles"),
    bankName: v.string(),
    accountHolderName: v.string(),
    accountNumberProtected: v.string(),
    accountLast4: v.string(),
    ifscCode: v.string(),
    nickname: v.optional(v.string()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_owner_profile_id_and_active", ["ownerProfileId", "active"]),
  bills: defineTable({
    ownerProfileId: v.id("profiles"),
    outletId: v.id("outlets"),
    distributorId: v.id("distributors"),
    billNumber: v.string(),
    billNumberNormalized: v.string(),
    billDate: v.string(),
    amountPaise: v.number(),
    status: v.union(v.literal("UNPAID"), v.literal("PAID")),
    paymentId: v.optional(v.id("payments")),
    createdByProfileId: v.id("profiles"),
    createdAt: v.number(),
    updatedByProfileId: v.id("profiles"),
    updatedAt: v.number(),
  })
    .index("by_owner_profile_id_and_outlet_id", ["ownerProfileId", "outletId"])
    .index("by_outlet_id_and_status", ["outletId", "status"])
    .index("by_outlet_id_and_distributor_id_and_status", [
      "outletId",
      "distributorId",
      "status",
    ])
    .index("by_outlet_id_and_distributor_id_and_bill_date", [
      "outletId",
      "distributorId",
      "billDate",
    ])
    .index("by_outlet_id_and_bill_date", ["outletId", "billDate"])
    .index("by_outlet_id_and_distributor_id_and_bill_number_normalized", [
      "outletId",
      "distributorId",
      "billNumberNormalized",
    ]),
  payments: defineTable({
    ownerProfileId: v.id("profiles"),
    outletId: v.id("outlets"),
    distributorId: v.id("distributors"),
    bankAccountId: v.id("bankAccounts"),
    paymentDate: v.string(),
    totalAmountPaise: v.number(),
    billCount: v.number(),
    createdByProfileId: v.id("profiles"),
    createdAt: v.number(),
  })
    .index("by_outlet_id_and_payment_date", ["outletId", "paymentDate"])
    .index("by_outlet_id_and_distributor_id", ["outletId", "distributorId"])
    .index("by_owner_profile_id_and_created_at", ["ownerProfileId", "createdAt"]),
  paymentBills: defineTable({
    paymentId: v.id("payments"),
    billId: v.id("bills"),
    amountAtPaymentPaise: v.number(),
  })
    .index("by_payment_id", ["paymentId"])
    .index("by_bill_id", ["billId"]),
  auditLogs: defineTable({
    ownerProfileId: v.id("profiles"),
    outletId: v.optional(v.id("outlets")),
    actorProfileId: v.id("profiles"),
    action: v.string(),
    entityType: v.string(),
    entityId: v.string(),
    beforeJson: v.optional(v.string()),
    afterJson: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_owner_profile_id_and_created_at", ["ownerProfileId", "createdAt"])
    .index("by_entity_type_and_entity_id", ["entityType", "entityId"]),
});
