import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Read-only cache over prerendered pages in Workers assets; no R2/KV needed.
export default defineCloudflareConfig({ incrementalCache: staticAssetsIncrementalCache });
