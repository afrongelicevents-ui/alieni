import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Defaults only: no incremental cache in R2/KV (pages are rendered per request), nothing that needs a paid plan.
export default defineCloudflareConfig();
