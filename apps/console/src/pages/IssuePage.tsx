import { authStore, demoMode } from '@kaihuman/core';
import type { BusinessRepo, Draft, Issue, LinkRecord, Result } from '@kaihuman/formats/business';
import { useEffect, useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { a11y, Field, INPUT } from '../components/business/FormField';
import { money } from '../components/business/money';
import { PageShell } from '../components/business/PageShell';
import { isRealDate, todayLocal } from '../lib/business/dates';
import {
  type IssuePreview,
  issuedNotice,
  issueFromFresh,
  loadedSource,
  previewIssue,
} from '../lib/business/issue-flow';
import { parseLoadError } from '../lib/business/load';
import { showNotice } from '../lib/business/notice';
import { latestLink } from '../lib/business/overview';
import { revokeShareLink, shareApi, shareServiceUrl } from '../lib/business/share';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

const DATE_ERROR = 'Enter the issue date as YYYY-MM-DD.';
const link = 'text-[var(--los-accent)] hover:underline';
const KIND: Record<Draft['kind'], string> = {
  invoice: 'Invoice',
  'credit-note': 'Credit note',
  offer: 'Offer',
};

/** The corrected invoice's share link, when a credit note would leave it live. */
const linkToRevoke = (data: BusinessRepo, draft: Draft): LinkRecord | null => {
  if (draft.kind !== 'credit-note' || !draft.corrects) return null;
  const l = latestLink(data.links, draft.corrects);
  if (!l || l.revoked) return null;
  if (l.expires !== undefined && l.expires.slice(0, 10) < todayLocal()) return null;
  return l;
};

const Row = (props: { label: string; value: string; strong?: boolean }) => (
  <div class="flex justify-between gap-3">
    <dt class="text-[var(--los-muted)]">{props.label}</dt>
    <dd class={props.strong ? 'font-bold' : ''}>{props.value}</dd>
  </div>
);

const Problems = ({ issues }: { issues: Issue[] }) => (
  <div role="alert">
    <ul class="text-xs text-[var(--los-warning)] list-disc pl-4 space-y-1">
      {issues.map((i) => (
        <li key={`${i.path}:${i.message}`}>{i.message}</li>
      ))}
    </ul>
  </div>
);

function Preview({ p }: { p: IssuePreview }) {
  return (
    <section aria-label="Preview" class="border border-[var(--los-border)] p-3 space-y-3 text-xs">
      <p class="text-base font-bold break-words">
        {KIND[p.kind]} {p.number}
      </p>
      <dl class="space-y-1">
        <Row label="Client" value={p.client} />
        {p.corrects && <Row label="Corrects" value={p.corrects} />}
        <Row label="Issue date" value={p.issueDate} />
        {p.dueDate && <Row label="Due" value={p.dueDate} />}
      </dl>
      <ul aria-label="Lines" class="space-y-1">
        {p.lines.map((l, i) => (
          // Lines have no identity; the order is the document's.
          <li key={i} class="flex justify-between gap-3">
            <span class="min-w-0 break-words">{l.description}</span>
            <span class="whitespace-nowrap text-[var(--los-muted)]">
              {l.quantity} {l.unit} × {money(l.unit_price, p.currency)}, {l.vat_category}{' '}
              {l.vat_rate}%
            </span>
          </li>
        ))}
      </ul>
      <dl aria-label="Totals" class="space-y-1 border-t border-[var(--los-border)] pt-2">
        <Row label="Net" value={money(p.totals.net, p.currency)} />
        <Row label="VAT" value={money(p.totals.vat, p.currency)} />
        <Row label="Gross" value={money(p.totals.gross, p.currency)} strong />
      </dl>
      {p.warnings.length > 0 && (
        <ul aria-label="Warnings" class="space-y-1 text-[var(--los-warning)]">
          {p.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      {p.legalNotes.length > 0 && (
        <ul aria-label="Legal notes" class="space-y-1 text-[var(--los-muted)]">
          {p.legalNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

async function revokeAfterIssue(target: KBRepo, link: LinkRecord): Promise<string | null> {
  try {
    const token = authStore.token.value;
    if (!token) return 'Sign in with GitHub first.';
    const result = await revokeShareLink(target, link, {
      api: shareApi(shareServiceUrl(), token),
    });
    return result.ok ? null : (result.issues[0]?.message ?? 'Nothing was saved.');
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function IssueForm(props: {
  target: KBRepo;
  data: BusinessRepo;
  contents: Record<string, string>;
  /** Files that could not be fetched still exist, so their numbers stay taken. */
  loadErrors: string[];
  draft: Draft;
}) {
  const { target, data, contents, loadErrors, draft } = props;
  const [issueDate, setIssueDate] = useState(todayLocal);
  const [preview, setPreview] = useState<Result<IssuePreview> | null>(null);
  const [problems, setProblems] = useState<Issue[]>([]);
  // The warnings the user has been asked about; issuing waits for a second click.
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // Set synchronously: `busy` only changes after the next render.
  const submitting = useRef(false);
  const dateOk = isRealDate(issueDate);
  const shareLink = demoMode.value ? null : linkToRevoke(data, draft);
  const [revokeLink, setRevokeLink] = useState(true);

  useEffect(() => {
    setConfirming(false);
    if (!dateOk) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    const failed = loadErrors.map((e) => parseLoadError(e).path);
    // Artifacts (a PDF without its yaml) are not fetched but still hold their number, as at commit.
    previewIssue(
      loadedSource(data, contents, [...failed, ...data.artifacts]),
      draft.id,
      issueDate,
      new Date(),
    ).then((r) => {
      if (!cancelled) setPreview(r);
    });
    return () => {
      cancelled = true;
    };
  }, [data, contents, loadErrors, draft.id, issueDate, dateOk]);

  async function handleIssue() {
    if (submitting.current || !dateOk || !preview?.ok) return;
    if (preview.value.warnings.length > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setProblems([]);
    // The commit rebuilds from the repository as it is now, so the number can differ from the preview.
    let committed: string | null = null;
    try {
      const result = await writeBusiness(target, async (fresh) => {
        const r = await issueFromFresh(fresh, draft.id, issueDate, new Date());
        committed = r.ok ? r.value.number : null;
        return r;
      });
      if (!result.ok) {
        setProblems(result.issues);
        return;
      }
      if (committed === null) {
        setProblems([
          { path: 'write', message: 'Issuing failed; reload and check the documents.' },
        ]);
        return;
      }
      const clientPage = `/clients/${draft.client}`;
      let text = issuedNotice(committed);
      if (shareLink && revokeLink) {
        // The credit note is issued for good; a failed revoke only adds a notice.
        const why = await revokeAfterIssue(target, shareLink);
        if (why) {
          text += ` The share link of ${shareLink.doc} could not be revoked: ${why} Revoke it on the client page.`;
        }
      }
      showNotice(text, clientPage);
      route(clientPage);
    } catch (err) {
      setProblems([{ path: 'write', message: writeErrorMessage(err) }]);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const ready = dateOk && preview?.ok === true;
  return (
    <form
      noValidate
      class="max-w-xl space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        handleIssue();
      }}
    >
      <p class="text-xs">
        <a href={`/business/drafts/${draft.id}`} class={link}>
          Back to the draft
        </a>
      </p>
      <Field
        id="issue-date"
        label="Issue date"
        error={dateOk ? undefined : DATE_ERROR}
        hint="The number follows the year of this date."
      >
        <input
          id="issue-date"
          type="date"
          class={INPUT}
          value={issueDate}
          disabled={busy}
          {...a11y('issue-date', dateOk ? undefined : DATE_ERROR)}
          onInput={(e) => setIssueDate((e.target as HTMLInputElement).value)}
        />
      </Field>
      {dateOk && preview === null && (
        <p class="text-xs text-[var(--los-muted)] animate-pulse">Preparing preview...</p>
      )}
      {dateOk && preview?.ok === false && <Problems issues={preview.issues} />}
      {ready && preview.ok && <Preview p={preview.value} />}
      {ready && confirming && preview.ok && (
        <div role="alert" class="text-xs text-[var(--los-warning)] space-y-1">
          {preview.value.warnings.map((w) => (
            <p key={w}>{w}</p>
          ))}
        </div>
      )}
      {ready && (
        <p class="text-xs text-[var(--los-muted)]">
          Issuing is final: the document cannot be changed afterwards, only corrected by a credit
          note. If another device issues first, the next free number is used.
        </p>
      )}
      {ready && shareLink && (
        <label class="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={revokeLink}
            disabled={busy}
            onChange={(e) => setRevokeLink((e.target as HTMLInputElement).checked)}
          />
          Also revoke the share link of {shareLink.doc}
        </label>
      )}
      <button
        type="submit"
        disabled={busy || !ready}
        class="px-4 py-2 bg-[var(--los-accent)] text-black font-bold text-sm rounded hover:opacity-90 disabled:opacity-50"
      >
        {busy
          ? 'Issuing...'
          : `Issue ${preview?.ok ? preview.value.number : ''}${confirming ? ' anyway' : ''}`.trim()}
      </button>
      {problems.length > 0 && <Problems issues={problems} />}
    </form>
  );
}

export function IssuePage({ id }: { id?: string }) {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title="Issue">
      {({ repo, data, contents, loadErrors }) => {
        const draft = data.drafts.find((d) => d.id === id);
        if (!draft) {
          const issued = data.issued.some((i) => i.doc.draft_id === id);
          return (
            <p class="text-xs" role="alert">
              {issued ? 'This draft was already issued.' : `No draft ${id ?? ''}.`}{' '}
              <a href="/business" class={link}>
                Back to business
              </a>
            </p>
          );
        }
        return (
          <IssueForm
            key={draft.id}
            target={repo}
            data={data}
            contents={contents}
            loadErrors={loadErrors}
            draft={draft}
          />
        );
      }}
    </PageShell>
  );
}
