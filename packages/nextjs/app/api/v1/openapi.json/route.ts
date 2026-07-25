/**
 * GET /api/v1/openapi.json, machine-readable description of the public API.
 *
 * The server URL is derived from the incoming request so the document works unchanged
 * on localhost, a preview deployment and production.
 */
import { buildOpenApiDocument } from "~~/services/api/openapi";
import { CORS_HEADERS, handleOptions } from "~~/services/api/respond";

export const runtime = "nodejs";

export function GET(request: Request): Response {
  const { origin } = new URL(request.url);

  return new Response(JSON.stringify(buildOpenApiDocument(origin), null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=300",
      ...CORS_HEADERS,
    },
  });
}

export function OPTIONS(): Response {
  return handleOptions();
}
