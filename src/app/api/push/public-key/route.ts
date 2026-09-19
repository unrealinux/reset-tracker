import { config } from "@/lib/config";
import { json } from "@/lib/api";

export const dynamic = "force-dynamic";

export function GET() {
  return json(
    {
      publicKey: config.vapid.publicKey || null,
      enabled: Boolean(config.vapid.publicKey && config.vapid.privateKey),
      subject: config.vapid.subject,
    },
    { maxAge: 3600 },
  );
}
