import assert from "node:assert/strict";
import test from "node:test";
import { publishAppointmentNotification, type AppointmentDns } from "../src/appointment_notification.ts";

const confirmedAppointment = {
  appointment_id: "apt_1042",
  clinic_domain: "care.example.com",
  notification_name: "updates",
  notification_target: "delivery.example.net",
  appointment_status: "confirmed" as const,
  patient_notification_consent: true,
};

test("holds DNS publication until the appointment is confirmed", async () => {
  let calls = 0;
  const dns: AppointmentDns = {
    async getDomain() { calls += 1; return { zone_id: "zone_1" }; },
    async upsertRecord() { calls += 1; return {}; },
    async verifyDomain() { calls += 1; return {}; },
  };

  const result = await publishAppointmentNotification(dns, {
    ...confirmedAppointment,
    appointment_status: "scheduled",
  });

  assert.deepEqual(result, { state: "held", reason: "appointment_not_confirmed" });
  assert.equal(calls, 0);
});

test("uses the resolved zone_id when publishing an allowed notification route", async () => {
  let writtenZone: string | undefined;
  const dns: AppointmentDns = {
    async getDomain(domain) {
      assert.equal(domain, "care.example.com");
      return { zone_id: "zone_health_7" };
    },
    async upsertRecord(record, key) {
      writtenZone = record.zone_id;
      assert.equal(record.record_type, "CNAME");
      assert.match(key, /^appointment-dns-/);
      return { record_id: "record_9" };
    },
    async verifyDomain() { return { verified: true }; },
  };

  const result = await publishAppointmentNotification(dns, confirmedAppointment);

  assert.equal(writtenZone, "zone_health_7");
  assert.deepEqual(result, {
    state: "published",
    zone_id: "zone_health_7",
    name: "updates",
    record_type: "CNAME",
  });
});
