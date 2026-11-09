import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Switch, View } from 'react-native';
import {
  BOARD_SCOPES,
  BOARD_TOGGLES,
  type BoardOverviewView,
  boardConfig,
  boardOverviewView,
  updateBoardConfig,
} from '../../components/widgets/board-overview-tile.js';
import { type ContentFiles, githubContentFiles } from '../../screens/file-editor-screen.js';
import { useTheme } from '../../theme/theme.js';
import { Badge, Button, haptics, SegmentedControl, Text, TextField } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { EmptyLine } from './parts.js';
import { TileSheet } from './tile-sheet.js';

/** The board tab: the one kanban board over every todo file. */
const BOARD_HREF = '/board';

const TODO_FILE = /\.todos\.md$/i;

/** Reads every `.todos.md` in the repository; null while loading. */
function useTodoFiles(files: ContentFiles): { path: string; content: string }[] | null {
  const [loaded, setLoaded] = useState<{ path: string; content: string }[] | null>(null);
  useEffect(() => {
    let live = true;
    const paths = files
      .tree()
      .filter((t) => t.type !== 'tree' && TODO_FILE.test(t.path))
      .map((t) => t.path);
    void Promise.all(
      paths.map((path) =>
        files.read(path).then(
          (content) => ({ path, content }),
          () => null,
        ),
      ),
    ).then((rows) => {
      if (live) setLoaded(rows.filter((r): r is { path: string; content: string } => r !== null));
    });
    return () => {
      live = false;
    };
  }, [files]);
  return loaded;
}

export function BoardOverview({
  view: initial,
  ctx,
  files = githubContentFiles,
}: {
  view: BoardOverviewView;
  ctx: Ctx;
  files?: ContentFiles;
}) {
  const { colors, spacing, shape } = useTheme();
  const router = useRouter();
  const [settings, setSettings] = useState(false);
  const todoFiles = useTodoFiles(files);
  const view: BoardOverviewView = useMemo(
    () => (todoFiles ? boardOverviewView(ctx.content, todoFiles, ctx.now) : initial),
    [todoFiles, ctx.content, ctx.now, initial],
  );
  const openBoard = () => {
    setSettings(false);
    router.push(BOARD_HREF);
  };
  if (!todoFiles) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Loading boards"
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <ActivityIndicator color={colors.secondaryLabel} />
        <Text variant="footnote" tone="secondary">
          Loading boards
        </Text>
      </View>
    );
  }
  return (
    <>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Open board"
        accessibilityHint="Opens the kanban board"
        testID="board-open"
        onPress={openBoard}
        style={{ gap: spacing.sm }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
            {`${view.files} ${view.files === 1 ? 'todo file' : 'todo files'}`}
          </Text>
          {view.overdueCount > 0 ? (
            <Badge tone="danger" label={`${view.overdueCount} overdue`} />
          ) : null}
        </View>
        {view.columns.length === 0 ? <EmptyLine>No columns selected.</EmptyLine> : null}
        {view.columns.map((c) => (
          <View
            key={c.status}
            testID={`board-col-${c.status}`}
            style={{
              backgroundColor: colors.fill,
              borderRadius: shape.md,
              padding: spacing.md,
              gap: spacing.xs,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="subheadline" weight="600" style={{ flex: 1 }}>
                {c.label}
              </Text>
              <Text variant="subheadline" mono tone="secondary">
                {c.count}
              </Text>
            </View>
            {c.items.slice(0, 3).map((i) => (
              <Text
                key={`${i.file}-${i.text}`}
                variant="footnote"
                tone={i.overdue ? 'danger' : 'secondary'}
                numberOfLines={1}
              >
                {i.text}
              </Text>
            ))}
            {c.count > 3 ? (
              <Text variant="caption2" tone="secondary">
                {`+${c.count - 3} more`}
              </Text>
            ) : null}
          </View>
        ))}
      </Pressable>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button label="Open board" icon="board" size="medium" onPress={openBoard} />
        <Button
          label="Board settings"
          icon="settings"
          size="medium"
          variant="tinted"
          onPress={() => setSettings(true)}
        />
      </View>
      {settings ? (
        <BoardSettingsSheet ctx={ctx} onClose={() => setSettings(false)} onOpenBoard={openBoard} />
      ) : null}
    </>
  );
}

/** Whole-number field that commits as soon as the text is valid, like the web input. */
function DaysField({
  label,
  value,
  min,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const parsed = /^\d+$/.test(text.trim()) ? Number.parseInt(text, 10) : Number.NaN;
  const invalid = Number.isNaN(parsed) || parsed < min;
  return (
    <TextField
      label={label}
      value={text}
      onChangeText={(t) => {
        setText(t);
        const n = /^\d+$/.test(t.trim()) ? Number.parseInt(t, 10) : Number.NaN;
        if (!Number.isNaN(n) && n >= min) onCommit(n);
      }}
      keyboardType="number-pad"
      error={invalid ? `Enter a whole number, ${min} or more` : undefined}
    />
  );
}

/** The settings the web widget offers, written to the file as they change. */
export function BoardSettingsSheet({
  ctx,
  onClose,
  onOpenBoard,
}: {
  ctx: Ctx;
  onClose: () => void;
  onOpenBoard: () => void;
}) {
  const { spacing } = useTheme();
  const cfg = boardConfig(ctx.content);
  const update = (patch: Parameters<typeof updateBoardConfig>[1]) => {
    if (ctx.apply(updateBoardConfig(ctx.content, patch))) haptics.selection();
  };
  return (
    <TileSheet
      title="Board settings"
      onClose={onClose}
      testID="board-settings"
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button label="Done" onPress={onClose} fullWidth />
          </View>
          <Button label="Open board" variant="tinted" onPress={onOpenBoard} />
        </View>
      }
    >
      <Text variant="footnote" tone="secondary" weight="600" style={{ textTransform: 'uppercase' }}>
        Visible columns
      </Text>
      {BOARD_TOGGLES.map(({ key, label }) => (
        <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text variant="body" style={{ flex: 1 }}>
            {label}
          </Text>
          <Switch
            accessibilityLabel={label}
            value={cfg[key]}
            onValueChange={(on) => update({ [key]: on })}
          />
        </View>
      ))}
      <Text variant="footnote" tone="secondary" weight="600" style={{ textTransform: 'uppercase' }}>
        Scope
      </Text>
      <SegmentedControl
        testID="board-scope"
        options={BOARD_SCOPES}
        value={cfg.scope ?? 'all'}
        onChange={(scope) => update({ scope })}
      />
      {cfg.showOverdue ? (
        <DaysField
          label="Days in progress before overdue"
          value={cfg.overdueDays}
          min={1}
          onCommit={(overdueDays) => update({ overdueDays })}
        />
      ) : null}
      <DaysField
        label="Only count items older than N days (0 = all)"
        value={cfg.minAgeDays}
        min={0}
        onCommit={(minAgeDays) => update({ minAgeDays })}
      />
    </TileSheet>
  );
}
