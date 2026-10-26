// AG Studio data sources for the Cash Flow report, built from lib/cashflow.ts. Field ids
// ('receivables.amountOwed') are what the report state in ./report.ts refers to.

import type { AgDataSourcesDefinition, AgExpressionFieldDefinition, AgFieldDefinition, AgFormat, AgRelationDefinition } from 'ag-studio';
import type { CashflowData } from '@/lib/cashflow';
import type { QuotelyRegistry } from './widgets';

const EUR = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 });
// Dates arrive as YYYY-MM-DD calendar days, which Studio reads as local midnight; formatting them
// in the same (local) zone keeps the day.
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

type Spec = [id: string, name: string, format: AgFormat, hide?: boolean];

const fields = (specs: Spec[]): AgFieldDefinition[] =>
  specs.map(([id, name, format, hide]) => ({
    id,
    name,
    format,
    ...(format === 'currencyFormat' && { formatOptions: { format: EUR } }),
    ...(format === 'dateFormat' && { formatOptions: { format: DAY } }),
    ...(hide && { hide }),
  }));

/**
 * A named money measure: the sum of one field. Widgets use these instead of a raw field with a sum
 * aggregation, so legends and headers read "Deposits received" rather than "Deposits received (sum)".
 * (Studio 3.0 has no plain "sum" operator for expressions; sum + 0 is the same number.)
 */
const total = (id: string, name: string, field: string, description: string): AgExpressionFieldDefinition<QuotelyRegistry> => ({
  id,
  name,
  description,
  format: 'currencyFormat',
  formatOptions: { format: EUR },
  isMeasure: true,
  expression: { operator: 'add', inputs: [{ id: field, aggregation: 'sum' }, { literal: 0 }] },
});

// Receivables and payments both point at one customers table, so a single Customer filter (or a
// cross-filter click) narrows every widget at once.
const toCustomer = (table: string): AgRelationDefinition => ({
  id: `${table}-customer`,
  source: { tableId: table, fieldId: 'customer' },
  target: { tableId: 'customers', fieldId: 'company' },
  type: 'many-to-one',
});

export function buildStudioData(data: CashflowData): AgDataSourcesDefinition<QuotelyRegistry> {
  const customers = [...new Set([...data.receivables, ...data.payments].map((r) => r.customer))].sort().map((company) => ({ company }));
  return {
    description:
      'Quotely, a quote-to-cash app for Northstar Rentals (Milan). Every quote is paid in two PayPal invoices: a deposit (usually 30%) ' +
      'when it is approved and the balance when the job is complete. All money is in EUR.',
    sources: [
      {
        id: 'customers',
        name: 'Customers',
        description: 'Every customer with money owed or received.',
        data: customers,
        fields: fields([['company', 'Customer', 'textFormat']]),
      },
      {
        id: 'receivables',
        name: 'Receivables',
        description: 'Invoices sent and not yet paid, one row each. Overdue amount is the amount owed on invoices past their due date.',
        data: data.receivables,
        fields: fields([
          ['id', 'Invoice ID', 'textFormat', true],
          ['quoteId', 'Quote ID', 'textFormat', true],
          ['quote', 'Quote', 'textFormat'],
          ['customer', 'Customer', 'textFormat', true],
          ['invoice', 'Invoice', 'textFormat'],
          ['kind', 'Invoice type', 'textFormat'],
          ['stage', 'Stage', 'textFormat'],
          ['amountOwed', 'Amount owed', 'currencyFormat'],
          ['overdueAmount', 'Overdue amount', 'currencyFormat'],
          ['dueDate', 'Due date', 'dateFormat'],
          ['daysOverdue', 'Days overdue', 'integerFormat'],
          ['reminderStatus', 'Reminder status', 'textFormat'],
        ]),
      },
      {
        id: 'payments',
        name: 'Payments received',
        description: 'Invoices paid and verified by PayPal, one row each. The "this month" fields are zero outside the current month.',
        data: data.payments,
        fields: fields([
          ['id', 'Payment ID', 'textFormat', true],
          ['quote', 'Quote', 'textFormat'],
          ['customer', 'Customer', 'textFormat', true],
          ['kind', 'Payment type', 'textFormat'],
          ['amount', 'Amount received', 'currencyFormat'],
          ['paidDate', 'Paid on', 'dateFormat'],
          ['depositsThisMonth', 'Deposits secured this month', 'currencyFormat'],
          ['balancesThisMonth', 'Balances received this month', 'currencyFormat'],
          ['collectedThisMonth', 'Collected this month', 'currencyFormat'],
        ]),
      },
      {
        id: 'cashWeeks',
        name: 'Cash movement by week',
        description: 'Per week (starting Monday): deposits and balances received, and the amount of invoices falling due that week.',
        data: data.weeks,
        fields: fields([
          ['id', 'Week ID', 'textFormat', true],
          ['weekStart', 'Week', 'dateFormat'],
          ['depositsReceived', 'Deposits received', 'currencyFormat'],
          ['balancesReceived', 'Balances received', 'currencyFormat'],
          ['expected', 'Expected (due)', 'currencyFormat'],
        ]),
      },
    ],
    relationships: [toCustomer('receivables'), toCustomer('payments')],
    expressions: [
      total('outstanding', 'Outstanding', 'receivables.amountOwed', 'Money owed on invoices sent and not yet paid.'),
      total('overdue', 'Overdue', 'receivables.overdueAmount', 'Money owed on invoices past their due date.'),
      total('owed', 'Amount owed', 'receivables.amountOwed', 'Amount still owed on an invoice.'),
      total('depositsSecured', 'Deposits secured', 'payments.depositsThisMonth', 'Deposits paid this month.'),
      total('collected', 'Collected', 'payments.collectedThisMonth', 'Everything paid this month: deposits and balances.'),
      total('depositsReceived', 'Deposits received', 'cashWeeks.depositsReceived', 'Deposits paid in the week.'),
      total('balancesReceived', 'Balances received', 'cashWeeks.balancesReceived', 'Balances paid in the week.'),
      total('expectedDue', 'Expected (due)', 'cashWeeks.expected', 'Invoices falling due in the week, paid or not.'),
    ],
  };
}
