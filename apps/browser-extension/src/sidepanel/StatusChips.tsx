import type { PinnedStatus, WorkItemStatus } from '../background/work/types.js';

/** How urgent a row looks: drives the rail on its left edge and the colour of its chips. */
export type Tone = 'bad' | 'warn' | 'good' | 'new' | 'plain';

const CHIP_TONE: Record<Tone, string> = {
  bad: 'border-nt-prod/50 text-nt-prod',
  warn: 'border-nt-int/50 text-nt-int',
  good: 'border-nt-done/60 text-nt-done',
  new: 'border-nt-accent/60 text-nt-accent',
  plain: 'border-nt-control text-nt-muted',
};

export const RAIL_TONE: Record<Tone, string> = {
  bad: 'bg-nt-prod',
  warn: 'bg-nt-int',
  good: 'bg-nt-done',
  new: 'bg-nt-accent',
  plain: 'bg-nt-divider',
};

export const chipClass = (tone: Tone = 'plain') =>
  `inline-flex shrink-0 items-center border px-1.5 text-[11px] leading-[18px] whitespace-nowrap ${CHIP_TONE[tone]}`;

/** Labels the user typed: always plain, and cut when long so one label cannot widen the row. */
// A block box, not the chips' inline-flex: text-overflow only cuts text in a block container.
export const labelChip = `inline-block max-w-[9rem] shrink-0 truncate border px-1.5 text-[11px] leading-[18px] ${CHIP_TONE.plain}`;

const REVIEW = {
  approved: ['approved', 'good'],
  changes_requested: ['changes requested', 'bad'],
  review_required: ['review requested', 'warn'],
} as const satisfies Record<string, readonly [string, Tone]>;
const CI = {
  success: ['CI ✓', 'good'],
  failure: ['CI ✗', 'bad'],
  pending: ['CI ●', 'warn'],
} as const satisfies Record<string, readonly [string, Tone]>;

type Chip = readonly [label: string, tone: Tone];

const chipsOf = (status: WorkItemStatus | PinnedStatus | undefined, unread: boolean): Chip[] => {
  const chips: Chip[] = [];
  if (status && 'error' in status) {
    chips.push([status.error === 'forbidden' ? 'no access' : 'not found', 'bad']);
  } else if (status) {
    if (status.state !== 'open') chips.push([status.state, 'plain']);
    if (status.isDraft) chips.push(['draft', 'plain']);
    if (status.review) chips.push(REVIEW[status.review]);
    if (status.ci) chips.push(CI[status.ci]);
    if (status.conflict) chips.push(['conflict', 'bad']);
  }
  if (unread) chips.push(['• new', 'new']);
  return chips;
};

const RANK: Tone[] = ['bad', 'warn', 'good', 'new', 'plain'];

/** The most urgent tone among a row's signals; a merged or closed item has nothing left to do. */
export function toneOf(
  status: WorkItemStatus | PinnedStatus | undefined,
  unread: boolean,
  extra: Tone[] = [],
): Tone {
  if (status && !('error' in status) && status.state !== 'open') return 'plain';
  const tones = [...chipsOf(status, unread).map(([, tone]) => tone), ...extra];
  return RANK.find((tone) => tones.includes(tone)) ?? 'plain';
}

/** Review, CI and merge-state chips for a PR or issue; shared by the inbox and the streams. */
export function StatusChips({
  status,
  unread,
}: {
  status: WorkItemStatus | PinnedStatus | undefined;
  unread: boolean;
}) {
  return (
    <>
      {chipsOf(status, unread).map(([label, tone]) => (
        <span key={label} class={chipClass(tone)}>
          {label}
        </span>
      ))}
    </>
  );
}

/** The coloured edge of a row: the one place the panel spends colour, so urgency reads at a glance. */
export function Rail({ tone }: { tone: Tone }) {
  return <span aria-hidden="true" data-tone={tone} class={`w-[2px] shrink-0 ${RAIL_TONE[tone]}`} />;
}
