import { ENV } from "@varlock/cloudflare-integration/init";

import { createWorkerHandler, parseAllowedOrigins } from "./app";

export default {
  fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    return createWorkerHandler(
      env,
      {
        cacheTtlSeconds: ENV.FEED_CACHE_TTL_SECONDS,
        maxResponseBytes: ENV.FEED_MAX_RESPONSE_BYTES,
        allowedOrigins: parseAllowedOrigins(ENV.CORS_ALLOWED_ORIGINS),
      },
      context,
    )(request);
  },
} satisfies ExportedHandler<Env>;
