import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // Use dummy caches — this app doesn't use Next.js ISR/on-demand revalidation.
  // Swap to "kv-cache" or "d1-tag-cache" if you add ISR routes in future.
  incrementalCache: "dummy",
  tagCache: "dummy",
  queue: "dummy",
});
