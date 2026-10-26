// Read models for the pages. Server-only (Prisma).

import { db } from './db';

export function listRequests() {
  return db.incomingRequest.findMany({
    orderBy: { receivedAt: 'desc' },
    include: {
      customer: true,
      quotes: {
        select: { id: true, number: true, state: true, jobStartDate: true, lines: { select: { match: true } } },
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

export type InboxRequest = Awaited<ReturnType<typeof listRequests>>[number];

export function listQuotes() {
  return db.quote.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { company: true, contactName: true } },
      invoices: { select: { kind: true, status: true, dueDate: true, amountCents: true, paidCents: true } },
    },
  });
}

export function getQuote(id: string) {
  return db.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      request: true,
      lines: { orderBy: { position: 'asc' } },
      invoices: { orderBy: { createdAt: 'asc' } },
      // Oldest first, as the timeline reads top to bottom; id breaks ties between same-moment entries.
      activities: { orderBy: [{ at: 'asc' }, { id: 'asc' }] },
      reminders: { orderBy: { createdAt: 'desc' } },
    },
  });
}
