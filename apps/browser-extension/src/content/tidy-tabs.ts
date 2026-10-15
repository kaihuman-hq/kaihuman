/** The palette's "Tidy open tabs": one action per proposed group, each with its own three choices. */
import { newItemId } from '@kaihuman/formats';
import type { PaletteAction } from '@kaihuman/palette';
import type { TabProposal, TidyTab } from '../background/ai/tidy';

interface Deps {
  send: (message: any) => Promise<any>;
}

interface Tidy {
  tabs: TidyTab[];
  proposals: TabProposal[];
  streams: { id: string; name: string }[];
}

const plural = (count: number) => `${count} tab${count === 1 ? '' : 's'}`;

function proposalAction(
  { send }: Deps,
  tidy: Tidy,
  proposal: TabProposal,
  n: number,
): PaletteAction {
  const tabs = proposal.tabIds.flatMap((id) => tidy.tabs.find((tab) => tab.id === id) ?? []);
  const id = `tidy-tabs:${n}`;
  return {
    id,
    title: proposal.name,
    subtitle: plural(tabs.length),
    recent: false,
    children: async () => [
      {
        id: `${id}:save`,
        title: 'Save as pinned-tab group',
        recent: false,
        run: async () => {
          const { count, name } = await send({
            type: 'SAVE_PINNED_TAB_GROUP',
            name: proposal.name,
            tabs: tabs.map(({ url, title }) => ({ url, title })),
          });
          return `Saved ${name} with ${plural(count)}`;
        },
      },
      {
        id: `${id}:pin`,
        title: 'Pin all to stream…',
        recent: false,
        children: async () =>
          tidy.streams.length
            ? tidy.streams.map((stream) => ({
                id: `${id}:pin:${stream.id}`,
                title: stream.name,
                recent: false as const,
                run: async () => {
                  const at = new Date().toISOString();
                  await send({
                    type: 'WORK_OPS',
                    ops: tabs.map((tab) => ({
                      op: 'pin' as const,
                      streamId: stream.id,
                      itemId: newItemId(),
                      url: tab.url,
                      title: tab.title,
                      labels: [],
                      at,
                    })),
                  });
                  return `Pinned ${plural(tabs.length)} to ${stream.name}`;
                },
              }))
            : [
                {
                  id: `${id}:pin:none`,
                  title: 'There are no streams yet',
                  recent: false as const,
                  run: async () => 'Create a stream in the work panel first',
                },
              ],
      },
      {
        id: `${id}:close`,
        title: 'Close these tabs',
        recent: false,
        run: async () => {
          // The user's own pick: the only place tidy closes anything.
          await send({ type: 'TIDY_CLOSE_TABS', tabIds: tabs.map((tab) => tab.id) });
          return `Closed ${plural(tabs.length)}`;
        },
      },
    ],
  };
}

export function tidyTabsAction(deps: Deps): PaletteAction {
  return {
    id: 'tidy-tabs',
    title: 'Tidy open tabs',
    subtitle: 'Proposes groups for this window’s tabs, one at a time',
    recent: false,
    children: async () => {
      const tidy = (await deps.send({ type: 'TIDY_TABS' })) as Tidy;
      if (!tidy.proposals.length) {
        return [
          {
            id: 'tidy-tabs:none',
            title: 'Nothing to tidy: no tabs belong together yet',
            recent: false as const,
            run: async () => 'Nothing to tidy',
          },
        ];
      }
      return tidy.proposals.map((proposal, n) => proposalAction(deps, tidy, proposal, n));
    },
  };
}
