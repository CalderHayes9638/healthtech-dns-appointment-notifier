import { createServer } from "node:http";
import { ZodError } from "zod";
import { publishAppointmentNotification } from "./appointment_notification.ts";
import { InfraiDnsClient, InfraiError } from "./infrai_dns.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

const dns = new InfraiDnsClient(apiKey);
const port = Number(process.env.PORT ?? "3000");

createServer(async (request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "POST" || request.url !== "/appointment-notifications") {
    response.writeHead(404).end(JSON.stringify({ error: "route_not_found" }));
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const result = await publishAppointmentNotification(dns, body);
    response.writeHead(result.state === "published" ? 201 : 200).end(JSON.stringify(result));
  } catch (error) {
    if (error instanceof ZodError) {
      response.writeHead(400).end(JSON.stringify({ error: "invalid_request", issues: error.issues }));
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      response.writeHead(status).end(JSON.stringify({ error: error.code, message: error.message }));
      return;
    }
    response.writeHead(500).end(JSON.stringify({ error: "service_error" }));
  }
}).listen(port, () => {
  console.log(`Appointment DNS admin service listening on http://localhost:${port}`);
});
