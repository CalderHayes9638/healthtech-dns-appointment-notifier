import { createHash } from "node:crypto";
import { z } from "zod";
import type { InfraiDnsClient } from "./infrai_dns.ts";

export const appointmentNotificationSchema = z.object({
  appointment_id: z.string().min(1),
  clinic_domain: z.string().min(1),
  notification_name: z.string().min(1),
  notification_target: z.string().min(1),
  appointment_status: z.enum(["scheduled", "confirmed", "cancelled"]),
  patient_notification_consent: z.boolean(),
});

export type AppointmentNotificationInput = z.infer<typeof appointmentNotificationSchema>;

export type PublicationResult =
  | { state: "held"; reason: "appointment_not_confirmed" | "patient_consent_required" }
  | { state: "published"; zone_id: string; name: string; record_type: "CNAME" };

export type AppointmentDns = Pick<InfraiDnsClient, "getDomain" | "upsertRecord" | "verifyDomain">;

function stableKey(input: AppointmentNotificationInput): string {
  return createHash("sha256")
    .update(`${input.appointment_id}:${input.clinic_domain}:${input.notification_name}:${input.notification_target}`)
    .digest("hex");
}

export async function publishAppointmentNotification(
  dns: AppointmentDns,
  rawInput: unknown,
): Promise<PublicationResult> {
  const input = appointmentNotificationSchema.parse(rawInput);
  if (input.appointment_status !== "confirmed") {
    return { state: "held", reason: "appointment_not_confirmed" };
  }
  if (!input.patient_notification_consent) {
    return { state: "held", reason: "patient_consent_required" };
  }

  const { zone_id } = await dns.getDomain(input.clinic_domain);
  const key = stableKey(input);
  await dns.upsertRecord(
    {
      zone_id,
      record_type: "CNAME",
      name: input.notification_name,
      content: input.notification_target,
      ttl: 300,
      metadata: { appointment_id: input.appointment_id, purpose: "patient_notification" },
    },
    `appointment-dns-${key}`,
  );
  await dns.verifyDomain(input.clinic_domain, `appointment-verify-${key}`);

  return { state: "published", zone_id, name: input.notification_name, record_type: "CNAME" };
}
