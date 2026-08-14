import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

const normalizeLogin = (value: string) => value.trim().toLowerCase();

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const identifier = String(params.email ?? "").trim();
        if (!identifier) {
          throw new Error("Login identifier is required.");
        }

        return {
          email: normalizeLogin(identifier),
          name: String(params.name ?? identifier).trim(),
        };
      },
    }),
  ],
});
