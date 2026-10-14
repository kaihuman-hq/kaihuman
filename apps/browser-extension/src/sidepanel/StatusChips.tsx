import type { PinnedStatus, WorkItemStatus } from '../background/work/types.js';

export const chip = 'border border-[#333] px-1.5 text-[11px] text-[#bbb] whitespace-nowrap';

const REVIEW = {
  approved: 'approved',
  changes_requested: 'changes requested',
  review_required: 'review requested',
} as const;
const CI = { success: 'CI ✓', failure: 'CI ✗', pending: 'CI ●' } as const;

/** Review, CI and merge-state chips for a PR or issue; shared by the inbox and the streams. */
export function StatusChips({
  status,
  unread,
}: {
  status: WorkItemStatus | PinnedStatus | undefined;
  unread: boolean;
}) {
  const labels: string[] = [];
  if (status && 'error' in status) {
    labels.push(status.error === 'forbidden' ? 'no access' : 'not found');
  } else if (status) {
    if (status.isDraft) labels.push('draft');
    if (status.review) labels.push(REVIEW[status.review]);
    if (status.ci) labels.push(CI[status.ci]);
    if (status.conflict) labels.push('conflict');
  }
  if (unread) labels.push('• new');
  return (
    <>
      {labels.map((label) => (
        <span key={label} class={chip}>
          {label}
        </span>
      ))}
    </>
  );
}
