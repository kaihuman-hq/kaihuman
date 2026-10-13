import { githubFileStore, githubProfileStore } from '@kaihuman/core';
import {
  addIdeaChallenge,
  IDEA_STATUSES,
  type IdeaStatus,
  ideaLogEntryTime,
  ideaSlugOf,
  logIdea,
  OPEN_IDEA_STATUSES,
  parseIdea,
  setIdeaStatus,
} from '@kaihuman/formats';
import { StatusBar } from '@kaihuman/ui';
import { AlertTriangle, ArrowLeft, ExternalLink, Plus } from 'lucide-preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { syncKB } from '../lib/github-kb';
import { ideaTreeItems, loadIdeaContents, updateIdeaFile } from '../lib/ideas-files';
import {
  ACTIVITY_WEEKS,
  activitySummary,
  countByStatus,
  IDEA_SORTS,
  type IdeaCard,
  type IdeaSort,
  ideaProducts,
  isOpenStatus,
  matchIdeaCards,
  relativeTime,
  sortIdeaCards,
  statusColor,
  toIdeaCard,
  visibleIdeaCards,
  weekShade,
} from '../lib/ideas-overview';
import './ideas.css';

const tint = (status: IdeaStatus, percent: number) =>
  `color-mix(in oklch, ${statusColor(status)} ${percent}%, transparent)`;

const inputClass =
  'bg-[var(--los-bg)] border border-[var(--los-border)] px-2 py-1.5 text-xs font-mono outline-none focus:border-[var(--los-accent)] transition-colors min-w-0';
const buttonClass =
  'px-3 py-1.5 border border-[var(--los-border)] text-xs font-mono hover:border-[var(--los-accent)] disabled:opacity-50 disabled:cursor-not-allowed';

const StatusBadge = ({ status }: { status: IdeaStatus }) => (
  <span
    class="px-1.5 py-0.5 text-[10px] uppercase tracking-widest font-bold"
    style={{ color: statusColor(status), background: tint(status, 15) }}
  >
    {status}
  </span>
);

const ActivityStrip = ({ card, now }: { card: IdeaCard; now: Date }) => {
  const idle = card.activity.total === 0;
  return (
    <div class="flex items-center gap-2 flex-wrap">
      <span
        class="flex gap-[3px]"
        role="img"
        aria-label={`Log entries per week, last ${ACTIVITY_WEEKS} weeks: ${card.weeks.join(', ')}`}
      >
        {card.weeks.map((count, index) => (
          <span
            key={index}
            class="idea-week"
            data-shade={weekShade(count)}
            title={`${count} ${count === 1 ? 'entry' : 'entries'}, ${ACTIVITY_WEEKS - 1 - index} week(s) ago`}
          />
        ))}
      </span>
      <span class={`text-[10px] ${idle ? 'italic text-[var(--los-muted)]' : ''}`}>
        {activitySummary(card.activity, now)}
      </span>
    </div>
  );
};

const Legend = () => (
  <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--los-muted)]">
    <span class="flex items-center gap-2 flex-wrap">
      {IDEA_STATUSES.map((status) => (
        <span key={status} class="flex items-center gap-1">
          <span class="inline-block w-2.5 h-2.5" style={{ background: statusColor(status) }} />
          {status}
        </span>
      ))}
    </span>
    <span class="flex items-center gap-1">
      activity / week: less
      {[0, 1, 2, 3, 4].map((shade) => (
        <span key={shade} class="idea-week" data-shade={shade} />
      ))}
      more
    </span>
  </div>
);

interface DetailsProps {
  card: IdeaCard;
  path: string;
  onSaved: (path: string, content: string) => void;
}

const IdeaDetails = ({ card, path, onSaved }: DetailsProps) => {
  const { idea } = card;
  const [log, setLog] = useState('');
  const [challenge, setChallenge] = useState('');
  const [status, setStatus] = useState<IdeaStatus>(idea.status);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (edit: (text: string, now: Date) => string, reset: () => void) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(path, await updateIdeaFile(path, (text) => edit(text, new Date())));
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const openChallenges = idea.challenges.filter((c) => !c.done);
  const filePath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return (
    <div class="flex flex-col gap-4 pt-3 border-t border-[var(--los-border)] text-xs">
      {idea.summary && <p class="whitespace-pre-wrap leading-relaxed">{idea.summary}</p>}

      <section class="flex flex-col gap-1">
        <h3 class="text-[10px] uppercase tracking-widest text-[var(--los-muted)]">Log</h3>
        {idea.log.length === 0 ? (
          <p class="italic text-[var(--los-muted)]">No log entries yet.</p>
        ) : (
          <ul class="flex flex-col gap-1">
            {idea.log.slice(0, 5).map((entry) => (
              <li key={`${entry.at}-${entry.text}`} class="flex gap-2">
                <span class="shrink-0 text-[var(--los-muted)]">{entry.at}</span>
                <span class="shrink-0 text-[var(--los-accent)]">{entry.author}</span>
                <span class="min-w-0 break-words">{entry.text}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section class="flex flex-col gap-1">
        <h3 class="text-[10px] uppercase tracking-widest text-[var(--los-muted)]">
          Open challenges
        </h3>
        {openChallenges.length === 0 ? (
          <p class="italic text-[var(--los-muted)]">None.</p>
        ) : (
          <ul class="flex flex-col gap-1 list-disc pl-4">
            {openChallenges.map((c) => (
              <li key={c.text}>{c.text}</li>
            ))}
          </ul>
        )}
      </section>

      <div class="grid gap-2 md:grid-cols-3">
        <form
          class="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (text, now) => logIdea(text, log, { author: 'human', now }),
              () => setLog(''),
            );
          }}
        >
          <input
            class={`${inputClass} flex-1`}
            placeholder="Add a log entry"
            aria-label="Log entry"
            value={log}
            onInput={(e) => setLog(e.currentTarget.value)}
          />
          <button type="submit" class={buttonClass} disabled={busy || !log.trim()}>
            Log
          </button>
        </form>
        <form
          class="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (text, now) => addIdeaChallenge(text, challenge, { now }),
              () => setChallenge(''),
            );
          }}
        >
          <input
            class={`${inputClass} flex-1`}
            placeholder="Add a challenge"
            aria-label="Challenge"
            value={challenge}
            onInput={(e) => setChallenge(e.currentTarget.value)}
          />
          <button type="submit" class={buttonClass} disabled={busy || !challenge.trim()}>
            Add
          </button>
        </form>
        <form
          class="flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              (text, now) => setIdeaStatus(text, status, { author: 'human', now, reason }),
              () => setReason(''),
            );
          }}
        >
          <select
            class={inputClass}
            aria-label="New status"
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value as IdeaStatus)}
          >
            {IDEA_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            class={`${inputClass} flex-1`}
            placeholder="Reason (optional)"
            aria-label="Reason"
            value={reason}
            onInput={(e) => setReason(e.currentTarget.value)}
          />
          <button type="submit" class={buttonClass} disabled={busy || status === idea.status}>
            Set
          </button>
        </form>
      </div>

      {error && <p class="text-[var(--idea-status-dropped)]">{error}</p>}

      <a
        href={`/files/${filePath}`}
        onClick={(e) => {
          e.preventDefault();
          route(`/files/${filePath}`);
        }}
        class="self-start flex items-center gap-1 text-[var(--los-muted)] hover:text-[var(--los-accent)]"
      >
        <ExternalLink size={12} /> Open file
      </a>
    </div>
  );
};

interface CardProps {
  card: IdeaCard;
  path: string;
  now: Date;
  expanded: boolean;
  onToggle: () => void;
  onSaved: (path: string, content: string) => void;
}

const IdeaCardView = ({ card, path, now, expanded, onToggle, onSaved }: CardProps) => {
  const { idea, activity } = card;
  const last = idea.log[0];
  const lastAt = last ? ideaLogEntryTime(last.at) : null;
  return (
    <article
      class={`flex flex-col gap-2 p-3 border border-[var(--los-border)] border-l-4 bg-[var(--los-bg)] min-w-0 ${
        expanded ? 'sm:col-span-2 xl:col-span-3' : ''
      } ${isOpenStatus(idea.status) ? '' : 'opacity-75'}`}
      style={{ borderLeftColor: statusColor(idea.status) }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        class="flex flex-col gap-2 text-left min-w-0"
      >
        <div class="flex items-center gap-2 flex-wrap">
          <StatusBadge status={idea.status} />
          <span
            class="idea-level px-1.5 py-0.5 text-[10px] uppercase tracking-widest"
            data-level={activity.total === 0 ? 'none' : activity.level}
            title="Activity: hot ≤ 7 d, warm ≤ 30 d, cool ≤ 90 d, dormant older or never"
          >
            {activity.total === 0 ? 'no activity' : activity.level}
          </span>
          {card.openChallenges > 0 && (
            <span
              class="flex items-center gap-1 text-[10px] text-[var(--idea-status-parked)]"
              title="Open challenges"
            >
              <AlertTriangle size={11} /> {card.openChallenges}
            </span>
          )}
        </div>
        <div class="min-w-0">
          <h2 class="text-sm font-bold leading-snug break-words">{idea.title}</h2>
          <span class="text-[10px] font-mono text-[var(--los-muted)] break-all">{card.slug}</span>
        </div>
        {(idea.product || idea.tags.length > 0) && (
          <div class="flex flex-wrap gap-1 text-[10px]">
            {idea.product && (
              <span class="px-1.5 py-0.5 border border-[var(--los-border)]">{idea.product}</span>
            )}
            {idea.tags.map((tag) => (
              <span key={tag} class="px-1.5 py-0.5 text-[var(--los-muted)]">
                #{tag}
              </span>
            ))}
          </div>
        )}
        {idea.summary && !expanded && (
          <p class="text-xs leading-relaxed line-clamp-3 text-[var(--los-fg)] opacity-90">
            {idea.summary}
          </p>
        )}
        {last && (
          <p class="text-[11px] text-[var(--los-muted)] line-clamp-2">
            <span class="text-[var(--los-accent)]">{last.author}</span>
            {' · '}
            {lastAt === null ? last.at : relativeTime(lastAt, now)}
            {' · '}
            <span class="text-[var(--los-fg)]">{last.text}</span>
          </p>
        )}
        <ActivityStrip card={card} now={now} />
      </button>
      {expanded && <IdeaDetails card={card} path={path} onSaved={onSaved} />}
    </article>
  );
};

export const IdeasPage = () => {
  const repo = githubProfileStore.currentRepo.value;
  const tree = githubFileStore.tree.value;
  const treeLoading =
    tree.length === 0 &&
    (githubFileStore.isLoading.value || githubFileStore.loadedRepo.value !== repo?.full_name);
  const items = useMemo(() => ideaTreeItems(tree), [tree]);
  const itemsKey = items.map((item) => `${item.path}@${item.sha}`).join('|');

  const [contents, setContents] = useState<Record<string, string>>({});
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [status, setStatus] = useState<IdeaStatus | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [query, setQuery] = useState('');
  const [product, setProduct] = useState('');
  const [sort, setSort] = useState<IdeaSort>('activity');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [skills, setSkills] = useState<'missing' | 'current' | 'updated' | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // Agents only follow the kh-ideas skill if the repo has it, so keep it current from here too.
  useEffect(() => {
    if (!repo) return;
    let cancelled = false;
    setSkills(null);
    setSetupError(null);
    syncKB(repo).then(
      (result) => !cancelled && setSkills(result),
      (error) => console.warn('Could not check the agent skills:', error),
    );
    return () => {
      cancelled = true;
    };
  }, [repo?.full_name]);

  // Direct navigation to /ideas: nothing has loaded the tree yet.
  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) githubFileStore.loadTree();
  }, []);

  useEffect(() => {
    if (!repo || items.length === 0) {
      setContents({});
      return;
    }
    let cancelled = false;
    setLoadingFiles(true);
    loadIdeaContents(repo.full_name, items).then((result) => {
      if (cancelled) return;
      setContents(result.contents);
      setLoadErrors(result.errors);
      setLoadingFiles(false);
    });
    return () => {
      cancelled = true;
    };
  }, [repo?.full_name, itemsKey]);

  const now = new Date();
  const cards = useMemo(
    () =>
      Object.entries(contents).flatMap(([path, text]) => {
        const slug = ideaSlugOf(path);
        return slug
          ? [{ path, card: toIdeaCard({ slug, idea: parseIdea(text) }, new Date()) }]
          : [];
      }),
    [contents],
  );
  const pathOf = useMemo(() => new Map(cards.map(({ path, card }) => [card.slug, path])), [cards]);
  const allCards = useMemo(() => cards.map(({ card }) => card), [cards]);
  const products = useMemo(() => ideaProducts(allCards), [allCards]);
  const matched = useMemo(
    () => matchIdeaCards(allCards, { query, product }),
    [allCards, query, product],
  );
  const counts = countByStatus(matched);
  const closedCount = matched.filter((c) => !isOpenStatus(c.idea.status)).length;
  // The open card stays visible even when an edit moves it out of the filter.
  const visible = new Set(visibleIdeaCards(matched, status, showClosed).map((c) => c.slug));
  const shown = sortIdeaCards(
    matched.filter((c) => visible.has(c.slug) || c.slug === expanded),
    sort,
  );

  const setUpSkills = async () => {
    if (!repo) return;
    setSettingUp(true);
    setSetupError(null);
    try {
      setSkills(await syncKB(repo, { install: true }));
    } catch (error) {
      setSetupError(error instanceof Error ? error.message : String(error));
    } finally {
      setSettingUp(false);
    }
  };

  const onSaved = (path: string, content: string) =>
    setContents((previous) => ({ ...previous, [path]: content }));

  let body: ComponentChildren;
  if (!repo) {
    body = <p class="text-xs text-[var(--los-muted)]">Select a repository in the app first.</p>;
  } else if (treeLoading || (loadingFiles && cards.length === 0)) {
    body = <p class="text-xs text-[var(--los-muted)] animate-pulse">Loading ideas…</p>;
  } else if (githubFileStore.error.value && tree.length === 0) {
    body = (
      <p class="text-xs text-[var(--idea-status-dropped)]">
        Could not load the repository: {githubFileStore.error.value}
      </p>
    );
  } else if (items.length === 0) {
    body = (
      <div class="max-w-lg flex flex-col gap-3 text-xs leading-relaxed">
        <p class="text-sm font-bold">No ideas yet</p>
        <p class="text-[var(--los-muted)]">
          Each idea is one file in <code>.kh/ideas/</code>. Capture one with the{' '}
          <button type="button" class="underline" onClick={() => route('/quick-idea')}>
            quick idea page
          </button>{' '}
          or from a terminal with <code>kaihuman idea "Offline sync for the palette"</code>. Agents
          with the kh-ideas skill add log entries and challenges as you work.
        </p>
      </div>
    );
  } else {
    body = (
      <div class="flex flex-col gap-4">
        <div class="flex flex-wrap items-center gap-2">
          {IDEA_STATUSES.map((s) => {
            const active = status === s;
            const closed = !OPEN_IDEA_STATUSES.includes(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => setStatus(active ? null : s)}
                class={`flex items-center gap-1.5 px-2 py-1 text-[11px] border ${
                  closed && !showClosed && !active ? 'opacity-60' : ''
                }`}
                style={{
                  borderColor: active ? statusColor(s) : tint(s, 45),
                  background: active ? tint(s, 25) : 'transparent',
                  color: statusColor(s),
                }}
              >
                {s} <span class="font-bold">{counts[s]}</span>
              </button>
            );
          })}
          <label class="flex items-center gap-1.5 text-[11px] text-[var(--los-muted)] ml-1">
            <input
              type="checkbox"
              checked={showClosed}
              onChange={(e) => setShowClosed(e.currentTarget.checked)}
            />
            show closed ({closedCount})
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <input
            type="search"
            class={`${inputClass} flex-1 min-w-[12rem]`}
            placeholder="Filter by words in slug, title, product, tags"
            aria-label="Filter ideas"
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
          {products.length > 0 && (
            <select
              class={inputClass}
              aria-label="Product"
              value={product}
              onChange={(e) => setProduct(e.currentTarget.value)}
            >
              <option value="">all products</option>
              {products.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
          <select
            class={inputClass}
            aria-label="Sort"
            value={sort}
            onChange={(e) => setSort(e.currentTarget.value as IdeaSort)}
          >
            {IDEA_SORTS.map((s) => (
              <option key={s} value={s}>
                sort: {s}
              </option>
            ))}
          </select>
        </div>
        <Legend />
        {loadErrors.length > 0 && (
          <p class="text-[11px] text-[var(--idea-status-dropped)]">
            Could not read {loadErrors.length} file(s): {loadErrors.join('; ')}
          </p>
        )}
        {shown.length === 0 ? (
          <p class="text-xs text-[var(--los-muted)]">
            No ideas match.{' '}
            {closedCount > 0 && !showClosed && !status && 'Closed ideas are hidden.'}
          </p>
        ) : (
          <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
            {shown.map((card) => {
              const path = pathOf.get(card.slug) ?? '';
              return (
                <IdeaCardView
                  key={card.slug}
                  card={card}
                  path={path}
                  now={now}
                  expanded={expanded === card.slug}
                  onToggle={() => setExpanded(expanded === card.slug ? null : card.slug)}
                  onSaved={onSaved}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <div class="h-[calc(100vh-2rem)] w-screen flex flex-col bg-[var(--los-bg)] text-[var(--los-fg)] font-mono">
        <div class="h-14 border-b border-[var(--los-border)] flex items-center gap-4 px-4 sm:px-6 shrink-0">
          <button
            type="button"
            onClick={() => route('/')}
            class="flex items-center gap-1.5 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
          >
            <ArrowLeft size={14} />
            <span class="text-xs font-mono">BACK</span>
          </button>
          <div class="h-4 w-px bg-[var(--los-border)]" />
          <span class="text-sm font-mono font-bold tracking-widest text-[var(--los-accent)]">
            IDEAS
          </span>
          <span class="hidden sm:inline text-[10px] font-mono text-[var(--los-muted)] opacity-60">
            .kh/ideas/
          </span>
          <button
            type="button"
            onClick={() => route('/quick-idea')}
            class="ml-auto flex items-center gap-1 px-2 py-1 border border-[var(--los-border)] text-xs hover:border-[var(--los-accent)]"
          >
            <Plus size={12} /> New idea
          </button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 sm:p-6">
          {skills === 'missing' && (
            <div class="mb-4 flex flex-col gap-1 text-xs text-[var(--los-muted)]">
              <p>
                Agents can't see the kh-ideas skill in this repo yet.{' '}
                <button
                  type="button"
                  class="underline disabled:opacity-50"
                  disabled={settingUp}
                  onClick={setUpSkills}
                >
                  {settingUp ? 'Setting up…' : 'Set up agent skills'}
                </button>{' '}
                to add it, with <code>.kh/</code>, the kb commands and a kaihuman section in
                CLAUDE.md / AGENTS.md, in one commit.
              </p>
              {setupError && (
                <p class="text-[var(--idea-status-dropped)]">
                  Set-up failed, nothing was written: {setupError}
                </p>
              )}
            </div>
          )}
          {skills === 'updated' && (
            <p class="mb-4 text-xs text-[var(--los-muted)]">
              Agent skills and the kaihuman section of CLAUDE.md / AGENTS.md were updated.
            </p>
          )}
          {body}
        </div>
      </div>
      <StatusBar
        mode="IDEAS"
        onDashboardClick={() => route('/')}
        onFilesClick={() => route('/')}
        onBoardClick={() => route('/board')}
      />
    </>
  );
};
