"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
  ADMIN_COOKIE,
  SESSION_MAX_AGE,
  checkPassword,
  createSessionToken,
  isAdmin,
} from "@/lib/auth";
import { audit, deleteSubscriber, setSubscriberActive } from "@/lib/repo";
import { deleteRecord, runIngestion, upsertManualRecord } from "@/lib/ingest";
import { sendTestNotification } from "@/lib/notify";
import { isProviderId } from "@/lib/providers";
import type { Channel, ProviderId, ResetType } from "@/lib/types";

export interface ActionResult {
  ok: boolean;
  message: string;
}

export type AdminAction = (
  previous: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

export const loginAction: AdminAction = async (_previous, formData) => {
  const password = String(formData.get("password") ?? "");
  if (!checkPassword(password)) {
    audit("admin", "login_failed");
    return { ok: false, message: "Incorrect password." };
  }
  const store = await cookies();
  store.set(ADMIN_COOKIE, createSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
  audit("admin", "login");
  revalidatePath("/admin");
  return { ok: true, message: "Signed in." };
};

export const logoutAction: AdminAction = async () => {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
  revalidatePath("/admin");
  return { ok: true, message: "Signed out." };
};

async function guard(): Promise<ActionResult | null> {
  return (await isAdmin()) ? null : { ok: false, message: "Not signed in." };
}

export const saveRecordAction: AdminAction = async (_previous, formData) => {
  const denied = await guard();
  if (denied) return denied;

  const provider = String(formData.get("provider") ?? "");
  const resetType = String(formData.get("resetType") ?? "regular");
  const announcedAt = String(formData.get("announcedAt") ?? "");
  const text = String(formData.get("text") ?? "").trim();

  if (!isProviderId(provider)) return { ok: false, message: "Pick a provider." };
  if (!text) return { ok: false, message: "The announcement text is required." };
  if (!announcedAt || Number.isNaN(+new Date(announcedAt))) {
    return { ok: false, message: "A valid announcement time is required." };
  }

  const { created } = upsertManualRecord({
    id: String(formData.get("id") ?? "").trim() || undefined,
    provider: provider as ProviderId,
    resetType: (resetType === "banked" ? "banked" : "regular") as ResetType,
    announcedAt: new Date(announcedAt).toISOString(),
    text,
    appliesTo: String(formData.get("appliesTo") ?? "").trim() || null,
    appliesToDetail: String(formData.get("appliesToDetail") ?? "").trim() || null,
    reason: String(formData.get("reason") ?? "").trim() || null,
    reasonDetail: String(formData.get("reasonDetail") ?? "").trim() || null,
    sourceUrl: String(formData.get("sourceUrl") ?? "").trim() || null,
    sourceAuthor: String(formData.get("sourceAuthor") ?? "").trim() || null,
    status: formData.get("status") === "pending" ? "pending" : "confirmed",
  });

  audit("admin", created ? "record_created" : "record_updated", text.slice(0, 80));
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, message: created ? "Record created." : "Record updated." };
};

export const deleteRecordAction: AdminAction = async (_previous, formData) => {
  const denied = await guard();
  if (denied) return denied;
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "Missing id." };
  const deleted = deleteRecord(id);
  audit("admin", "record_deleted", id);
  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: deleted, message: deleted ? "Record deleted." : "Record not found." };
};

export const runPollAction: AdminAction = async () => {
  const denied = await guard();
  if (denied) return denied;
  const report = await runIngestion({ notify: true });
  audit("admin", "poll", `${report.inserted} inserted, ${report.updated} updated`);
  revalidatePath("/admin");
  const errors = report.sources.filter((s) => s.error).map((s) => `${s.source}: ${s.error}`);
  return {
    ok: true,
    message: `${report.inserted} new, ${report.updated} updated, ${report.skipped} unchanged, ${report.mergedFollowUps} follow-up(s) merged.${
      errors.length ? ` Errors — ${errors.join("; ")}` : ""
    }`,
  };
};

export const testNotifyAction: AdminAction = async (_previous, formData) => {
  const denied = await guard();
  if (denied) return denied;
  const channel = String(formData.get("channel") ?? "") as Channel;
  const target = String(formData.get("target") ?? "").trim() || null;
  if (!channel) return { ok: false, message: "Pick a channel." };
  const result = await sendTestNotification(channel, target);
  audit("admin", "test_notify", `${channel} → ${result.ok ? "ok" : result.detail}`);
  revalidatePath("/admin");
  return {
    ok: result.ok,
    message: result.ok
      ? `Test message delivered over ${channel}.`
      : `Failed: ${result.detail ?? "unknown error"}`,
  };
};

export const toggleSubscriberAction: AdminAction = async (_previous, formData) => {
  const denied = await guard();
  if (denied) return denied;
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "1";
  setSubscriberActive(id, active);
  audit("admin", active ? "subscriber_resumed" : "subscriber_paused", id);
  revalidatePath("/admin");
  return { ok: true, message: active ? "Subscription resumed." : "Subscription paused." };
};

export const deleteSubscriberAction: AdminAction = async (_previous, formData) => {
  const denied = await guard();
  if (denied) return denied;
  const id = String(formData.get("id") ?? "");
  deleteSubscriber(id);
  audit("admin", "subscriber_deleted", id);
  revalidatePath("/admin");
  return { ok: true, message: "Subscription deleted." };
};
