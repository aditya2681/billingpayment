import { expect, test } from "vitest";
import { signInErrorMessage, userErrorMessage } from "./errors";

test("a redacted Convex sign-in error is displayed as readable credential feedback", () => {
  const message = signInErrorMessage(new Error("[CONVEX A(auth:signIn)] [Request ID: 773154b163259b15] Server Error Called by client"));
  expect(message).toBe("The username or password is incorrect. Please try again.");
  expect(message).not.toMatch(/CONVEX|Request ID|Server Error/);
});

test("unknown usernames and wrong passwords give the same feedback", () => {
  expect(signInErrorMessage(new Error("InvalidAccountId"))).toBe(signInErrorMessage(new Error("InvalidSecret")));
});

test("known connection and rate-limit errors provide appropriate next steps", () => {
  expect(signInErrorMessage(new Error("Failed to fetch"))).toContain("internet connection");
  expect(signInErrorMessage(new Error("TooManyFailedAttempts"))).toContain("Wait a few minutes");
});

test("other forms show business errors without Convex request metadata", () => {
  expect(userErrorMessage(new Error("[CONVEX M(bills:createBill)] Uncaught Error: Amount must be greater than zero.\n at handler"), "Could not save.")).toBe("Amount must be greater than zero.");
  expect(userErrorMessage(new Error("[CONVEX M(outlets:createOutlet)] Server Error Called by client"), "Could not save.")).toBe("Could not save.");
});
