import { openApiDocument } from "@/lib/openapi";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET() {
  return json(openApiDocument(), { maxAge: 3600 });
}
