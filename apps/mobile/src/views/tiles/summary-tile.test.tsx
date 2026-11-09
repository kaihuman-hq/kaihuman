import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { TileView } from '../../components/widgets/tile-controllers.js';
import { SummaryTile } from './summary-tile.js';

afterEach(cleanup);

const rss: TileView = {
  kind: 'rss',
  view: {
    feeds: [],
    unreadCount: 1,
    items: [
      { feedId: 'f', key: 'a', title: 'Fresh', link: '', source: 's', date: null, unread: true },
      { feedId: 'f', key: 'b', title: 'Old', link: '', source: 's', date: null, unread: false },
    ],
  },
};

describe('SummaryTile for RSS', () => {
  it('lists unread items first and toggles to all', () => {
    render(<SummaryTile path="a.rss.json" tile={rss} now={new Date()} onSeeAll={() => {}} />);
    expect(screen.getByText('Fresh')).toBeTruthy();
    expect(screen.queryByText('Old')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByText('Old')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.queryByText('Old')).toBeNull();
  });
});
