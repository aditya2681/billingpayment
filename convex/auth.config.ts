declare const process: { env: Record<string, string | undefined> };

import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL ?? "",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
