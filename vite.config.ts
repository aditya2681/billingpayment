import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, ".", "").GITHUB_PAGES === "true" ? "/billingpayment/" : "/",
  plugins: [react()],
}));
