'use server';

// Server actions for the inbox and the quote builder. Quotely v1 is a single-operator app with no
// login, so there is no per-user authorisation here; every input is validated in lib/drafting.ts.

import { revalidatePath } from 'next/cache';
import { AiError } from '@/lib/ai/respond';
import { addRequest, DraftError, draftQuoteManually, draftQuoteWithAi, saveDraft, type DraftOutcome } from '@/lib/drafting';
import { parseDraftInput, type DraftInput } from '@/lib/quote-draft';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const MAX_REQUEST_CHARS = 20_000;

export async function addRequestAction(text: string): Promise<ActionResult<{ id: string }>> {
  const body = typeof text === 'string' ? text.trim() : '';
  if (body.length < 10) return { ok: false, error: 'Paste the customer’s message (at least a sentence).' };
  if (body.length > MAX_REQUEST_CHARS) return { ok: false, error: 'That message is too long to read. Paste the relevant part.' };
  const request = await addRequest(body);
  revalidatePath('/inbox');
  return { ok: true, data: { id: request.id } };
}

export async function draftWithAiAction(requestId: string, regenerate = false): Promise<ActionResult<DraftOutcome>> {
  try {
    const outcome = await draftQuoteWithAi(String(requestId), { regenerate: Boolean(regenerate) });
    revalidatePath('/inbox');
    revalidatePath('/quotes');
    return { ok: true, data: outcome };
  } catch (err) {
    // The request itself is untouched on failure; the UI offers Try again / Create manually.
    console.error('[quotely] AI draft failed:', err instanceof Error ? err.message : err);
    return { ok: false, error: err instanceof AiError && err.kind === 'not_configured' ? 'not_configured' : 'failed' };
  }
}

export async function draftManuallyAction(requestId: string): Promise<ActionResult<DraftOutcome>> {
  try {
    const outcome = await draftQuoteManually(String(requestId));
    revalidatePath('/inbox');
    revalidatePath('/quotes');
    return { ok: true, data: outcome };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create the quote.' };
  }
}

export async function saveDraftAction(quoteId: string, draft: DraftInput): Promise<ActionResult<{ totalCents: number }>> {
  try {
    // No revalidatePath: every page reads per request, and a refresh would re-render the builder mid-edit.
    const totals = await saveDraft(String(quoteId), parseDraftInput(draft));
    return { ok: true, data: { totalCents: totals.totalCents } };
  } catch (err) {
    if (err instanceof DraftError || err instanceof TypeError) return { ok: false, error: err.message };
    console.error('[quotely] save draft failed:', err);
    return { ok: false, error: 'Couldn’t save your changes.' };
  }
}
