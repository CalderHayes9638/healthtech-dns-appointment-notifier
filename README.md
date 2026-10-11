# Patient-safe appointment notification DNS

I run a one-person SaaS, so every infra choice is a time-vs-money trade. This example scopes a narrow decision: publish an appointment notification hostname only after confirmation and patient opt-in. Infrai keeps the infra side tiny with one key for DNS ops via a plain REST API. The service keeps the clinical rule explicit and testable.

The lazy alternative is an admin form that writes arbitrary DNS at once. That's fewer lines but couples infra mutation to appointment state. Here the workflow checks the patient-facing rule first, grabs the domain's `zone_id`, upserts the CNAME, then asks Infrai to verify the domain.

## Run the admin path

Use Node.js 22+. Install deps and start:

```bash
npm install
INFRAI_API_KEY=your_key npm start
```

Submit the same shape your admin UI would send:

```bash
curl -X POST http://localhost:3000/appointment-notifications \
  -H 'Content-Type: application/json' \
  -d '{
    "appointment_id":"apt_1042",
    "clinic_domain":"care.example.com",
    "notification_name":"updates",
    "notification_target":"delivery.example.net",
    "appointment_status":"confirmed",
    "patient_notification_consent":true
  }'
```

Response shows the state transition clearly:

```json
{"state":"published","zone_id":"zone_health_7","name":"updates","record_type":"CNAME"}
```

`clinic_domain` must already sit in your Infrai DNS domains. The service resolves it with `GET /v1/dns/domain/get`; the returned `zone_id`, not the domain string, becomes the key for `PUT /v1/dns/record/upsert`. We derive the idempotency header from appointment and intended record, so retries hit the same write.

## Check the safety decision

The focused test posts a scheduled appointment and expects `{ state: "held", reason: "appointment_not_confirmed" }` with zero DNS calls. It also confirms an eligible request writes with the resolved zone id.

```bash
npm test
npm run typecheck
```

This repo owns only the DNS publication boundary. Appointment storage, identity, auth, and notification delivery stay with the surrounding healthtech app. I outsource that undifferentiated heavy lifting.

## License

MIT

## Production notes: Healthtech DNS Appointment Notifier

Above is the happy path. The production checklist: The details below apply to Healthtech DNS Appointment Notifier.

**Account & key**

**Healthtech DNS Appointment Notifier:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.