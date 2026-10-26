'use client';

import { useState, useTransition } from 'react';
import type { ReminderRuleKey } from '@prisma/client';
import { AlertIcon, CheckIcon, SparkIcon } from '@/components/icons';
import { Button, Card, Label, cx } from '@/components/ui';
import { formatDateTime } from '@/lib/dates';
import { sampleReminder } from '@/lib/agent/reminder-text';
import { runNudgeNowAction } from '../payment-actions';
import { saveReminderRulesAction } from './actions';

type Rule = { key: ReminderRuleKey; enabled: boolean; offsetDays: number };
type LastRun = { ranAt: string; sent: number; scheduled: number; skipped: number; failed: number } | null;

const COPY: Record<ReminderRuleKey, { title: string; body: string; unit: string; min: number; max: number }> = {
  deposit_unpaid: { title: 'Unpaid deposit', body: 'One friendly reminder before the deposit is due.', unit: 'days before the due date', min: 0, max: 14 },
  balance_overdue: { title: 'Overdue balance', body: 'A reminder after the balance is late, repeated every 3 days until it is paid.', unit: 'days after the due date', min: 1, max: 30 },
};

// The UI speaks in "days before/after"; the database stores a signed offset.
const toDays = (r: Rule) => Math.abs(r.offsetDays);
const toOffset = (key: ReminderRuleKey, days: number) => (key === 'deposit_unpaid' ? -days : days);

export function ReminderRules({ rules: initial, lastRun: initialRun }: { rules: Rule[]; lastRun: LastRun }) {
  const [rules, setRules] = useState(initial);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [lastRun, setLastRun] = useState(initialRun);
  const [saving, startSaving] = useTransition();
  const [running, startRunning] = useTransition();

  const update = (key: ReminderRuleKey, patch: Partial<Rule>) => {
    setRules((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setMessage(null);
  };
  const invalid = rules.some((r) => {
    const d = toDays(r);
    return !Number.isInteger(d) || d < COPY[r.key].min || d > COPY[r.key].max;
  });

  const save = () =>
    startSaving(async () => {
      const result = await saveReminderRulesAction(rules);
      setMessage(result.ok ? { ok: true, text: 'Reminder rules saved. Pending reminders are rescheduled to match.' } : { ok: false, text: result.error });
    });
  const runNow = () =>
    startRunning(async () => {
      const result = await runNudgeNowAction();
      if (result.ok) setLastRun({ ranAt: new Date().toISOString(), ...result.data });
      else setMessage({ ok: false, text: result.error });
    });

  return (
    <div className="flex max-w-[680px] flex-col gap-5">
      {rules.map((rule) => {
        const copy = COPY[rule.key];
        const preview = sampleReminder(rule.key, rule.offsetDays);
        return (
          <Card key={rule.key} className={cx('p-5 transition-opacity duration-[180ms]', !rule.enabled && 'opacity-70')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[16px] leading-6 font-bold">{copy.title}</h2>
                <p className="text-[13px] text-fg-2">{copy.body}</p>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] font-[650] text-fg-2">
                {rule.enabled ? 'On' : 'Off'}
                <input
                  type="checkbox"
                  role="switch"
                  checked={rule.enabled}
                  onChange={(e) => update(rule.key, { enabled: e.target.checked })}
                  className="peer sr-only"
                />
                <span
                  aria-hidden
                  className={cx(
                    'relative h-6 w-11 rounded-full border transition-colors duration-[180ms] peer-focus-visible:outline-2 peer-focus-visible:outline-focus',
                    rule.enabled ? 'border-accent bg-accent' : 'border-line-strong bg-surface-3',
                  )}
                >
                  <span
                    className={cx(
                      'absolute top-0.5 size-[18px] rounded-full transition-[left] duration-[180ms]',
                      rule.enabled ? 'left-[22px] bg-accent-fg' : 'left-0.5 bg-fg-3',
                    )}
                  />
                </span>
              </label>
            </div>

            <label className="mt-4 flex items-center gap-3 text-[13px] text-fg-2">
              Send
              <input
                type="number"
                min={copy.min}
                max={copy.max}
                value={toDays(rule)}
                disabled={!rule.enabled}
                onChange={(e) => update(rule.key, { offsetDays: toOffset(rule.key, Number(e.target.value)) })}
                className="h-11 w-20 rounded-control border border-line bg-surface-2 px-3 text-right font-mono text-fg focus:border-focus focus:outline-none disabled:opacity-50"
              />
              {copy.unit}, at 09:00
            </label>

            <div className="mt-4 rounded-control border border-line bg-surface-2 p-4">
              <Label>Message preview · drafted by AI for each customer</Label>
              <div className="mt-2 text-[12px] text-fg-3">
                To: {preview.customer} · Subject: <span className="text-fg">{preview.subject}</span>
              </div>
              <p className="mt-2 text-[12px] leading-[19px] whitespace-pre-wrap text-fg-2">{preview.body}</p>
            </div>
          </Card>
        );
      })}

      <div className="flex items-center justify-between gap-4">
        <p className="text-[12px] text-fg-3">Reminders are checked against the latest payment status before sending.</p>
        <Button variant="primary" onClick={save} disabled={saving || invalid}>
          {saving ? 'Saving…' : 'Save reminder rules'}
        </Button>
      </div>
      {invalid && <p className="text-[12px] text-danger">Use 0–14 days before for deposits and 1–30 days after for balances.</p>}
      {message && (
        <p role="status" className={cx('flex items-center gap-1.5 text-[13px] font-[650]', message.ok ? 'text-accent' : 'text-danger')}>
          {message.ok ? <CheckIcon className="size-4" /> : <AlertIcon className="size-4" />} {message.text}
        </p>
      )}

      <Card className="flex items-center justify-between gap-4 p-5">
        <div>
          <div className="flex items-center gap-2 font-[650]">
            <SparkIcon className="size-4 text-accent" /> Nudge agent
          </div>
          <p className="mt-0.5 text-[13px] text-fg-2">
            {lastRun
              ? `Last run ${formatDateTime(lastRun.ranAt)} · ${lastRun.sent} sent, ${lastRun.scheduled} scheduled, ${lastRun.skipped} skipped, ${lastRun.failed} failed`
              : 'Runs every minute while Quotely is open, and on POST /api/agent/nudge.'}
          </p>
          <p className="mt-0.5 text-[12px] text-fg-3">Reminders are logged and shown on each quote; v1 does not email them.</p>
        </div>
        <Button onClick={runNow} disabled={running}>
          {running ? 'Running…' : 'Run now'}
        </Button>
      </Card>
    </div>
  );
}
