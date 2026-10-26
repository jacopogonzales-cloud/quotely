// Server-side, non-streaming calls to the OpenAI Responses API for Quotely's own features
// (quote extraction, reminder drafts). Same key and endpoint as the AG Studio proxy in
// app/api/ai/responses; the key never leaves the server.

import { OPENAI_RESPONSES_URL, QUOTELY_MODEL, openAiKey } from '.';

export class AiError extends Error {
  constructor(
    message: string,
    readonly kind: 'not_configured' | 'upstream' | 'invalid_output' | 'timeout',
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const TIMEOUT_MS = 60_000;
// Reasoning tokens count towards this, so it is generous for a small JSON answer.
const MAX_OUTPUT_TOKENS = 8_000;

type ResponsesOutput = {
  status?: string;
  error?: { message?: string } | null;
  incomplete_details?: { reason?: string } | null;
  output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
};

/** Asks the model for JSON matching `schema` and returns it parsed. Callers validate the content. */
export async function respondJson<T>(args: {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const apiKey = openAiKey();
  if (!apiKey) throw new AiError('No OpenAI key configured (AG_STUDIO_OPENAI_API_KEY or OPENAI_API_KEY).', 'not_configured');

  let res: Response;
  try {
    res = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: QUOTELY_MODEL,
        instructions: args.instructions,
        input: args.input,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        store: false,
        text: { format: { type: 'json_schema', name: args.name, strict: true, schema: args.schema } },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new AiError(timedOut ? 'The AI request timed out.' : `The AI request failed: ${String(err)}`, timedOut ? 'timeout' : 'upstream');
  }

  const body = (await res.json().catch(() => ({}))) as ResponsesOutput;
  if (!res.ok) throw new AiError(`OpenAI ${res.status}: ${body.error?.message ?? 'unknown error'}`, 'upstream');
  if (body.status === 'incomplete') {
    throw new AiError(`The AI answer was cut short (${body.incomplete_details?.reason ?? 'incomplete'}).`, 'invalid_output');
  }

  const content = body.output?.find((o) => o.type === 'message')?.content ?? [];
  const refusal = content.find((c) => c.type === 'refusal')?.refusal;
  if (refusal) throw new AiError(`The model declined: ${refusal}`, 'invalid_output');
  const text = content.find((c) => c.type === 'output_text')?.text;
  if (!text) throw new AiError('The AI returned no text.', 'invalid_output');

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AiError('The AI returned malformed JSON.', 'invalid_output');
  }
}
