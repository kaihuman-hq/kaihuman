import { cancelTimer, type Slug, startTimer } from '@kaihuman/formats/business';
import { useEffect, useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { useBusinessRepo } from '../../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../../lib/business/write';
import { PRIMARY_MD, SECONDARY_MD } from './buttons';
import { Card } from './Card';
import { INPUT } from './FormField';

const TICK_MS = 30_000;

/** `H:MM` since `startedAt`; a clock set back never shows a negative time. */
export function elapsed(startedAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * Start, stop or cancel the repo's one running timer. With `client` the client is fixed;
 * a timer running for another client is still shown, because there is only one.
 */
export function TimerCard({ client }: { client?: Slug }) {
  const state = useBusinessRepo();
  const [picked, setPicked] = useState('');
  const [project, setProject] = useState('');
  const [note, setNote] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);

  const running = state.status === 'ready' && state.data.timer !== null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  if (state.status !== 'ready') return null;
  const { repo, data } = state;
  const timer = data.timer;

  async function run(
    build: (repo: typeof data) => ReturnType<typeof startTimer>,
    after?: () => void,
  ): Promise<boolean> {
    if (submitting.current) return false;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await writeBusiness(repo, async (fresh) => build(fresh.repo));
      if (!result.ok) {
        setError(result.issues[0]?.message ?? 'Nothing was saved.');
        return false;
      }
      after?.();
      return true;
    } catch (e) {
      setError(writeErrorMessage(e));
      return false;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (timer) {
    const cancel = () =>
      run(
        (fresh) =>
          fresh.timer
            ? cancelTimer(fresh)
            : { ok: false, issues: [{ path: 'timer', message: 'No timer is running.' }] },
        () => setConfirming(false),
      );
    return (
      <Card title="Timer">
        <p class="text-sm" data-testid="timer-running">
          Running for {timer.client} · {elapsed(timer.started_at, now)}
        </p>
        {timer.note && <p class="text-xs text-[var(--los-muted)] break-words">{timer.note}</p>}
        {confirming ? (
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <span class="text-xs">Discard this timer without logging time?</span>
            <button type="button" class={SECONDARY_MD} disabled={busy} onClick={cancel}>
              Yes, cancel timer
            </button>
            <button
              type="button"
              class={SECONDARY_MD}
              disabled={busy}
              onClick={() => setConfirming(false)}
            >
              Keep running
            </button>
          </div>
        ) : (
          <div class="mt-2 flex gap-2">
            <button
              type="button"
              class={PRIMARY_MD}
              onClick={() => route('/business/time/new?from=timer')}
            >
              Stop…
            </button>
            <button type="button" class={SECONDARY_MD} onClick={() => setConfirming(true)}>
              Cancel
            </button>
          </div>
        )}
        {error && (
          <p role="alert" class="mt-2 text-xs text-[var(--los-warning)]">
            {error}
          </p>
        )}
      </Card>
    );
  }

  const chosen = client ?? picked;
  const projects = data.projects.filter((p) => p.client === chosen && p.status === 'active');
  const start = (e: Event) => {
    e.preventDefault();
    run((fresh) =>
      startTimer(
        fresh,
        { client: chosen, ...(project ? { project } : {}), ...(note ? { note } : {}) },
        new Date(),
      ),
    ).then((saved) => {
      if (saved) setNote('');
    });
  };
  return (
    <Card title="Timer">
      <form onSubmit={start} class="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end" noValidate>
        <div>
          <label for="timer-client" class="block text-xs text-[var(--los-fg-dim)] mb-1">
            Client
          </label>
          <select
            id="timer-client"
            class={INPUT}
            value={chosen}
            disabled={busy || client !== undefined}
            onChange={(e) => {
              setPicked((e.target as HTMLSelectElement).value);
              setProject('');
            }}
          >
            {client === undefined && <option value="">Choose…</option>}
            {data.clients.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label for="timer-project" class="block text-xs text-[var(--los-fg-dim)] mb-1">
            Project (optional)
          </label>
          <select
            id="timer-project"
            class={INPUT}
            value={project}
            disabled={busy || projects.length === 0}
            onChange={(e) => setProject((e.target as HTMLSelectElement).value)}
          >
            <option value="">None</option>
            {projects.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label for="timer-note" class="block text-xs text-[var(--los-fg-dim)] mb-1">
            Note (optional)
          </label>
          <input
            id="timer-note"
            type="text"
            class={INPUT}
            value={note}
            disabled={busy}
            onInput={(e) => setNote((e.target as HTMLInputElement).value)}
          />
        </div>
        <button type="submit" class={PRIMARY_MD} disabled={busy || !chosen}>
          {busy ? 'Starting...' : 'Start'}
        </button>
      </form>
      {error && (
        <p role="alert" class="mt-2 text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </Card>
  );
}
