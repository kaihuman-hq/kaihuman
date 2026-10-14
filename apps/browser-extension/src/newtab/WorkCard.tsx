import { buildInbox, workSummary } from '../background/work/inbox';
import { useWorkState } from '../sidepanel/useWorkState';
import { SectionHead } from './Today';

const REASON_LABELS: Record<string, string> = {
  'review-requested': 'review requested',
  assigned: 'assigned',
  failing: 'CI failing',
  'changes-requested': 'changes requested',
  'ready-to-merge': 'ready to merge',
};

const SHOWN_ROWS = 3;

// Called straight from the click: `sidePanel.open` only works inside the user gesture, so the
// worker cannot do it on the page's behalf.
const openSidePanel = async () => {
  const { id: windowId } = await chrome.windows.getCurrent();
  if (windowId !== undefined) await chrome.sidePanel.open({ windowId });
};

/** What waits on the user in GitHub; a click opens the side panel where it is worked through. */
export function WorkCard() {
  const { snapshot, streams, dismissed } = useWorkState();
  if (!snapshot || snapshot.problem?.kind === 'signed-out') return null;

  const file = streams?.state.ok ? streams.state.file : null;
  const summary = workSummary(snapshot, file, dismissed);
  const parts = [
    summary.waiting > 0 && `${summary.waiting} waiting on you`,
    summary.activity > 0 && `${summary.activity} new`,
    summary.redCiInStreams > 0 && `${summary.redCiInStreams} red CI in streams`,
  ].filter(Boolean);

  if (parts.length === 0) {
    if (snapshot.problem?.kind !== 'auth') return null;
    return <p class="text-[13px] text-nt-muted">GitHub refused the token — open the side panel.</p>;
  }

  const rows = buildInbox(snapshot, file, dismissed).waiting.slice(0, SHOWN_ROWS);
  return (
    <section class="flex flex-col gap-[10px]">
      <SectionHead title="Work" />
      <button
        type="button"
        aria-label="Open work in the side panel"
        onClick={() => void openSidePanel()}
        class="w-full flex flex-col gap-2 border border-nt-pin p-[14px] text-left hover:border-nt-accent hover:bg-nt-pin-hover"
      >
        <span class="text-[13px]">{parts.join(' · ')}</span>
        {rows.map((row) => (
          <span key={row.key} class="flex items-baseline justify-between gap-3 text-[12px]">
            <span class="truncate">{row.title}</span>
            <span class="shrink-0 text-nt-muted">
              {REASON_LABELS[row.reasons[0] ?? ''] ?? row.reasons[0]}
            </span>
          </span>
        ))}
      </button>
    </section>
  );
}
