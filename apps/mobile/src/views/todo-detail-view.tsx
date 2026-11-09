import type { TodoDue, TodoStatus } from '@kaihuman/formats';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, TextInput, View } from 'react-native';
import { TODO_STATUSES } from '../screens/kanban-board.js';
import type { TodoDetailController } from '../screens/todo-detail.js';
import { completionNotice } from '../screens/todo-due.js';
import { useSyncRevision } from '../sync/hooks.js';
import { useTheme } from '../theme/theme.js';
import {
  Button,
  Chip,
  EmptyState,
  haptics,
  ListRow,
  Screen,
  Section,
  SegmentedControl,
  Text,
  TextField,
} from '../ui/index.js';
import { DueEditor } from './due-editor.js';

const TITLE_DEBOUNCE_MS = 600;
const UNDO_MS = 5000;

/** Short forms keep four segments readable at 393pt. */
const SEGMENT: Record<TodoStatus, string> = {
  backlog: 'Todo',
  'in-progress': 'Active',
  done: 'Done',
  rejected: 'Rejected',
};

const formatTime = (ms: number | string | undefined): string | undefined => {
  if (ms === undefined || ms === '') return undefined;
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

const confirmDelete = (title: string): Promise<boolean> => {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`Delete "${title}"?`));
  return new Promise((resolve) => {
    Alert.alert(
      'Delete todo?',
      title,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
};

export interface TodoDetailViewProps {
  controller: TodoDetailController;
  /** Leaves the screen: back to the board. */
  onClose: () => void;
}

export function TodoDetailView({ controller, onClose }: TodoDetailViewProps) {
  const { colors, spacing, shape, metrics } = useTheme();
  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);
  const rev = useSyncRevision();

  const [draft, setDraft] = useState('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  const draftRef = useRef('');
  const focused = useRef(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const state = controller.state;

  /** Adopts the stored title unless the user is mid-edit: reloads must not eat keystrokes. */
  const syncDraft = useCallback(() => {
    const s = controller.state;
    if (s.kind !== 'ready' || focused.current || dirty.current) return;
    draftRef.current = s.item.text;
    setDraft(s.item.text);
  }, [controller]);

  const reload = useCallback(async () => {
    // A deleted todo is gone from the file; reloading now would lose the chance to undo.
    if (controller.state.kind === 'deleted') return;
    try {
      await controller.load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
    syncDraft();
    rerender();
  }, [controller, rerender, syncDraft]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` re-reads after a sync
  useEffect(() => {
    void reload();
  }, [reload, rev]);

  const saveTitle = useCallback(async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    const text = draftRef.current;
    const res = await controller.setTitle(text);
    // Typing continued while saving: that edit has its own pending save.
    if (draftRef.current === text) dirty.current = false;
    setTitleError(res.ok ? null : res.error);
    if (res.ok) haptics.success();
    else haptics.error();
    syncDraft();
    rerender();
  }, [controller, rerender, syncDraft]);

  const onTitle = (text: string) => {
    draftRef.current = text;
    dirty.current = true;
    setDraft(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void saveTitle(), TITLE_DEBOUNCE_MS);
  };

  // Flush a pending title on unmount so navigating away never drops the last edit.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(undoTimer.current);
      if (dirty.current && controller.state.kind === 'ready') {
        void controller.setTitle(draftRef.current);
      }
    },
    [controller],
  );

  const run = async (work: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    const res = await work();
    setError(res.ok ? null : res.error);
    if (res.ok) haptics.success();
    else haptics.error();
    rerender();
    return res;
  };

  // A recurring todo is not finished by Done: it moves to its next occurrence, so say where.
  const changeStatus = async (status: TodoStatus) => {
    const current = controller.state.kind === 'ready' ? controller.state.item : undefined;
    const next = status === 'done' && current ? completionNotice(current, new Date()) : undefined;
    const res = await run(() => controller.setStatus(status));
    setNotice(res.ok && next ? next : null);
  };

  const addTag = async (raw: string) => {
    const res = await run(() => controller.addTag(raw));
    setTagError(res.ok ? null : res.error);
    if (res.ok) setTagDraft('');
  };

  const remove = async () => {
    if (state.kind !== 'ready') return;
    if (!(await confirmDelete(state.item.text))) return;
    // The pending title is moot once the todo is gone.
    clearTimeout(timer.current);
    dirty.current = false;
    const res = await run(() => controller.remove());
    if (res.ok) undoTimer.current = setTimeout(onClose, UNDO_MS);
  };

  const undo = async () => {
    clearTimeout(undoTimer.current);
    const res = await run(() => controller.undoRemove());
    if (res.ok) syncDraft();
    else undoTimer.current = setTimeout(onClose, UNDO_MS);
    rerender();
  };

  if (state.kind === 'loading') {
    return (
      <Screen title="Todo">
        <View style={{ paddingVertical: spacing.xxl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.secondaryLabel} accessibilityLabel="Loading todo" />
        </View>
      </Screen>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <Screen title="Todo">
        <EmptyState
          icon="empty"
          title="This todo no longer exists"
          message="It was deleted or moved on another device."
          action={{ label: 'Back to board', onPress: onClose }}
        />
      </Screen>
    );
  }

  if (state.kind === 'deleted') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <UndoBar onUndo={() => void undo()} />
      </View>
    );
  }

  const { item, milestones, tagSuggestions, path } = state;
  const due: TodoDue | undefined = item.dueDate
    ? { date: item.dueDate, ...(item.dueTime && { time: item.dueTime }) }
    : undefined;
  const created = formatTime(item.createdAt);
  const updated = formatTime(item.updatedAt);

  const chips = { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm } as const;
  const pad = { padding: spacing.lg, gap: spacing.md } as const;
  const card = (children: React.ReactNode) => (
    <View style={{ backgroundColor: colors.surface, borderRadius: shape.md, ...pad }}>
      {children}
    </View>
  );

  return (
    <Screen title="Todo" keyboard>
      <Section header="Title">
        <View style={{ padding: spacing.md }}>
          <TextField
            testID="todo-title"
            label="Title"
            value={draft}
            multiline
            autoCapitalize="sentences"
            onChangeText={onTitle}
            error={titleError ?? undefined}
            onFocus={() => {
              focused.current = true;
            }}
            onBlur={() => {
              focused.current = false;
              void saveTitle();
            }}
          />
        </View>
      </Section>

      <Section header="Status">
        <View style={{ padding: spacing.md }}>
          <SegmentedControl
            testID="todo-status"
            options={TODO_STATUSES.map((s) => ({ value: s, label: SEGMENT[s] }))}
            value={item.status}
            onChange={(s) => void changeStatus(s)}
          />
          {notice ? (
            <View accessibilityLiveRegion="polite" style={{ paddingTop: spacing.sm }}>
              <Text variant="footnote" tone="secondary" testID="todo-notice">
                {notice}
              </Text>
            </View>
          ) : null}
        </View>
      </Section>

      <Section header="Milestone">
        <ListRow
          testID="todo-milestone-none"
          title="None"
          accessory={item.milestoneId === undefined ? 'check' : 'none'}
          onPress={() => void run(() => controller.setMilestone(undefined))}
        />
        {milestones.map((m) => (
          <ListRow
            key={m.id}
            testID={`todo-milestone-${m.id}`}
            title={m.name}
            {...(m.dueDate && { value: m.dueDate })}
            accessory={item.milestoneId === m.id ? 'check' : 'none'}
            onPress={() => void run(() => controller.setMilestone(m.id))}
          />
        ))}
      </Section>

      <Section header="Tags">
        {card(
          <>
            {item.tags.length > 0 ? (
              <View style={chips}>
                {item.tags.map((t) => (
                  <Chip
                    key={t}
                    label={`#${t}`}
                    icon="close"
                    selected
                    accessibilityLabel={`Remove tag ${t}`}
                    onPress={() => void run(() => controller.removeTag(t))}
                  />
                ))}
              </View>
            ) : null}
            <TagInput
              value={tagDraft}
              onChange={setTagDraft}
              onSubmit={() => void addTag(tagDraft)}
              borderColor={colors.separator}
              color={colors.label}
              placeholderColor={colors.tertiaryLabel}
              height={metrics.hitTarget}
              radius={shape.sm}
            />
            {tagError ? (
              <Text variant="footnote" tone="danger">
                {tagError}
              </Text>
            ) : null}
            {tagSuggestions.length > 0 ? (
              <View style={chips}>
                {tagSuggestions.map((t) => (
                  <Chip
                    key={t}
                    label={`#${t}`}
                    accessibilityLabel={`Add tag ${t}`}
                    onPress={() => void addTag(t)}
                  />
                ))}
              </View>
            ) : null}
          </>,
        )}
      </Section>

      <Section header="Due">
        {card(
          <DueEditor
            value={due}
            onChange={(next) => void run(() => controller.setDue(next))}
            {...(item.repeat && { repeat: item.repeat })}
            onRepeatChange={(next) => void run(() => controller.setRepeat(next))}
          />,
        )}
      </Section>

      <Section header="Details">
        {created ? <ListRow title="Created" value={created} /> : null}
        {updated ? <ListRow title="Updated" value={updated} /> : null}
        <ListRow title="File" subtitle={path} />
      </Section>

      {error ? (
        <Text variant="footnote" tone="danger" accessibilityRole="summary">
          {error}
        </Text>
      ) : null}

      <Button
        testID="todo-delete"
        label="Delete todo"
        icon="trash"
        variant="destructive"
        fullWidth
        onPress={() => void remove()}
      />
    </Screen>
  );
}

function TagInput({
  value,
  onChange,
  onSubmit,
  borderColor,
  color,
  placeholderColor,
  height,
  radius,
}: {
  value: string;
  onChange: (text: string) => void;
  onSubmit: () => void;
  borderColor: string;
  color: string;
  placeholderColor: string;
  height: number;
  radius: number;
}) {
  const { spacing } = useTheme();
  return (
    <TextInput
      testID="todo-tag-input"
      accessibilityLabel="Add tag"
      value={value}
      onChangeText={onChange}
      onSubmitEditing={onSubmit}
      placeholder="Add tag"
      placeholderTextColor={placeholderColor}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="done"
      blurOnSubmit={false}
      style={{
        height,
        color,
        borderWidth: 1,
        borderColor,
        borderRadius: radius,
        paddingHorizontal: spacing.md,
      }}
    />
  );
}

/** Snackbar-like bar: the todo is already gone, so Undo is the only thing left to do. */
function UndoBar({ onUndo }: { onUndo: () => void }) {
  const { colors, spacing, shape } = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: spacing.lg,
        right: spacing.lg,
        bottom: spacing.xl,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: spacing.md,
        borderRadius: shape.md,
        backgroundColor: colors.surfaceElevated,
        borderWidth: 1,
        borderColor: colors.separator,
      }}
    >
      <Text variant="body">Todo deleted</Text>
      <Button testID="todo-undo" label="Undo" variant="plain" size="small" onPress={onUndo} />
    </View>
  );
}
