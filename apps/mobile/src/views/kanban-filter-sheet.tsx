import {
  DUE_FILTER_LABELS,
  type DueFilter,
  type Milestone,
  type StreamMode,
  type StreamSort,
  type TodoStatus,
} from '@kaihuman/formats';
import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import type { BoardFilter } from '../screens/kanban-board.js';
import { useTheme } from '../theme/theme.js';
import { Button, Chip, Text } from '../ui/index.js';

export type BoardView = 'board' | 'streams';

/** Everything the sheet edits, kept apart from the search text which lives in the header. */
export interface BoardOptions {
  due: DueFilter;
  sort: 'newest' | 'due';
  milestoneId?: string;
  upcoming: boolean;
  files: readonly string[];
  streamMode: StreamMode;
  streamSort: StreamSort;
  /** Per-column "last two weeks" limit; finished columns start limited, like the console. */
  recent: Record<TodoStatus, boolean>;
}

export const DEFAULT_OPTIONS: BoardOptions = {
  due: 'all',
  sort: 'newest',
  upcoming: false,
  files: [],
  streamMode: 'active',
  streamSort: 'count',
  recent: { backlog: false, 'in-progress': false, done: true, rejected: true },
};

/** How many non-default choices are active, for the badge on the filter button. */
export const activeOptionCount = (o: BoardOptions, view: BoardView, tag?: string): number =>
  (tag ? 1 : 0) +
  (o.files.length > 0 ? 1 : 0) +
  (view === 'board'
    ? (o.due !== 'all' ? 1 : 0) +
      (o.sort !== 'newest' ? 1 : 0) +
      (o.milestoneId ? 1 : 0) +
      (o.upcoming ? 1 : 0)
    : (o.streamMode !== 'active' ? 1 : 0) + (o.streamSort !== 'count' ? 1 : 0));

export const toBoardFilter = (o: BoardOptions, search: string, tag?: string): BoardFilter => ({
  search,
  due: o.due,
  sort: o.sort,
  upcoming: o.upcoming,
  files: o.files,
  recent: o.recent,
  ...(tag && { tag }),
  ...(o.milestoneId && { milestoneId: o.milestoneId }),
});

function Group({ title, children }: { title: string; children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="footnote" tone="secondary">
        {title}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>
    </View>
  );
}

const fileName = (path: string) =>
  path
    .split('/')
    .pop()
    ?.replace(/\.todos\.md$/, '') ?? path;

/** Bottom sheet with the board's sort and filter chips; changes apply live. */
export function KanbanFilterSheet({
  view,
  options,
  onChange,
  milestones,
  upcoming,
  paths,
  onClose,
}: {
  view: BoardView;
  options: BoardOptions;
  onChange: (next: BoardOptions) => void;
  milestones: readonly Milestone[];
  upcoming: Milestone | undefined;
  paths: readonly string[];
  onClose: () => void;
}) {
  const { colors, spacing, shape } = useTheme();
  const set = (patch: Partial<BoardOptions>) => onChange({ ...options, ...patch });
  const toggleFile = (path: string) =>
    set({
      files: options.files.includes(path)
        ? options.files.filter((p) => p !== path)
        : [...options.files, path],
    });
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }}
      >
        {/* Swallows presses so taps inside the sheet do not dismiss it. */}
        <Pressable
          accessible={false}
          style={{
            backgroundColor: colors.surface,
            padding: spacing.lg,
            gap: spacing.lg,
            maxHeight: '80%',
            borderTopLeftRadius: shape.lg,
            borderTopRightRadius: shape.lg,
          }}
        >
          <Text variant="headline">{view === 'board' ? 'Sort & filter' : 'Streams'}</Text>
          <ScrollView contentContainerStyle={{ gap: spacing.lg }}>
            {view === 'board' ? (
              <>
                <Group title="Sort">
                  <Chip
                    label="Newest"
                    selected={options.sort === 'newest'}
                    onPress={() => set({ sort: 'newest' })}
                  />
                  <Chip
                    label="Due date"
                    selected={options.sort === 'due'}
                    onPress={() => set({ sort: 'due' })}
                  />
                </Group>
                <Group title="Due">
                  {(Object.keys(DUE_FILTER_LABELS) as DueFilter[]).map((f) => (
                    <Chip
                      key={f}
                      label={DUE_FILTER_LABELS[f]}
                      selected={options.due === f}
                      onPress={() => set({ due: f })}
                    />
                  ))}
                </Group>
                {milestones.length > 0 ? (
                  <Group title="Milestone">
                    {upcoming ? (
                      <Chip
                        label={`Upcoming: ${upcoming.name}`}
                        icon="calendar"
                        selected={options.upcoming}
                        onPress={() => set({ upcoming: !options.upcoming, milestoneId: undefined })}
                      />
                    ) : null}
                    <Chip
                      label="All milestones"
                      selected={!options.milestoneId && !options.upcoming}
                      onPress={() => set({ milestoneId: undefined, upcoming: false })}
                    />
                    {milestones.map((m) => (
                      <Chip
                        key={m.id}
                        label={`!${m.id}${m.dueDate ? ` · ${m.dueDate}` : ''}`}
                        selected={options.milestoneId === m.id}
                        onPress={() =>
                          set({
                            milestoneId: options.milestoneId === m.id ? undefined : m.id,
                            upcoming: false,
                          })
                        }
                      />
                    ))}
                  </Group>
                ) : null}
              </>
            ) : (
              <>
                <Group title="Show">
                  <Chip
                    label="Active"
                    selected={options.streamMode === 'active'}
                    onPress={() => set({ streamMode: 'active' })}
                  />
                  <Chip
                    label="Closed"
                    selected={options.streamMode === 'closed'}
                    onPress={() => set({ streamMode: 'closed' })}
                  />
                </Group>
                <Group title="Sort streams">
                  <Chip
                    label="Most items"
                    selected={options.streamSort === 'count'}
                    onPress={() => set({ streamSort: 'count' })}
                  />
                  <Chip
                    label="Newest"
                    selected={options.streamSort === 'newest'}
                    onPress={() => set({ streamSort: 'newest' })}
                  />
                </Group>
              </>
            )}
            {paths.length > 1 ? (
              <Group title="Lists">
                {paths.map((p) => (
                  <Chip
                    key={p}
                    label={fileName(p)}
                    selected={options.files.includes(p)}
                    onPress={() => toggleFile(p)}
                  />
                ))}
              </Group>
            ) : null}
          </ScrollView>
          <View style={{ gap: spacing.sm }}>
            <Button
              label="Reset"
              testID="filter-reset"
              variant="tinted"
              fullWidth
              onPress={() => onChange(DEFAULT_OPTIONS)}
            />
            <Button label="Done" testID="filter-done" fullWidth onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
