// PayPal REST client: every call the app makes to PayPal goes through here. It covers
// catalog products, billing plans, invoicing (read, create, send, search), webhook signature
// verification, Transaction Search and balances, with plain fetch and no SDK. Server-side only:
// it reads the client secret from the environment. Sandbox only: the host is fixed on purpose.

const BASE_URL = 'https://api-m.sandbox.paypal.com';
const MAX_ATTEMPTS = 4;

export class PayPalApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    body: string,
  ) {
    super(`PayPal ${status} on ${path}: ${body.slice(0, 300)}`);
    this.name = 'PayPalApiError';
  }
}

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value;

  const { PAYPAL_CLIENT_ID: id, PAYPAL_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error('PAYPAL_CLIENT_ID and PAYPAL_SECRET must be set (see .env.local)');

  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  });
  if (!res.ok) throw new PayPalApiError(res.status, '/v1/oauth2/token', await res.text());

  const { access_token, expires_in } = (await res.json()) as { access_token: string; expires_in: number };
  // Refresh a minute early so an in-flight request never carries an expired token.
  cachedToken = { value: access_token, expiresAt: Date.now() + (expires_in - 60) * 1000 };
  return access_token;
}

type CallOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Raw JSON text to send as-is (webhook verification must pass the event exactly as received). */
  rawBody?: string;
  headers?: Record<string, string>;
};

// GETs and requests carrying a PayPal-Request-Id are safe to repeat; other writes are tried once
// (apart from a token refresh), so a timeout can never create a second invoice.
async function call<T>(path: string, { method = 'GET', body, rawBody, headers = {} }: CallOptions = {}): Promise<T> {
  const retryable = method === 'GET' || 'PayPal-Request-Id' in headers;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        ...(body !== undefined || rawBody !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      cache: 'no-store',
    });
    if (res.ok) {
      // Some endpoints answer 202/204 with no body.
      const text = await res.text();
      return (text ? JSON.parse(text) : {}) as T;
    }

    // A revoked or expired token: drop it and mint a new one once.
    if (res.status === 401 && attempt === 1) {
      cachedToken = undefined;
      continue;
    }
    if (retryable && (res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempt * 250));
      continue;
    }
    throw new PayPalApiError(res.status, path, await res.text());
  }
}

const get = <T>(path: string) => call<T>(path);

// `path` must already carry whatever flag makes the endpoint report `total_pages`.
async function listAll<T>(path: string, key: string, pageSize: number): Promise<T[]> {
  const items: T[] = [];
  const sep = path.includes('?') ? '&' : '?';
  for (let page = 1; ; page++) {
    const res = await get<{ total_pages?: number } & Record<string, unknown>>(
      `${path}${sep}page_size=${pageSize}&page=${page}`,
    );
    items.push(...((res[key] as T[] | undefined) ?? []));
    if (page >= (res.total_pages ?? 1)) return items;
  }
}

export type Money = { value: string; currency_code: string };

// PayPal sends amounts as decimal strings; missing amounts count as 0.
export const amountOf = (m?: Money | null) => (m?.value === undefined ? 0 : Number(m.value));

// --- Catalog products & billing plans ------------------------------------------

export type Product = {
  id: string;
  name: string;
  description?: string;
  type?: 'PHYSICAL' | 'DIGITAL' | 'SERVICE';
  category?: string;
  create_time: string;
};

export type IntervalUnit = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

export type BillingCycle = {
  frequency: { interval_unit: IntervalUnit; interval_count: number };
  tenure_type: 'REGULAR' | 'TRIAL';
  sequence: number;
  total_cycles: number;
  pricing_scheme?: { fixed_price?: Money };
};

export type Plan = {
  id: string;
  product_id: string;
  name: string;
  status: 'CREATED' | 'INACTIVE' | 'ACTIVE';
  create_time: string;
  billing_cycles: BillingCycle[];
  payment_preferences?: { setup_fee?: Money };
};

// The list endpoints return summaries (no product type/category, no billing cycles),
// so each record is fetched in full.
export async function listProducts(): Promise<Product[]> {
  const summaries = await listAll<{ id: string }>('/v1/catalogs/products?total_required=true', 'products', 20);
  return Promise.all(summaries.map((p) => get<Product>(`/v1/catalogs/products/${encodeURIComponent(p.id)}`)));
}

export async function listPlans(): Promise<Plan[]> {
  const summaries = await listAll<{ id: string }>('/v1/billing/plans?total_required=true', 'plans', 20);
  return Promise.all(summaries.map((p) => get<Plan>(`/v1/billing/plans/${encodeURIComponent(p.id)}`)));
}

// --- Invoicing -------------------------------------------------------------------

export type InvoiceStatus =
  | 'DRAFT'
  | 'SENT'
  | 'SCHEDULED'
  | 'UNPAID'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'MARKED_AS_PAID'
  | 'PARTIALLY_PAID'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED'
  | 'MARKED_AS_REFUNDED'
  | 'CANCELLED';

export type Invoice = {
  id: string;
  status: InvoiceStatus;
  detail: {
    invoice_number: string;
    currency_code: string;
    invoice_date?: string;
    payment_term?: { term_type?: string; due_date?: string };
    metadata?: { recipient_view_url?: string; invoicer_view_url?: string };
  };
  primary_recipients?: {
    billing_info?: {
      name?: { full_name?: string };
      business_name?: string;
      email_address?: string;
    };
  }[];
  items?: {
    id?: string;
    name: string;
    quantity: string;
    unit_amount: Money;
    unit_of_measure?: string;
    tax?: { percent?: string; amount?: Money };
    discount?: { percent?: string; amount?: Money };
  }[];
  amount?: Money & { breakdown?: { tax_total?: Money; shipping?: { amount?: Money } } };
  due_amount?: Money;
  payments?: {
    paid_amount?: Money;
    transactions?: { payment_id?: string; payment_date?: string; method?: string; amount: Money }[];
  };
  refunds?: {
    refund_amount?: Money;
    transactions?: { recipient_transaction_id?: string; refund_date?: string; method?: string; amount: Money }[];
  };
};

export const getInvoice = (id: string) => get<Invoice>(`/v2/invoicing/invoices/${encodeURIComponent(id)}`);

export type NewInvoice = {
  invoiceNumber: string;
  /** YYYY-MM-DD */
  dueDate: string;
  note: string;
  recipient: { email: string; businessName?: string; givenName?: string; surname?: string };
  items: { name: string; description?: string; quantity: number; unitAmount: string }[];
};

/**
 * Creates a draft invoice (EUR, no partial payments, no tips). `requestId` is sent as
 * PayPal-Request-Id, so repeating the call with the same id returns the same invoice instead of
 * creating a second one.
 */
export function createDraftInvoice(invoice: NewInvoice, requestId: string): Promise<Invoice> {
  return call<Invoice>('/v2/invoicing/invoices', {
    method: 'POST',
    headers: { 'PayPal-Request-Id': requestId, Prefer: 'return=representation' },
    body: {
      detail: {
        invoice_number: invoice.invoiceNumber,
        currency_code: 'EUR',
        note: invoice.note,
        payment_term: { term_type: 'DUE_ON_DATE_SPECIFIED', due_date: invoice.dueDate },
      },
      invoicer: { business_name: 'Northstar Rentals' },
      primary_recipients: [
        {
          billing_info: {
            email_address: invoice.recipient.email,
            ...(invoice.recipient.businessName ? { business_name: invoice.recipient.businessName } : {}),
            ...(invoice.recipient.givenName
              ? { name: { given_name: invoice.recipient.givenName, surname: invoice.recipient.surname ?? '' } }
              : {}),
          },
        },
      ],
      items: invoice.items.map((item) => ({
        name: item.name.slice(0, 200),
        ...(item.description ? { description: item.description.slice(0, 1000) } : {}),
        quantity: String(item.quantity),
        unit_amount: { currency_code: 'EUR', value: item.unitAmount },
        unit_of_measure: 'QUANTITY',
      })),
      configuration: { allow_tip: false, partial_payment: { allow_partial_payment: false } },
    },
  });
}

/** Sends a draft invoice to the recipient (PayPal emails it; in sandbox no real email leaves PayPal). */
export function sendInvoice(id: string, requestId: string) {
  return call<{ href?: string }>(`/v2/invoicing/invoices/${encodeURIComponent(id)}/send`, {
    method: 'POST',
    headers: { 'PayPal-Request-Id': requestId },
    body: { send_to_invoicer: false, send_to_recipient: true },
  });
}

/** Finds invoices by our invoice number, to recover one whose creation response was lost. */
export async function findInvoicesByNumber(invoiceNumber: string): Promise<{ id: string; status: InvoiceStatus }[]> {
  const res = await call<{ items?: { id: string; status: InvoiceStatus; detail?: { invoice_number?: string } }[] }>(
    '/v2/invoicing/search-invoices?page=1&page_size=20',
    { method: 'POST', body: { invoice_number: invoiceNumber } },
  );
  // The search is a prefix match on some accounts; keep exact matches only.
  return (res.items ?? []).filter((i) => i.detail?.invoice_number === invoiceNumber);
}

/** Lightweight connection check: mints (or reuses) an OAuth token. */
export async function verifyConnection(): Promise<void> {
  cachedToken = undefined;
  await accessToken();
}

// --- Webhooks ----------------------------------------------------------------------

export type WebhookHeaders = {
  transmissionId: string | null;
  transmissionTime: string | null;
  transmissionSig: string | null;
  certUrl: string | null;
  authAlgo: string | null;
};

/**
 * Asks PayPal whether a webhook delivery is genuine (POST /v1/notifications/verify-webhook-signature).
 * The event is passed exactly as received: re-serialising it can change the bytes PayPal signed.
 */
export async function verifyWebhookSignature(headers: WebhookHeaders, rawEvent: string, webhookId: string): Promise<boolean> {
  if (Object.values(headers).some((v) => !v)) return false;
  const envelope = JSON.stringify({
    auth_algo: headers.authAlgo,
    cert_url: headers.certUrl,
    transmission_id: headers.transmissionId,
    transmission_sig: headers.transmissionSig,
    transmission_time: headers.transmissionTime,
    webhook_id: webhookId,
  });
  const res = await call<{ verification_status?: string }>('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    rawBody: `${envelope.slice(0, -1)},"webhook_event":${rawEvent}}`,
  });
  return res.verification_status === 'SUCCESS';
}

// The list omits line items, payments and refunds; the detail endpoint has them.
export async function listInvoices(): Promise<Invoice[]> {
  const summaries = await listAll<{ id: string }>('/v2/invoicing/invoices?total_required=true', 'items', 100);
  return Promise.all(summaries.map((i) => get<Invoice>(`/v2/invoicing/invoices/${encodeURIComponent(i.id)}`)));
}

// --- Transaction Search & balances -------------------------------------------------

export type Transaction = {
  transaction_info: {
    transaction_id: string;
    paypal_reference_id?: string;
    transaction_event_code?: string;
    transaction_initiation_date?: string;
    transaction_amount?: Money;
    fee_amount?: Money;
    transaction_status?: string;
    ending_balance?: Money;
    transaction_subject?: string;
    transaction_note?: string;
    custom_field?: string;
  };
  payer_info?: { email_address?: string };
};

// Transaction Search allows ranges of at most 31 days and rejects fractional seconds.
export const TRANSACTION_SEARCH_MAX_DAYS = 31;

export function searchTransactions(start: Date, end: Date): Promise<Transaction[]> {
  const iso = (d: Date) => `${d.toISOString().slice(0, 19)}Z`;
  return listAll<Transaction>(
    `/v1/reporting/transactions?start_date=${iso(start)}&end_date=${iso(end)}&fields=all`,
    'transaction_details',
    500,
  );
}

export type Balances = {
  as_of_time?: string;
  balances?: { currency: string; total_balance?: Money; available_balance?: Money; withheld_balance?: Money }[];
};

export function getBalances(): Promise<Balances> {
  return get<Balances>('/v1/reporting/balances');
}

/** Cancels a sent invoice without notifying anyone (used to clean up abandoned test invoices). */
export function cancelInvoice(id: string, note: string) {
  return call<Record<string, never>>(`/v2/invoicing/invoices/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    body: { subject: 'Invoice cancelled', note, send_to_invoicer: false, send_to_recipient: false },
  });
}
