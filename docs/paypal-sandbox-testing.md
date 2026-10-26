# Testing payments in the PayPal sandbox

Quotely only talks to the PayPal **sandbox** (`https://api-m.sandbox.paypal.com`, fixed in `lib/paypal.ts`). No real money moves and PayPal sends no real email: sandbox invoice emails only appear in the developer dashboard.

There are two ways a payment reaches Quotely, and both end in the same function (`markInvoicePaid` in `lib/billing.ts`), which re-reads the invoice from PayPal and only records it when PayPal says `PAID` for the full amount:

- **Polling**: the quote detail page and the dashboard reconcile open invoices with PayPal every 30 seconds while open. This works with no setup.
- **Webhook**: PayPal calls `POST /api/paypal/webhook` within seconds of the payment. This needs a public URL (ngrok) and a webhook registered in the PayPal dashboard.

You can test the whole flow with polling alone, then add the webhook.

## 1. Create a live quote and send the deposit invoice

Seeded quotes Q-1036 to Q-1040 are demo data and never talk to PayPal. Use a request instead:

1. `npm run dev`, open http://localhost:3000/inbox.
2. Select **Studio Marconi S.r.l.** (REQ-2051) and click **Draft quote with AI**.
3. In the builder, check the total (€2,800.00) and click **Approve & send deposit invoice**, then **Create & send PayPal invoice**.
4. You land on the quote detail page: state **Deposit due**, and the right rail lists the deposit invoice (€840.00) with two links: **Open in PayPal** (your merchant view) and **Customer's payment page**.

The customer email is a made-up `@….example` address. That is fine: the sandbox accepts it and nobody receives anything. You can change it in the builder before approving.

## 2. Pay the invoice as the customer

1. Find your sandbox buyer: https://developer.paypal.com/dashboard/accounts → the account of type **Personal** → **⋯ → View/Edit account** shows its email and password. (Create one with **Create account → Personal** if the list has none.)
2. On the quote detail page, open **Customer's payment page** in a **private/incognito window** (so you are not logged in as the merchant).
3. Choose to pay with PayPal, log in with the **Personal** sandbox account, and pay the full €840.00.
4. Back on the quote detail page, within 30 seconds (or click **Refresh** next to "Synced with PayPal"):
   - the "Payment received +€840.00" toast appears,
   - the stage moves to **Deposit paid**,
   - the timeline shows "Deposit received · €840.00 · Verified by PayPal".
5. Click **Mark job complete & send balance invoice**, confirm, and pay the €1,960.00 balance the same way. The quote ends **Paid**.

Notes:

- Only a status of exactly `PAID` counts. If you use **Mark as paid** in the PayPal dashboard instead of paying, PayPal reports `MARKED_AS_PAID` and Quotely deliberately does not treat that as a verified payment.
- Partial payments are disabled on Quotely invoices, so the buyer cannot pay less than the amount due.

## 3. Register the webhook (with ngrok)

### Expose localhost

```bash
ngrok http 3000
```

ngrok prints a forwarding address such as `https://a1b2-203-0-113-7.ngrok-free.app`. Keep it running.

### The URL to register

```
https://<your-ngrok-host>/api/paypal/webhook
```

For example `https://a1b2-203-0-113-7.ngrok-free.app/api/paypal/webhook`. It must be `https`, and it must end in `/api/paypal/webhook`.

On ngrok's free plan the host changes every time you restart ngrok. When it does, edit the webhook URL in the PayPal dashboard (the webhook ID stays the same), or use a static ngrok domain.

### Add it in the PayPal dashboard

1. https://developer.paypal.com/dashboard/applications/sandbox → open the **same REST app** whose client ID and secret are in `.env.local`.
2. Scroll to **Sandbox Webhooks** → **Add Webhook**.
3. **Webhook URL**: the URL above.
4. **Event types**: tick exactly these two:

   | Dashboard label | Event name |
   |---|---|
   | Invoicing invoice paid | `INVOICING.INVOICE.PAID` |
   | Invoicing invoice cancelled | `INVOICING.INVOICE.CANCELLED` |

   (Other events are acknowledged and ignored, so subscribing to more does no harm, but these two are all Quotely uses.)
5. **Save**. The webhook now appears in the list with a **Webhook ID** (a string like `8PT597110X687430LKGECATA`).

### Give Quotely the webhook ID

1. Add it to `.env.local`:

   ```
   PAYPAL_WEBHOOK_ID=8PT597110X687430LKGECATA
   ```

2. Restart `npm run dev` (Next.js reads `.env.local` at startup).

From then on every event's signature is verified with PayPal (`POST /v1/notifications/verify-webhook-signature`); events that fail verification get a 401 and change nothing.

Without `PAYPAL_WEBHOOK_ID`, the route accepts events **unverified** in development and logs `PAYPAL_WEBHOOK_ID is not set: accepting webhook events WITHOUT signature verification`. In production it rejects them. Either way, an event never marks anything paid by itself: Quotely fetches the invoice from PayPal and checks the status and amount first.

### Check it works

1. Pay a deposit invoice as in step 2.
2. In the terminal running `npm run dev` you should see, usually within a few seconds:

   ```
   [quotely] Q-1042 deposit paid (€840.00), confirmed via webhook
   ```

   (If polling got there first it says `via poll`, and the webhook that follows is a no-op. That is expected.)
3. In the PayPal dashboard, **Sandbox Webhooks** → your webhook → **Webhook events** lists each delivery and the HTTP status Quotely returned (200 = handled).

Sandbox webhook delivery is sometimes delayed by several minutes. Polling covers that gap.

**About the Webhooks simulator:** events sent from https://developer.paypal.com/dashboard/webhooksSimulator use made-up invoice IDs and cannot pass signature verification. With `PAYPAL_WEBHOOK_ID` set they are rejected (401); without it they are accepted and answered "not a Quotely invoice". Use a real payment to test end to end.

## 4. Scheduler endpoints (optional)

The pages poll through a server action, so nothing else is needed for the demo. For an external scheduler (cron, Render cron job) the same reconciliation is available as:

```bash
curl -X POST http://localhost:3000/api/paypal/reconcile -H "x-quotely-cron: $QUOTELY_CRON_SECRET"
```

It answers `{ "checked": n, "paid": [...], "cancelled": n, "errors": [...] }`. Without the right header it answers 401 (when `QUOTELY_CRON_SECRET` is unset, it is open in development only).

## 5. Start over

```bash
npm run db:reset   # drop and recreate the tables in DATABASE_URL, then reseed
```

Invoices already sent stay in your PayPal sandbox; they don't affect Quotely after a reset. Each Quotely invoice number has a random suffix (e.g. `Q-1042-D-QXT9`), so a fresh Q-1042 never collides with an old invoice. Cancel leftovers in the PayPal dashboard if you want a tidy list.
