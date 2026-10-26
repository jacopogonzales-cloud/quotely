// Demo data for Northstar Rentals (Milan). Run with `npm run db:seed` (or `npm run db:reset`).
//
// Dates are relative to the moment the seed runs, so the demo always has a deposit due soon, an
// overdue balance and recent payments. The one exception is the Studio Marconi request, whose
// 12–14 November dates are part of the demo script.
//
// Seeded quotes never talk to PayPal: their invoices have paypalInvoiceId = null and seeded = true,
// so reconciliation skips them. Only quotes created live in the app create PayPal invoices.

import { PrismaClient, type Actor, type LineMatch, type QuoteState, type ReminderOutcome, type ReminderRuleKey } from '@prisma/client';

const db = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL || 'file:./dev.db' });

const DAY = 86_400_000;
const NOW = Date.now();
/** A moment `offset` days from now at the given UTC hour (Milan is UTC+1/+2). */
const at = (offset: number, hour = 8, minute = 0) => {
  const d = new Date(NOW + offset * DAY);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
};
const isoDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const dayLabel = (d: Date) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', day: 'numeric', month: 'long' }).format(d);
const eur = (cents: number) => `€${(cents / 100).toLocaleString('en-IE', { minimumFractionDigits: 2 })}`;

// --- Price list --------------------------------------------------------------------

const PRICE_LIST = [
  { sku: 'NS-DSP65', name: '65-inch 4K display', unit: 'per event (up to 3 days)', priceCents: 52_000, aliases: '65 inch screen, 65" display, 65 inch TV, large monitor, 65-inch screen' },
  { sku: 'NS-DSP85', name: '85-inch 4K display', unit: 'per event (up to 3 days)', priceCents: 89_000, aliases: '85 inch screen, 85" display, 85 inch TV, video wall screen' },
  { sku: 'NS-MIC2', name: 'Wireless microphone kit (2 handheld + receiver)', unit: 'per event', priceCents: 16_000, aliases: 'wireless mics, radio mic, mic kit, wireless microphone' },
  { sku: 'NS-PA2K', name: 'PA speaker system 2 × 1000 W', unit: 'per event', priceCents: 38_000, aliases: 'sound system, speakers, PA, audio system' },
  { sku: 'NS-RSR', name: 'Stage riser panel 2 × 1 m', unit: 'per panel', priceCents: 4_500, aliases: 'stage, riser, platform, stage deck' },
  { sku: 'NS-UPL', name: 'LED uplight RGBW', unit: 'per unit', priceCents: 2_800, aliases: 'uplighting, LED lights, wash lights, ambient lights' },
  { sku: 'NS-TBL', name: 'Banquet table 180 cm', unit: 'per unit', priceCents: 1_400, aliases: 'tables, long tables, trestle table, dining table' },
  { sku: 'NS-CHR', name: 'Padded folding chair', unit: 'per unit', priceCents: 350, aliases: 'chairs, seats, folding chairs, guest chairs' },
  { sku: 'NS-CHF', name: 'Chafing dish set', unit: 'per set', priceCents: 2_200, aliases: 'chafing dishes, food warmers, buffet warmers' },
  { sku: 'NS-TEC', name: 'On-site AV technician', unit: 'per hour', priceCents: 5_500, aliases: 'technician, tech support, AV operator, engineer' },
  { sku: 'NS-DLV', name: 'Delivery & setup, Milan area', unit: 'flat', priceCents: 40_000, aliases: 'delivery, setup, installation, transport, delivery and setup' },
] as const;

type Sku = (typeof PRICE_LIST)[number]['sku'];

// --- Customers ---------------------------------------------------------------------

const CUSTOMERS = {
  marconi: { company: 'Studio Marconi S.r.l.', contactName: 'Giulia Ferri', email: 'giulia.ferri@studiomarconi.example', city: 'Milan', sector: 'Architecture & design' },
  lumen: { company: 'Lumen Events Agency', contactName: 'Paolo Greco', email: 'paolo@lumen-events.example', city: 'Milan', sector: 'Events agency' },
  cascina: { company: 'Cascina Verde Catering', contactName: 'Luca Moretti', email: 'eventi@cascinaverde.example', city: 'Bergamo', sector: 'Catering' },
  voltaria: { company: 'Voltaria AV Installations', contactName: 'Marco Riva', email: 'marco.riva@voltaria-av.example', city: 'Monza', sector: 'AV installer' },
  brera: { company: 'Brera Live Events S.r.l.', contactName: 'Elena Conti', email: 'elena.conti@breralive.example', city: 'Milan', sector: 'Events agency' },
  sapori: { company: 'Sapori di Brera Catering', contactName: 'Chiara Bianchi', email: 'ordini@saporidibrera.example', city: 'Milan', sector: 'Catering' },
  fonderia: { company: 'Fonderia Eventi', contactName: 'Davide Sala', email: 'davide@fonderiaeventi.example', city: 'Sesto San Giovanni', sector: 'Events agency' },
} as const;

type CustomerKey = keyof typeof CUSTOMERS;

// --- Requests still in the inbox ---------------------------------------------------

const NEW_REQUESTS: { number: string; customer: CustomerKey; subject: string; receivedAt: Date; body: string }[] = [
  {
    number: 'REQ-2051',
    customer: 'marconi',
    subject: 'Displays and mics for our client presentation, 12–14 November',
    receivedAt: at(0, 7, 42),
    body: `Hi Northstar team,

we are hosting a three-day client presentation at our studio in Via Tortona 31, Milan, from 12 to 14 November.

Could you quote for:
- 4 x 65-inch displays
- 2 x wireless mic kits
- delivery and setup on the morning of the 12th, pickup after we close on the 14th

We would need everything working by 9:00 on the first day. Please send the quote to me directly; we usually pay a deposit by PayPal.

Thanks,
Giulia Ferri
Office manager, Studio Marconi S.r.l.`,
  },
  {
    number: 'REQ-2050',
    customer: 'lumen',
    subject: 'Conference staging, Dec 2–4',
    receivedAt: at(-1, 15, 10),
    body: `Hello,

we are producing a tech conference at Superstudio Più (Milan) on ${dayLabel(at(37))}–${dayLabel(at(39))}. We'd need:

- a small stage: 12 riser panels
- 20 LED uplights around the hall
- one PA system
- a technician for about 10 hours over the three days
- one fog machine for the opening
- delivery and setup

Can you send a quote by Friday? Deposit by PayPal is fine.

Paolo Greco
Lumen Events Agency`,
  },
  {
    number: 'REQ-2049',
    customer: 'cascina',
    subject: 'Wedding reception, 120 guests',
    receivedAt: at(-2, 9, 25),
    body: `Buongiorno,

we are catering a wedding reception for 120 guests near Bergamo on ${dayLabel(at(27))}. We need to rent:

15 banquet tables (180 cm), 120 padded chairs and 10 chafing dish sets.

Delivery the day before if possible. Let me know the total and the deposit.

Grazie,
Luca Moretti
Cascina Verde Catering`,
  },
];

// --- Quotes in every stage -----------------------------------------------------------

type SeedLine = { sku?: Sku; description?: string; quantity: number; unitPriceCents?: number | null; match?: LineMatch; sourceText: string };
type SeedEvent = { at: Date; actor: Actor; type: string; message: string; meta?: Record<string, unknown> };
type SeedReminder = { rule: ReminderRuleKey; kind: 'deposit' | 'balance'; outcome: ReminderOutcome; at: Date; reason?: string; scheduledFor?: Date };

type SeedQuote = {
  number: string;
  request: { number: string; subject: string; receivedAt: Date; body: string };
  customer: CustomerKey;
  title: string;
  location: string;
  jobStart: Date;
  jobEnd: Date;
  state: QuoteState;
  lines: SeedLine[];
  approvedAt?: Date;
  deposit?: { sentAt: Date; dueDate: Date; paidAt?: Date };
  completedAt?: Date;
  balance?: { sentAt: Date; dueDate: Date; paidAt?: Date };
  reminders?: SeedReminder[];
};

const QUOTES: SeedQuote[] = [
  {
    number: 'Q-1036',
    customer: 'voltaria',
    title: 'Showroom launch, Monza',
    location: 'Viale Lombardia 112, Monza',
    request: {
      number: 'REQ-2041',
      subject: 'Showroom opening, screens + lighting',
      receivedAt: at(-27, 10, 5),
      body: 'Hi, for our showroom opening we need 2 x 85" displays, 8 LED uplights, a technician for 6 hours and delivery/setup. Thanks, Marco',
    },
    jobStart: at(-15),
    jobEnd: at(-14),
    state: 'paid',
    lines: [
      { sku: 'NS-DSP85', quantity: 2, sourceText: '2 x 85" displays' },
      { sku: 'NS-UPL', quantity: 8, sourceText: '8 LED uplights' },
      { sku: 'NS-TEC', quantity: 6, sourceText: 'a technician for 6 hours' },
      { sku: 'NS-DLV', quantity: 1, sourceText: 'delivery/setup' },
    ],
    approvedAt: at(-25, 9, 30),
    deposit: { sentAt: at(-25, 9, 31), dueDate: at(-18), paidAt: at(-22, 14, 12) },
    completedAt: at(-14, 18, 0),
    balance: { sentAt: at(-14, 18, 1), dueDate: at(-7), paidAt: at(-9, 11, 47) },
  },
  {
    number: 'Q-1037',
    customer: 'brera',
    title: 'Product launch, Brera',
    location: 'Via Fiori Chiari 7, Milan',
    request: {
      number: 'REQ-2042',
      subject: 'Launch event: sound, stage, lights',
      receivedAt: at(-33, 16, 40),
      body: 'Ciao! Product launch in Brera: one PA, 2 wireless mic kits, a 10-panel stage, 16 uplights, technician for 8 hours, delivery and setup. Elena',
    },
    jobStart: at(-12),
    jobEnd: at(-11),
    state: 'balance_due',
    lines: [
      { sku: 'NS-PA2K', quantity: 1, sourceText: 'one PA' },
      { sku: 'NS-MIC2', quantity: 2, sourceText: '2 wireless mic kits' },
      { sku: 'NS-RSR', quantity: 10, sourceText: 'a 10-panel stage' },
      { sku: 'NS-UPL', quantity: 16, sourceText: '16 uplights' },
      { sku: 'NS-TEC', quantity: 8, sourceText: 'technician for 8 hours' },
      { sku: 'NS-DLV', quantity: 1, sourceText: 'delivery and setup' },
    ],
    approvedAt: at(-31, 10, 0),
    deposit: { sentAt: at(-31, 10, 1), dueDate: at(-24), paidAt: at(-28, 9, 15) },
    completedAt: at(-11, 19, 0),
    balance: { sentAt: at(-11, 19, 2), dueDate: at(-6) },
    reminders: [
      { rule: 'balance_overdue', kind: 'balance', outcome: 'sent', at: at(-5, 8, 0) },
      { rule: 'balance_overdue', kind: 'balance', outcome: 'failed', at: at(-2, 8, 0), reason: 'AI draft timed out; will retry on the next run' },
      { rule: 'balance_overdue', kind: 'balance', outcome: 'sent', at: at(-1, 8, 0) },
    ],
  },
  {
    number: 'Q-1038',
    customer: 'sapori',
    title: 'Corporate lunch, Porta Nuova',
    location: 'Piazza Gae Aulenti 4, Milan',
    request: {
      number: 'REQ-2043',
      subject: 'Tables, chairs and chafing dishes',
      receivedAt: at(-16, 11, 20),
      body: 'Hello, for a corporate lunch we need 20 tables, 120 chairs, 12 chafing dish sets, delivered and set up. Chiara',
    },
    jobStart: at(-3),
    jobEnd: at(-3),
    state: 'balance_due',
    lines: [
      { sku: 'NS-TBL', quantity: 20, sourceText: '20 tables' },
      { sku: 'NS-CHR', quantity: 120, sourceText: '120 chairs' },
      { sku: 'NS-CHF', quantity: 12, sourceText: '12 chafing dish sets' },
      { sku: 'NS-DLV', quantity: 1, sourceText: 'delivered and set up' },
    ],
    approvedAt: at(-15, 9, 0),
    deposit: { sentAt: at(-15, 9, 2), dueDate: at(-8), paidAt: at(-12, 17, 40) },
    completedAt: at(-2, 17, 30),
    balance: { sentAt: at(-2, 17, 31), dueDate: at(5) },
  },
  {
    number: 'Q-1039',
    customer: 'lumen',
    title: 'Awards gala, Palazzo delle Stelline',
    location: 'Corso Magenta 61, Milan',
    request: {
      number: 'REQ-2044',
      subject: 'Gala: screens, sound, lights',
      receivedAt: at(-12, 14, 0),
      body: 'Hi again! For the awards gala we need 2 x 65" screens, one PA system, 12 uplights and delivery + setup. Paolo',
    },
    jobStart: at(4),
    jobEnd: at(5),
    state: 'deposit_paid',
    lines: [
      { sku: 'NS-DSP65', quantity: 2, sourceText: '2 x 65" screens' },
      { sku: 'NS-PA2K', quantity: 1, sourceText: 'one PA system' },
      { sku: 'NS-UPL', quantity: 12, sourceText: '12 uplights' },
      { sku: 'NS-DLV', quantity: 1, sourceText: 'delivery + setup' },
    ],
    approvedAt: at(-11, 9, 45),
    deposit: { sentAt: at(-11, 9, 46), dueDate: at(-4), paidAt: at(-3, 10, 22) },
    reminders: [
      { rule: 'deposit_unpaid', kind: 'deposit', outcome: 'sent', at: at(-6, 8, 0) },
      { rule: 'deposit_unpaid', kind: 'deposit', outcome: 'skipped', at: at(-2, 8, 0), reason: 'already paid' },
    ],
  },
  {
    number: 'Q-1040',
    customer: 'fonderia',
    title: 'Press day, Sesto San Giovanni',
    location: 'Via Granelli 1, Sesto San Giovanni',
    request: {
      number: 'REQ-2045',
      subject: 'Big screen + mic for press day',
      receivedAt: at(-5, 12, 5),
      body: 'Ciao, we need one 85-inch screen, a wireless mic kit, a technician for 4 hours and delivery/setup for our press day. Davide',
    },
    jobStart: at(9),
    jobEnd: at(9),
    state: 'deposit_due',
    lines: [
      { sku: 'NS-DSP85', quantity: 1, sourceText: 'one 85-inch screen' },
      { sku: 'NS-MIC2', quantity: 1, sourceText: 'a wireless mic kit' },
      { sku: 'NS-TEC', quantity: 4, sourceText: 'a technician for 4 hours' },
      { sku: 'NS-DLV', quantity: 1, sourceText: 'delivery/setup' },
    ],
    approvedAt: at(-4, 10, 30),
    deposit: { sentAt: at(-4, 10, 31), dueDate: at(3) },
    reminders: [
      { rule: 'deposit_unpaid', kind: 'deposit', outcome: 'scheduled', at: at(0, 6, 0), scheduledFor: at(1, 8, 0) },
    ],
  },
  {
    number: 'Q-1041',
    customer: 'voltaria',
    title: 'Boardroom refit, temporary screens',
    location: 'Viale Lombardia 112, Monza',
    request: {
      number: 'REQ-2046',
      subject: 'Temporary screens during boardroom refit',
      receivedAt: at(-1, 9, 10),
      body: 'Hi, while we refit a client boardroom we need 2 x 65" displays, a ceiling projector mount, and delivery. Marco',
    },
    jobStart: at(14),
    jobEnd: at(16),
    state: 'draft',
    lines: [
      { sku: 'NS-DSP65', quantity: 2, sourceText: '2 x 65" displays' },
      { description: 'Ceiling projector mount', quantity: 1, unitPriceCents: null, match: 'needs_price', sourceText: 'a ceiling projector mount' },
      { sku: 'NS-DLV', quantity: 1, sourceText: 'delivery' },
    ],
  },
];

// --- Seeding -----------------------------------------------------------------------

async function main() {
  // Children first; the seed is re-runnable.
  await db.reminder.deleteMany();
  await db.activity.deleteMany();
  await db.invoice.deleteMany();
  await db.quoteLine.deleteMany();
  await db.quote.deleteMany();
  await db.incomingRequest.deleteMany();
  await db.customer.deleteMany();
  await db.priceListItem.deleteMany();
  await db.reminderRule.deleteMany();
  await db.webhookEvent.deleteMany();
  await db.appSetting.deleteMany();

  const items = new Map<Sku, { id: string; name: string; priceCents: number }>();
  for (const item of PRICE_LIST) {
    const row = await db.priceListItem.create({ data: { ...item, updatedAt: at(-40) } });
    items.set(item.sku, row);
  }

  const customers = new Map<CustomerKey, string>();
  for (const [key, c] of Object.entries(CUSTOMERS) as [CustomerKey, (typeof CUSTOMERS)[CustomerKey]][]) {
    const row = await db.customer.create({ data: c });
    customers.set(key, row.id);
  }

  for (const r of NEW_REQUESTS) {
    const c = CUSTOMERS[r.customer];
    await db.incomingRequest.create({
      data: {
        number: r.number,
        customerId: customers.get(r.customer),
        fromName: c.contactName,
        fromEmail: c.email,
        fromCompany: c.company,
        subject: r.subject,
        body: r.body,
        receivedAt: r.receivedAt,
        status: 'new',
      },
    });
  }

  for (const q of QUOTES) {
    const c = CUSTOMERS[q.customer];
    const customerId = customers.get(q.customer)!;
    const request = await db.incomingRequest.create({
      data: {
        number: q.request.number,
        customerId,
        fromName: c.contactName,
        fromEmail: c.email,
        fromCompany: c.company,
        subject: q.request.subject,
        body: q.request.body,
        receivedAt: q.request.receivedAt,
        status: 'drafted',
      },
    });

    const lines = q.lines.map((l, i) => {
      const item = l.sku ? items.get(l.sku)! : undefined;
      return {
        position: i + 1,
        description: item?.name ?? l.description!,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents === undefined ? (item?.priceCents ?? null) : l.unitPriceCents,
        priceListItemId: item?.id ?? null,
        match: l.match ?? ('matched' as const),
        sourceText: l.sourceText,
      };
    });
    const totalCents = lines.reduce((sum, l) => sum + l.quantity * (l.unitPriceCents ?? 0), 0);
    const depositCents = Math.round(totalCents * 0.3);
    const balanceCents = totalCents - depositCents;
    const paidAt = q.balance?.paidAt;

    const quote = await db.quote.create({
      data: {
        number: q.number,
        requestId: request.id,
        customerId,
        title: q.title,
        location: q.location,
        jobStartDate: q.jobStart,
        jobEndDate: q.jobEnd,
        state: q.state,
        depositPercent: 30,
        totalCents,
        depositCents,
        balanceCents,
        // Only quotes with (fake) invoices are demo-only; the draft can be approved live.
        seeded: Boolean(q.deposit),
        approvedAt: q.approvedAt,
        // The deposit invoice's due date (the draft's default payment terms: in 7 days).
        depositDueDate: q.deposit?.dueDate ?? at(7, 12),
        completedAt: q.completedAt,
        paidAt,
        createdAt: new Date(q.request.receivedAt.getTime() + 3_600_000),
        lines: { create: lines },
      },
    });

    // Activity, in the order it happened.
    const events: SeedEvent[] = [
      { at: quote.createdAt, actor: 'operator', type: 'quote.drafted', message: `Quote drafted from ${q.request.number}` },
    ];
    const invoiceIds: Partial<Record<'deposit' | 'balance', string>> = {};

    if (q.approvedAt) {
      events.push({ at: q.approvedAt, actor: 'operator', type: 'quote.approved', message: `Quote approved · ${eur(totalCents)}` });
    }
    for (const kind of ['deposit', 'balance'] as const) {
      const inv = q[kind];
      if (!inv) continue;
      const amountCents = kind === 'deposit' ? depositCents : balanceCents;
      const number = `${q.number}-${kind === 'deposit' ? 'D' : 'B'}`;
      const row = await db.invoice.create({
        data: {
          quoteId: quote.id,
          kind,
          status: inv.paidAt ? 'paid' : 'sent',
          number,
          amountCents,
          paidCents: inv.paidAt ? amountCents : 0,
          dueDate: inv.dueDate,
          paypalInvoiceId: null,
          seeded: true,
          sentAt: inv.sentAt,
          paidAt: inv.paidAt,
          createdAt: inv.sentAt,
        },
      });
      invoiceIds[kind] = row.id;
      const label = kind === 'deposit' ? 'Deposit' : 'Balance';
      events.push({
        at: inv.sentAt,
        actor: 'operator',
        type: 'invoice.sent',
        message: `${label} invoice ${number} sent · ${eur(amountCents)}`,
        meta: { invoice: number, amountCents, seeded: true },
      });
      if (kind === 'balance' && q.completedAt) {
        events.push({ at: q.completedAt, actor: 'operator', type: 'job.completed', message: 'Job marked complete' });
      }
      if (inv.paidAt) {
        events.push({
          at: inv.paidAt,
          actor: 'paypal',
          type: 'invoice.paid',
          message: `${label} received · ${eur(amountCents)} · Verified by PayPal`,
          meta: { invoice: number, amountCents },
        });
      }
    }

    for (const r of q.reminders ?? []) {
      const amountCents = r.kind === 'deposit' ? depositCents : balanceCents;
      const ruleLabel = r.rule === 'deposit_unpaid' ? 'deposit reminder' : 'overdue balance reminder';
      await db.reminder.create({
        data: {
          quoteId: quote.id,
          invoiceId: invoiceIds[r.kind],
          rule: r.rule,
          outcome: r.outcome,
          reason: r.reason,
          subject: `${r.kind === 'deposit' ? 'Deposit' : 'Balance'} for ${q.title}`,
          message:
            r.outcome === 'sent' || r.outcome === 'scheduled'
              ? `Hi ${c.contactName.split(' ')[0]}, a friendly reminder that the ${r.kind} of ${eur(amountCents)} for ${q.title} is ${r.rule === 'balance_overdue' ? 'now past due' : 'due soon'}. You can pay securely with the PayPal link in the invoice. Thank you! Northstar Rentals`
              : null,
          amountCents,
          // A scheduled reminder belongs to the day it will go out; the others to the day they happened.
          day: isoDay(r.scheduledFor ?? r.at),
          scheduledFor: r.scheduledFor,
          createdAt: r.at,
        },
      });
      const verb = { sent: 'sent', scheduled: 'scheduled', skipped: 'skipped', failed: 'failed' }[r.outcome];
      events.push({
        at: r.at,
        actor: 'agent',
        type: `reminder.${r.outcome}`,
        message: `${ruleLabel[0].toUpperCase()}${ruleLabel.slice(1)} ${verb}${r.reason ? ` · ${r.reason}` : ''}`,
      });
    }

    const stateEvents: Partial<Record<QuoteState, Date | undefined>> = {
      deposit_due: q.deposit?.sentAt,
      deposit_paid: q.deposit?.paidAt,
      balance_due: q.balance?.sentAt,
      paid: q.balance?.paidAt,
    };
    for (const [state, when] of Object.entries(stateEvents)) {
      if (!when) continue;
      events.push({
        at: new Date(when.getTime() + 1000),
        actor: state === 'deposit_paid' || state === 'paid' ? 'paypal' : 'operator',
        type: 'state.changed',
        message: `State → ${state.replace('_', ' ')}`,
        meta: { to: state },
      });
    }

    events.sort((a, b) => a.at.getTime() - b.at.getTime());
    await db.activity.createMany({
      data: events.map((e) => ({ quoteId: quote.id, at: e.at, actor: e.actor, type: e.type, message: e.message, meta: e.meta ? JSON.stringify(e.meta) : null })),
    });
  }

  await db.reminderRule.createMany({
    data: [
      { key: 'deposit_unpaid', enabled: true, offsetDays: -2 },
      { key: 'balance_overdue', enabled: true, offsetDays: 1 },
    ],
  });

  const counts = await Promise.all([db.priceListItem.count(), db.incomingRequest.count(), db.quote.count(), db.reminder.count()]);
  console.log(`Seeded Northstar Rentals: ${counts[0]} price list items, ${counts[1]} requests, ${counts[2]} quotes, ${counts[3]} reminders.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
