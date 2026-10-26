// Every prompt Quotely sends to the model. Kept together so wording can be reviewed in one place.

// --- Quote extraction ----------------------------------------------------------------

export const EXTRACTION_INSTRUCTIONS = `You turn a customer's request (an email or form message) into a structured quote draft for a B2B rental and services company.

Rules:
- Extract only what the customer asked for. Do not add items they did not request.
- Match each requested item to the company's price list by SKU when it is clearly the same thing (synonyms are listed as aliases). If nothing on the price list fits, return sku = null. Never force a match.
- Never output prices. Prices come only from the price list, which the application applies after you answer.
- quantity is a whole number. "a", "an" or "one" is 1. A flat service such as delivery and setup is 1. If no quantity is stated, use 1.
- sourceText must be copied verbatim from the request: the shortest phrase that names the item and its quantity (e.g. "4 x 65-inch displays"). It must appear exactly in the request text.
- Dates are ISO (YYYY-MM-DD). Resolve dates without a year relative to the reference date, choosing the next future occurrence. For a single-day job, startDate and endDate are the same. If no job date is given, use null.
- dateText and locationText are verbatim phrases from the request, or null.
- title is a short job name in English, 3 to 6 words, e.g. "Client presentation, Via Tortona".
- notes: short, factual remarks the operator should check before sending (timing constraints, pickup, ambiguities, items not on the price list). At most 4. Write dates in notes as "12 Nov", not ISO. Do not repeat payment preferences. No marketing language.`;

export function extractionInput(args: {
  requestText: string;
  priceList: { sku: string; name: string; unit: string; aliases: string }[];
  referenceDate: string;
}) {
  const priceList = args.priceList
    .map((p) => `${p.sku} | ${p.name} | ${p.unit}${p.aliases ? ` | aliases: ${p.aliases}` : ''}`)
    .join('\n');
  return `Reference date: ${args.referenceDate}

Price list (SKU | name | unit | aliases):
${priceList}

Customer request:
"""
${args.requestText}
"""`;
}

/** JSON schema for the extraction (OpenAI structured outputs, strict mode: every field required, nullables typed). */
export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['customer', 'job', 'lines', 'notes'],
  properties: {
    customer: {
      type: 'object',
      additionalProperties: false,
      required: ['company', 'contactName', 'email'],
      properties: {
        company: { type: ['string', 'null'] },
        contactName: { type: ['string', 'null'] },
        email: { type: ['string', 'null'] },
      },
    },
    job: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'location', 'locationText', 'startDate', 'endDate', 'dateText'],
      properties: {
        title: { type: 'string' },
        location: { type: ['string', 'null'] },
        locationText: { type: ['string', 'null'] },
        startDate: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        endDate: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
        dateText: { type: ['string', 'null'] },
      },
    },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['description', 'quantity', 'sku', 'sourceText'],
        properties: {
          description: { type: 'string', description: 'What the customer asked for, in their words, cleaned up' },
          quantity: { type: 'integer' },
          sku: { type: ['string', 'null'] },
          sourceText: { type: 'string' },
        },
      },
    },
    notes: { type: 'array', items: { type: 'string' } },
  },
} as const;
