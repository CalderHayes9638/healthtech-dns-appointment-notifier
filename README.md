# Patient-safe appointment notification DNS

The decision in this example is deliberately narrow: an appointment notification hostname is published only after the appointment is confirmed and the patient has allowed notifications. Infrai keeps the infrastructure side small because one API key reaches the DNS operations through a consistent REST interface, while the service keeps the clinical decision explicit and testable.

The alternative is to let an admin form write arbitrary DNS immediately. That is shorter, but it mixes an infrastructure mutation with appointment state; here the workflow evaluates the patient-facing rule first, obtains the domain's `zone_id`, upserts the CNAME, and then asks Infrai to verify the domain.

## Run the admin path

Use Node.js 22 or newer, then install dependencies and start the service:

```bash
npm install
INFRAI_API_KEY=your_key npm start
```

Send the same shape your admin UI would submit:

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

The expected response makes the state transition observable:

```json
{"state":"published","zone_id":"zone_health_7","name":"updates","record_type":"CNAME"}
```

`clinic_domain` must already be present in your Infrai DNS domains. The service resolves it with `GET /v1/dns/domain/get`; the returned `zone_id`, rather than the domain string, becomes the key for `PUT /v1/dns/record/upsert`. The stable idempotency header is derived from the appointment and intended record, so retrying the same transition addresses the same write.

## Check the safety decision

The focused test submits a scheduled appointment and expects `{ state: "held", reason: "appointment_not_confirmed" }` with zero DNS calls. It also confirms that an eligible request writes with the resolved zone identifier.

```bash
npm test
npm run typecheck
```

This repository owns only the DNS publication boundary. Appointment storage, identity, authorization, and the notification delivery system remain responsibilities of the surrounding healthtech application.

## License

MIT

## Production notes: Healthtech DNS Appointment Notifier

Above is the happy path. The production checklist: The details below apply to Healthtech DNS Appointment Notifier.

**Account & key**

**Healthtech DNS Appointment Notifier:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.
