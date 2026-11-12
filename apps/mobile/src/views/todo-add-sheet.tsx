import { parseTodos, serializeTodos, setTodoPriority, type TodoRepeat } from '@kaihuman/formats';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { addTodoTask } from '../components/widgets/todos-tile.js';
import { DUE_PRESETS, type DuePreset, dueFromPreset } from '../screens/todo-due.js';
import { useTheme } from '../theme/theme.js';
import { Button, Chip, haptics, Text, TextField } from '../ui/index.js';

export interface TodoAddSheetProps {
  path: string;
  content: string;
  now: Date;
  onWrite: (path: string, content: string) => void | Promise<void>;
  onClose: () => void;
}

const REPEATS = {
  none: undefined,
  daily: { unit: 'day', interval: 1 },
  weekly: { unit: 'week', interval: 1 },
} as const satisfies Record<string, TodoRepeat | undefined>;
type RepeatChoice = keyof typeof REPEATS;
const NEXT_REPEAT: Record<RepeatChoice, RepeatChoice> = {
  none: 'daily',
  daily: 'weekly',
  weekly: 'none',
};

const PRIORITIES = [undefined, 'high', 'super-high', 'ultra-high'] as const;
type Priority = (typeof PRIORITIES)[number];
const PRIORITY_LABEL = { high: 'High', 'super-high': 'Super high', 'ultra-high': 'Ultra high' };

const MAX_TAGS = 3;

export function TodoAddSheet({ path, content, now, onWrite, onClose }: TodoAddSheetProps) {
  const { spacing } = useTheme();
  const [text, setText] = useState('');
  const [due, setDue] = useState<DuePreset | null>(null);
  const [priority, setPriority] = useState<Priority>(undefined);
  const [repeat, setRepeat] = useState<RepeatChoice>('none');
  const [tags, setTags] = useState<readonly string[]>([]);
  // Bursts add several todos before the parent re-renders with the saved file.
  const latest = useRef(content);
  useEffect(() => {
    latest.current = content;
  }, [content]);

  const recentTags = useMemo(() => {
    const seen = new Set<string>();
    for (const item of [...parseTodos(content).items].reverse()) {
      for (const t of item.tags) if (seen.size < MAX_TAGS) seen.add(t);
    }
    return [...seen];
  }, [content]);

  const toggleDue = (preset: DuePreset) => setDue(due === preset ? null : preset);
  const file = path.slice(path.lastIndexOf('/') + 1);

  /** The file with the typed todo added; null (with an error haptic) when it is rejected. */
  const build = (): string | null => {
    // A repeat counts from a due date, so it implies today when none was chosen.
    const preset = due ?? (repeat === 'none' ? null : 'today');
    const result = addTodoTask(latest.current, text, now, [...tags], {
      ...(preset && { due: dueFromPreset(preset, now) }),
      ...(REPEATS[repeat] && { repeat: REPEATS[repeat] }),
    });
    if (!result.ok) {
      haptics.error();
      return null;
    }
    let next = result.content;
    if (priority) {
      const data = parseTodos(next);
      const last = data.items.at(-1);
      if (last) next = serializeTodos(setTodoPriority(data, last.id, priority));
    }
    latest.current = next;
    return next;
  };
  // A failed save must not become an unhandled rejection; the outbox keeps retrying the copy.
  const save = (next: string) => {
    haptics.success();
    Promise.resolve(onWrite(path, next)).catch(() => haptics.error());
  };
  const addAndKeepOpen = () => {
    const next = build();
    if (next === null) return;
    save(next);
    setText('');
  };
  // Close before the write: the write fans out (store signals, sync, the dashboard below) and
  // must not land on a sheet that is already being torn down.
  const addAndClose = () => {
    const next = build();
    if (next === null) return;
    onClose();
    save(next);
  };

  return (
    <View style={{ gap: spacing.md, padding: spacing.lg }} testID="todo-add-sheet">
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Button label="Cancel" variant="plain" size="medium" onPress={onClose} />
        <Text variant="headline" accessibilityRole="header">
          New todo
        </Text>
        <Button
          label="Add"
          variant="plain"
          size="medium"
          disabled={!text.trim()}
          onPress={addAndClose}
        />
      </View>
      <TextField
        label="Todo"
        placeholder="What needs doing?"
        value={text}
        onChangeText={setText}
        autoFocus
        autoCapitalize="sentences"
        returnKeyType="done"
        onSubmitEditing={addAndKeepOpen}
        keepFocusOnSubmit
        testID="todo-add-input"
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {DUE_PRESETS.map(({ preset, label }) => (
          <Chip
            key={preset}
            label={label}
            icon="calendar"
            selected={due === preset}
            onPress={() => toggleDue(preset)}
          />
        ))}
        <Chip
          label={priority ? PRIORITY_LABEL[priority] : 'Priority'}
          icon="flag"
          selected={priority !== undefined}
          onPress={() =>
            setPriority(PRIORITIES[(PRIORITIES.indexOf(priority) + 1) % PRIORITIES.length])
          }
        />
        <Chip
          label={repeat === 'none' ? 'Repeat' : repeat === 'daily' ? 'Daily' : 'Weekly'}
          icon="repeat"
          selected={repeat !== 'none'}
          onPress={() => setRepeat(NEXT_REPEAT[repeat])}
        />
        {recentTags.map((t) => (
          <Chip
            key={t}
            label={`#${t}`}
            selected={tags.includes(t)}
            accessibilityLabel={`Tag ${t}`}
            onPress={() => setTags(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])}
          />
        ))}
      </View>
      <Text variant="footnote" tone="secondary">
        {`Saved to ${file} · return adds and keeps the sheet open`}
      </Text>
    </View>
  );
}
