import { type IdeaSlug, parseIdea } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_WEEKS,
  activitySummary,
  countByStatus,
  ideaProducts,
  matchIdeaCards,
  relativeTime,
  sortIdeaCards,
  statusColor,
  toIdeaCard,
  visibleIdeaCards,
  weeklyActivity,
  weekShade,
} from './ideas-overview';

const NOW = new Date(2026, 9, 13, 12, 0);

interface Spec {
  slug: string;
  title?: string;
  status?: string;
  product?: string;
  tags?: string;
  created?: string;
  log?: string[];
  challenges?: string[];
}

const card = ({ slug, title, status, product, tags, created, log = [], challenges = [] }: Spec) =>
  toIdeaCard(
    {
      slug: slug as IdeaSlug,
      idea: parseIdea(
        [
          '---',
          `title: ${title ?? slug}`,
          `status: ${status ?? 'seed'}`,
          ...(product ? [`product: ${product}`] : []),
          ...(tags ? [`tags: [${tags}]`] : []),
          ...(created ? [`created: ${created}`] : []),
          '---',
          '',
          `# ${title ?? slug}`,
          '',
          '## Log',
          '',
          ...log.map((at) => `- ${at} · human · Did something.`),
          '',
          '## Challenges',
          '',
          ...challenges,
          '',
        ].join('\n'),
      ),
    },
    NOW,
  );

describe('weeklyActivity', () => {
  it('buckets log entries into 7-day windows, oldest first', () => {
    const { idea } = card({
      slug: 'a',
      log: ['2026-10-13 09:00', '2026-10-10 09:00', '2026-10-05 12:00', '2026-07-01 10:00'],
    });
    const weeks = weeklyActivity(idea, NOW);
    expect(weeks).toHaveLength(ACTIVITY_WEEKS);
    expect(weeks[ACTIVITY_WEEKS - 1]).toBe(2);
    expect(weeks[ACTIVITY_WEEKS - 2]).toBe(1);
    // July is more than 12 weeks back, so it falls off the strip.
    expect(weeks.reduce((sum, n) => sum + n, 0)).toBe(3);
  });

  it('counts an entry slightly in the future as this week and skips unreadable times', () => {
    const { idea } = card({ slug: 'a', log: ['2026-10-13 12:30'] });
    idea.log.push({ at: 'yesterday', author: 'human', text: 'x' });
    expect(weeklyActivity(idea, NOW).at(-1)).toBe(1);
  });

  it('is all zeros for an idea without log entries', () => {
    expect(weeklyActivity(card({ slug: 'a' }).idea, NOW)).toEqual(
      new Array(ACTIVITY_WEEKS).fill(0),
    );
  });
});

describe('toIdeaCard', () => {
  it('counts only open challenges and reads the created time', () => {
    const c = card({
      slug: 'a',
      created: '2026-01-02T10:00+01:00',
      challenges: ['- [ ] Open one', '- [x] Done one', '- [ ] Open two'],
    });
    expect(c.openChallenges).toBe(2);
    expect(c.createdAt).toBe(Date.parse('2026-01-02T10:00+01:00'));
    expect(card({ slug: 'b' }).createdAt).toBeNull();
  });
});

describe('sortIdeaCards', () => {
  const cards = [
    card({
      slug: 'shipped-new',
      title: 'Alpha',
      status: 'shipped',
      log: ['2026-10-13 10:00'],
      created: '2026-10-01T10:00+00:00',
    }),
    card({
      slug: 'old',
      title: 'Charlie',
      log: ['2026-05-01 10:00'],
      created: '2026-09-01T10:00+00:00',
    }),
    card({ slug: 'never', title: 'bravo' }),
    card({
      slug: 'recent',
      title: 'Delta',
      status: 'exploring',
      log: ['2026-10-12 10:00'],
      created: '2025-01-01T10:00+00:00',
    }),
  ];
  const slugs = (sorted: ReturnType<typeof sortIdeaCards>) => sorted.map((c) => c.slug);

  it('puts open ideas first, then the most recent activity, never-active last', () => {
    expect(slugs(sortIdeaCards(cards, 'activity'))).toEqual([
      'recent',
      'old',
      'never',
      'shipped-new',
    ]);
  });

  it('sorts by created time, newest first', () => {
    expect(slugs(sortIdeaCards(cards, 'created'))).toEqual([
      'old',
      'recent',
      'never',
      'shipped-new',
    ]);
  });

  it('sorts by title, ignoring case', () => {
    expect(slugs(sortIdeaCards(cards, 'title'))).toEqual(['never', 'old', 'recent', 'shipped-new']);
  });
});

describe('filtering', () => {
  const cards = [
    card({ slug: 'palette-sync', title: 'Offline sync', product: 'kaihuman', tags: 'sync' }),
    card({ slug: 'voice', title: 'Voice capture', status: 'parked' }),
    card({ slug: 'garden', title: 'Garden planner', product: 'garden', status: 'exploring' }),
  ];

  it('matches text with findIdeas and narrows by product', () => {
    expect(matchIdeaCards(cards, { query: 'sync', product: '' }).map((c) => c.slug)).toEqual([
      'palette-sync',
    ]);
    expect(matchIdeaCards(cards, { query: '', product: 'garden' }).map((c) => c.slug)).toEqual([
      'garden',
    ]);
    expect(matchIdeaCards(cards, { query: 'voice', product: 'garden' })).toEqual([]);
  });

  it('hides closed statuses unless asked, and a picked status shows exactly that status', () => {
    expect(visibleIdeaCards(cards, null, false).map((c) => c.slug)).toEqual([
      'palette-sync',
      'garden',
    ]);
    expect(visibleIdeaCards(cards, null, true)).toHaveLength(3);
    expect(visibleIdeaCards(cards, 'parked', false).map((c) => c.slug)).toEqual(['voice']);
  });

  it('counts every status and lists products', () => {
    expect(countByStatus(cards)).toEqual({
      seed: 1,
      exploring: 1,
      committed: 0,
      shipped: 0,
      parked: 1,
      dropped: 0,
    });
    expect(ideaProducts(cards)).toEqual(['garden', 'kaihuman']);
  });
});

describe('presentation', () => {
  it('maps each status to its own CSS variable', () => {
    expect(statusColor('committed')).toBe('var(--idea-status-committed)');
  });

  it('shades weeks on a fixed scale', () => {
    expect([0, 1, 2, 3, 4, 5, 20].map(weekShade)).toEqual([0, 1, 2, 3, 3, 4, 4]);
  });

  it('formats relative times', () => {
    const ago = (ms: number) => relativeTime(NOW.getTime() - ms, NOW);
    expect(ago(10_000)).toBe('just now');
    expect(ago(5 * 60_000)).toBe('5 min ago');
    expect(ago(2 * 3_600_000)).toBe('2 h ago');
    expect(ago(3 * 86_400_000)).toBe('3 d ago');
    expect(ago(21 * 86_400_000)).toBe('3 w ago');
    expect(ago(150 * 86_400_000)).toBe('5 mo ago');
    expect(ago(800 * 86_400_000)).toBe('2 y ago');
  });

  it('summarises activity, and says so when there is none', () => {
    const active = card({ slug: 'a', log: ['2026-10-13 10:00', '2026-08-01 10:00'] });
    expect(activitySummary(active.activity, NOW)).toBe('1 in 30 d · 2 total · 2 h ago');
    const idle = card({ slug: 'b' });
    expect(activitySummary(idle.activity, NOW)).toBe('no activity yet');
  });
});
