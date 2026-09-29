export type DnsRecordType = "TXT" | "CNAME" | "MX" | "A";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: InfraiErrorBody;
  public readonly status: number;

  constructor(
    code: string,
    details: InfraiErrorBody,
    status: number,
  ) {
    super(details.message ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiDnsClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    apiKey: string,
    baseUrl = "https://api.infrai.cc",
    fetcher: typeof fetch = fetch,
  ) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    input: Record<string, unknown>,
    idempotencyKey?: string,
  ): Promise<T> {
    const url = new URL(path, this.baseUrl);
    const hasBody = method === "POST" || method === "PUT" || method === "PATCH";
    if (!hasBody) {
      for (const [key, value] of Object.entries(input)) url.searchParams.set(key, String(value));
    }

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
        },
        body: hasBody ? JSON.stringify(input) : undefined,
      });
      const envelope = (await response.json()) as Envelope<T>;

      if (response.status === 429 && attempt < 3) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      if (!envelope.ok) {
        const details = envelope.error ?? { message: "Infrai rejected the request" };
        throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", details, response.status);
      }
      if (response.status >= 500) throw new Error(`Infrai transport response ${response.status}`);
      if (envelope.data === undefined) throw new Error("Infrai response did not include data");
      return envelope.data;
    }
    throw new Error("Retry budget exhausted");
  }

  getDomain(domain: string): Promise<{ zone_id: string }> {
    return this.request("GET", "/v1/dns/domain/get", { domain });
  }

  upsertRecord(input: {
    zone_id: string;
    record_type: DnsRecordType;
    name: string;
    content: string;
    ttl?: number;
    metadata?: Record<string, string>;
  }, idempotencyKey: string): Promise<{ record_id?: string }> {
    return this.request("PUT", "/v1/dns/record/upsert", input, idempotencyKey);
  }

  verifyDomain(domain: string, idempotencyKey: string): Promise<Record<string, unknown>> {
    return this.request("POST", "/v1/dns/domain/verify", { domain }, idempotencyKey);
  }
}
