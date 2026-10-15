import { newItemId } from '@kaihuman/formats';
import { useEffect, useState } from 'preact/hooks';
import type { TabProposal, TidyTab } from '../background/ai/tidy';
import { send } from '../palette/port';

interface Loaded {
  tabs: TidyTab[];
  proposals: TabProposal[];
  streams: { id: string; name: string }[];
}

const plural = (count: number) => `${count} tab${count === 1 ? '' : 's'}`;

const button =
  'py-1 px-2 border border-[var(--los-border)] text-[10px] rounded transition-colors hover:border-[var(--los-accent)] hover:text-[var(--los-accent)] disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * The popup's "Tidy open tabs": one proposed group at a time. Every action is the user's own
 * click, and the tabs are closed only by "Close these tabs".
 */
export function TidyTabs({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [index, setIndex] = useState(0);
  const [choosingStream, setChoosingStream] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    send({ type: 'TIDY_TABS' }).then(
      (response) => setLoaded(response as Loaded),
      (e: Error) => setError(e.message),
    );
  }, []);

  const proposal = loaded?.proposals[index];
  const tabs = proposal
    ? proposal.tabIds.flatMap((id) => loaded?.tabs.find((tab) => tab.id === id) ?? [])
    : [];

  const next = () => {
    setChoosingStream(false);
    setIndex((current) => current + 1);
  };

  const act = async (work: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    try {
      setMessage(await work());
      next();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveGroup = () =>
    act(async () => {
      const { count, name } = await send({
        type: 'SAVE_PINNED_TAB_GROUP',
        name: proposal?.name,
        tabs: tabs.map(({ url, title }) => ({ url, title })),
      });
      return `Saved ${name} with ${plural(count)}`;
    });

  const pinToStream = (streamId: string, streamName: string) =>
    act(async () => {
      const at = new Date().toISOString();
      await send({
        type: 'WORK_OPS',
        ops: tabs.map((tab) => ({
          op: 'pin' as const,
          streamId,
          itemId: newItemId(),
          url: tab.url,
          title: tab.title,
          labels: [],
          at,
        })),
      });
      return `Pinned ${plural(tabs.length)} to ${streamName}`;
    });

  const closeTabs = () =>
    act(async () => {
      await send({ type: 'TIDY_CLOSE_TABS', tabIds: tabs.map((tab) => tab.id) });
      return `Closed ${plural(tabs.length)}`;
    });

  return (
    <section class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-sm font-bold text-[var(--los-fg-dim)]">Tidy open tabs</h2>
        <button type="button" onClick={onClose} class={button}>
          Back
        </button>
      </div>

      {!loaded && !error && (
        <p class="text-[10px] text-[var(--los-fg-dim)]">Looking at your tabs…</p>
      )}

      {loaded && proposal && (
        <div class="space-y-2">
          <p class="text-[10px] text-[var(--los-fg-dim)]">
            Group {index + 1} of {loaded.proposals.length}
          </p>
          <div class="p-2 rounded border border-[var(--los-border)] bg-[var(--los-bg-hover)] space-y-1">
            <div class="text-xs font-bold text-[var(--los-accent)] truncate">{proposal.name}</div>
            <ul class="space-y-0.5">
              {tabs.map((tab) => (
                <li key={tab.id} class="text-[10px] truncate" title={tab.url}>
                  {tab.title}
                </li>
              ))}
            </ul>
          </div>

          {choosingStream ? (
            <div class="space-y-1">
              <p class="text-[10px] text-[var(--los-fg-dim)]">Pin all to which stream?</p>
              {loaded.streams.length === 0 && (
                <p class="text-[10px] text-[var(--los-fg-dim)]">There are no streams yet.</p>
              )}
              <div class="flex flex-wrap gap-1">
                {loaded.streams.map((stream) => (
                  <button
                    key={stream.id}
                    type="button"
                    disabled={busy}
                    onClick={() => pinToStream(stream.id, stream.name)}
                    class={button}
                  >
                    {stream.name}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setChoosingStream(false)}
                  class={button}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div class="flex flex-wrap gap-1">
              <button type="button" disabled={busy} onClick={saveGroup} class={button}>
                Save as pinned-tab group
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setChoosingStream(true)}
                class={button}
              >
                Pin all to stream…
              </button>
              <button type="button" disabled={busy} onClick={closeTabs} class={button}>
                Close these tabs
              </button>
              <button type="button" disabled={busy} onClick={next} class={button}>
                Skip
              </button>
            </div>
          )}
        </div>
      )}

      {loaded && !proposal && (
        <p class="text-[10px] text-[var(--los-fg-dim)]">
          {loaded.proposals.length === 0
            ? 'Nothing to tidy: no tabs belong together yet.'
            : 'That was the last group.'}
        </p>
      )}

      {error ? (
        <div class="text-[10px] text-red-400 p-2 bg-red-950/30 rounded border border-red-900/50 break-words">
          {error}
        </div>
      ) : (
        message && <div class="text-[10px] text-[var(--los-success)]">{message}</div>
      )}
    </section>
  );
}
