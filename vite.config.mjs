import { cloudflare } from "@cloudflare/vite-plugin";
import { sites } from "@openai/sites-vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    sites(),
    cloudflare({
      config: {
        main: "./worker/index.mjs",
        compatibility_date: "2026-08-27",
        compatibility_flags: ["nodejs_compat"],
        assets: { directory: "./public", binding: "ASSETS" }
      }
    })
  ]
});
