import { deleteSubscriber, getSubscriber, setSubscriberActive } from "@/lib/repo";
import { json, problem } from "@/lib/api";

export const dynamic = "force-dynamic";

async function authorize(params: Promise<{ id: string }>, request: Request) {
  const { id } = await params;
  const secret = new URL(request.url).searchParams.get("secret");
  const subscriber = getSubscriber(id);
  if (!subscriber || subscriber.secret !== secret) return null;
  return subscriber;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const subscriber = await authorize(params, request);
  if (!subscriber) {
    return problem(404, "not_found", "No subscription matches those credentials.");
  }
  return json({
    id: subscriber.id,
    channel: subscriber.channel,
    provider: subscriber.provider,
    verified: subscriber.verified,
    active: subscriber.active,
    created_at: subscriber.createdAt,
    last_notified_at: subscriber.lastNotifiedAt,
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const subscriber = await authorize(params, request);
  if (!subscriber) {
    return problem(404, "not_found", "No subscription matches those credentials.");
  }
  deleteSubscriber(subscriber.id);
  return json({ id: subscriber.id, deleted: true });
}

/** Pauses or resumes delivery without losing the subscription. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const subscriber = await authorize(params, request);
  if (!subscriber) {
    return problem(404, "not_found", "No subscription matches those credentials.");
  }
  let active = !subscriber.active;
  try {
    const body = (await request.json()) as { active?: boolean };
    if (typeof body.active === "boolean") active = body.active;
  } catch {
    /* fall through to the toggle default */
  }
  setSubscriberActive(subscriber.id, active);
  return json({ id: subscriber.id, active });
}
