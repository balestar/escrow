import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  buildCommand: "npm run next:build",
  incrementalCache: "dummy",
  tagCache: "dummy",
  queue: "dummy",
});
