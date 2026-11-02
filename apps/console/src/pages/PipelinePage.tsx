import { demoMode } from '@kaihuman/core';
import {
  CLIENT_STAGES,
  type ClientStage,
  clientDir,
  type Slug,
  setClientStage,
} from '@kaihuman/formats/business';
import { useEffect, useState } from 'preact/hooks';
import { money } from '../components/business/money';
import { PageShell } from '../components/business/PageShell';
import { ProblemsList } from '../components/business/ProblemsList';
import { todayLocal } from '../lib/business/dates';
import { type ClientSummary, clientSummaries } from '../lib/business/overview';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

export const STAGE_LABEL: Record<ClientStage, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  'offer-sent': 'Offer sent',
  active: 'Active',
  past: 'Past',
  lost: 'Lost',
};

const INPUT =
  'bg-transparent border border-[var(--los-border)] px-1 py-0.5 text-xs w-full min-w-0 text-[var(--los-fg)]';
const COLLAPSED: readonly ClientStage[] = ['past', 'lost'];
const selectId = (slug: string) => `move-${slug}`;

export function PipelinePage() {
  const state = useBusinessRepo();
  // Stages shown right after a move, until the reloaded repository carries the committed change.
  const [moved, setMoved] = useState<Record<string, ClientStage>>({});
  const [announcement, setAnnouncement] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [focusSlug, setFocusSlug] = useState<string | null>(null);
  const data = state.status === 'ready' ? state.data : null;

  // New repository data already contains the moves.
  useEffect(() => setMoved({}), [data]);
  // A card remounts in its new column, so focus goes back to its select.
  useEffect(() => {
    if (focusSlug) document.getElementById(selectId(focusSlug))?.focus();
  }, [focusSlug, moved, data]);

  async function move(target: KBRepo, client: ClientSummary, stage: ClientStage) {
    if (busy || demoMode.value || stage === client.stage) return;
    setBusy(true);
    setError(null);
    setAnnouncement('');
    try {
      const slug: Slug = client.slug;
      const result = await writeBusiness(target, async (fresh) => {
        const path = `${clientDir(slug)}/client.yaml`;
        const text = await fresh.read(path);
        if (text === null) {
          return { ok: false, issues: [{ path: 'client', message: `Could not read ${path}.` }] };
        }
        return setClientStage(fresh.repo, slug, stage, text);
      });
      if (!result.ok) {
        setError(result.issues[0]?.message ?? 'Nothing was saved.');
        return;
      }
      setMoved((m) => ({ ...m, [slug]: stage }));
      setAnnouncement(`${client.name} moved to ${STAGE_LABEL[stage]}.`);
      setFocusSlug(slug);
    } catch (e) {
      setError(writeErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageShell state={state} title="Pipeline">
      {({ data: repo, repo: target, loadErrors }) => {
        const all = clientSummaries(repo, todayLocal()).map((c) => ({
          ...c,
          stage: moved[c.slug] ?? c.stage,
        }));
        const inStage = (s: ClientStage) => all.filter((c) => c.stage === s);
        const archivedCount = COLLAPSED.reduce((n, s) => n + inStage(s).length, 0);
        const stages = CLIENT_STAGES.filter((s) => showArchived || !COLLAPSED.includes(s));
        return (
          <>
            <p class="text-xs">
              <a href="/business" class="text-[var(--los-accent)] hover:underline">
                Back to business
              </a>
            </p>
            {demoMode.value && (
              <p class="text-xs text-[var(--los-muted)]">
                Moving clients is not available in demo mode.
              </p>
            )}
            <output class="block text-xs min-h-4">{announcement}</output>
            {error && (
              <p role="alert" class="text-xs text-[var(--los-error,#c33)] break-words">
                {error}
              </p>
            )}
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {stages.map((stage) => {
                const clients = inStage(stage);
                return (
                  <section key={stage} class="border border-[var(--los-border)] p-3 min-w-0">
                    <h2 class="text-[10px] uppercase tracking-widest text-[var(--los-muted)] mb-2">
                      {STAGE_LABEL[stage]} ({clients.length})
                    </h2>
                    {clients.length === 0 ? (
                      <p class="text-xs italic text-[var(--los-muted)]">None</p>
                    ) : (
                      <ul class="space-y-2">
                        {clients.map((c) => (
                          <li key={c.slug} class="border border-[var(--los-border)] p-2 text-xs">
                            <a
                              href={`/clients/${c.slug}`}
                              class="text-[var(--los-accent)] hover:underline break-words"
                            >
                              {c.name}
                            </a>
                            <p class="text-[var(--los-muted)]">Open {money(c.open, c.currency)}</p>
                            <p class="text-[var(--los-muted)]">
                              Last activity {c.lastActivity ?? 'none'}
                            </p>
                            {!demoMode.value && (
                              <div class="mt-1">
                                <label for={selectId(c.slug)} class="sr-only">
                                  Move {c.name} to…
                                </label>
                                <select
                                  id={selectId(c.slug)}
                                  class={INPUT}
                                  value={c.stage}
                                  disabled={busy}
                                  onChange={(e) =>
                                    move(
                                      target,
                                      c,
                                      (e.currentTarget as HTMLSelectElement).value as ClientStage,
                                    )
                                  }
                                >
                                  {CLIENT_STAGES.map((s) => (
                                    <option key={s} value={s}>
                                      {STAGE_LABEL[s]}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
            <button
              type="button"
              aria-expanded={showArchived}
              onClick={() => setShowArchived((v) => !v)}
              class="text-xs text-[var(--los-accent)] hover:underline"
            >
              {showArchived ? 'Hide past and lost' : `Show past and lost (${archivedCount})`}
            </button>
            <ProblemsList findings={repo.findings} loadErrors={loadErrors} />
          </>
        );
      }}
    </PageShell>
  );
}
