import { buildInbox, workSummary } from '../background/work/inbox';
import { useOpenSidePanel } from '../sidepanel/open-panel';
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

/** What waits on the user in GitHub; a click opens the side panel where it is worked through. */
export function WorkCard() {
  const { snapshot, streams, file, dismissed } = useWorkState();
  // Opened from the click itself: the worker cannot open the panel on the page's behalf.
  const openSidePanel = useOpenSidePanel();
  // Signed in as the side panel decides it: the worker polls with a work token alone.
  const signedIn = snapshot ? snapshot.problem?.kind !== 'signed-out' : streams !== undefined;
  if (!signedIn) return null;

  const summary = snapshot
    ? workSummary(snapshot, file, dismissed)
    : { waiting: 0, activity: 0, redCiInStreams: 0 };
  const parts = [
    summary.waiting > 0 && `${summary.waiting} waiting on you`,
    summary.activity > 0 && `${summary.activity} new`,
    summary.redCiInStreams > 0 && `${summary.redCiInStreams} red CI in streams`,
  ].filter(Boolean);

  // The card stays when nothing is waiting: it is the start page's way into the panel.
  const headline =
    parts.length > 0
      ? parts.join(' · ')
      : snapshot?.problem?.kind === 'auth'
        ? 'GitHub refused the token — open the side panel.'
        : 'Nothing waiting — open work panel';
  const rows = snapshot ? buildInbox(snapshot, file, dismissed).waiting.slice(0, SHOWN_ROWS) : [];
  return (
    <section class="flex flex-col gap-[10px]">
      <SectionHead title="Work" />
      <button
        type="button"
        aria-label="Open work in the side panel"
        onClick={openSidePanel}
        class="w-full flex flex-col gap-2 border border-nt-pin p-[14px] text-left hover:border-nt-accent hover:bg-nt-pin-hover"
      >
        <span class="text-[13px]">{headline}</span>
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
