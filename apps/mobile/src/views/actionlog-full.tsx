import type { ActionLogEntry } from '@kaihuman/formats';
import { useState } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import {
  actionLogList,
  deleteAction,
  editAction,
  entryTime,
  groupByDay,
  logAction,
  stripTags,
  type TileResult,
} from '../components/widgets/tile-controllers.js';
import { useTheme } from '../theme/theme.js';
import {
  Badge,
  Chip,
  Divider,
  haptics,
  MotionItem,
  SwipeReveal,
  Text,
  TextField,
} from '../ui/index.js';
import { Err, QuickAdd } from './tiles/parts.js';

export interface ActionLogFullProps {
  content: string;
  now: Date;
  /** Persists the file's next text. */
  onWrite: (content: string) => void | Promise<void>;
  /** Focus the entry field on open, for a "log something now" entry point. */
  autoFocus?: boolean;
}

/**
 * The action log as a full screen: the entry field is pinned on top, below it a search and tag
 * filter, then the log newest first under sticky day headers. Swipe a row to edit or delete it.
 */
export function ActionLogFull({ content, now, onWrite, autoFocus }: ActionLogFullProps) {
  const { colors, spacing } = useTheme();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<ActionLogEntry | undefined>();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const list = actionLogList(content, { text: query, tag });
  const sections = groupByDay(list.entries, now).map((d) => ({ ...d, data: d.entries }));
  const filtering = query.trim() !== '' || tag !== undefined;

  const apply = (result: TileResult): boolean => {
    if (!result.ok) {
      setError(result.error);
      haptics.error();
      return false;
    }
    setError(null);
    haptics.success();
    void onWrite(result.content);
    return true;
  };
  const submit = () => {
    const done = editing
      ? apply(editAction(content, editing, text))
      : apply(logAction(content, text, now));
    if (done) {
      setText('');
      setEditing(undefined);
    }
  };
  const startEdit = (e: ActionLogEntry) => {
    setEditing(e);
    setText(e.description);
  };
  const cancelEdit = () => {
    setEditing(undefined);
    setText('');
  };

  return (
    <View style={{ flex: 1, gap: spacing.md }}>
      <QuickAdd
        label={editing ? 'Edit entry' : 'What did you do?'}
        placeholder="Ran 5k #run"
        value={text}
        onChangeText={setText}
        onSubmit={submit}
        addLabel={editing ? 'Save entry' : 'Log action'}
        autoFocus={autoFocus}
      />
      {editing ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel edit" onPress={cancelEdit}>
          <Text variant="footnote" tone="secondary">
            Editing {editing.timestamp} · tap to cancel
          </Text>
        </Pressable>
      ) : null}
      <Err error={error} />
      <TextField label="Search log" value={query} onChangeText={setQuery} returnKeyType="search" />
      {list.tags.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {list.tags.map((t) => (
            <Chip
              key={t}
              label={`#${t}`}
              accessibilityLabel={`Filter by ${t}`}
              selected={tag === t}
              onPress={() => setTag(tag === t ? undefined : t)}
            />
          ))}
        </View>
      ) : null}
      <SectionList
        style={{ flex: 1 }}
        sections={sections}
        keyExtractor={(e) => `${e.timestamp}-${e.description}`}
        stickySectionHeadersEnabled
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        ListEmptyComponent={
          <Text variant="subheadline" tone="secondary" style={{ paddingVertical: spacing.sm }}>
            {filtering ? 'No matching entries.' : 'Nothing logged yet.'}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <View style={{ backgroundColor: colors.background, paddingVertical: spacing.xs }}>
            <Text variant="footnote" weight="600" tone="secondary" accessibilityRole="header">
              {section.title}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <MotionItem>
            <Row
              entry={item}
              onEdit={() => startEdit(item)}
              onDelete={() => {
                if (editing && editing.timestamp === item.timestamp) cancelEdit();
                apply(deleteAction(content, item));
              }}
            />
            <Divider />
          </MotionItem>
        )}
      />
    </View>
  );
}

function Row({
  entry,
  onEdit,
  onDelete,
}: {
  entry: ActionLogEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { spacing, metrics } = useTheme();
  const title = stripTags(entry.description);
  return (
    <SwipeReveal
      actions={[
        { label: 'Edit', icon: 'edit', onPress: onEdit },
        { label: 'Delete', icon: 'trash', destructive: true, onPress: onDelete },
      ]}
      fullSwipe
      testID={`log-${entry.timestamp}-swipeable`}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${entryTime(entry.timestamp)}`}
        accessibilityHint="Swipe for edit and delete"
        onPress={onEdit}
        testID={`log-${entry.timestamp}`}
        style={{
          minHeight: metrics.hitTarget,
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.md,
          paddingVertical: spacing.sm,
        }}
      >
        <Text variant="footnote" mono tone="secondary" style={{ width: 44, paddingTop: 2 }}>
          {entryTime(entry.timestamp)}
        </Text>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <Text variant="body">{title}</Text>
          {entry.tags.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              {entry.tags.map((t) => (
                <Badge key={t} label={`#${t}`} />
              ))}
            </View>
          ) : null}
        </View>
      </Pressable>
    </SwipeReveal>
  );
}
