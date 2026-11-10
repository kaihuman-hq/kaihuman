import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { TileFile } from '../screens/dashboards.js';
import type { ContentFiles } from '../screens/file-editor-screen.js';
import { useTheme } from '../theme/theme.js';
import { Button, EmptyState, haptics, Text, TextField } from '../ui/index.js';
import type { Glance, QuickAction } from './tiles/glance/types.js';

type FieldAction = Extract<QuickAction, { kind: 'field' }>;

type Loaded =
  | { state: 'loading' }
  | { state: 'missing'; message: string }
  | { state: 'ready'; content: string; action: FieldAction };

export interface QuickEntryViewProps {
  path: string;
  files: Pick<ContentFiles, 'read' | 'write'>;
  glanceFor: (file: TileFile, now: Date) => Glance | null;
  /** Called after a successful write with the new text. */
  onSaved: (path: string, content: string) => void;
  onDone: () => void;
  now?: () => Date;
}

/**
 * One-field sheet behind a Track entry (Expense, Weight…): the glance's field action is
 * recomputed from the file's current text, so the menu never writes against stale content.
 */
export function QuickEntryView({
  path,
  files,
  glanceFor,
  onSaved,
  onDone,
  now = () => new Date(),
}: QuickEntryViewProps) {
  const { spacing } = useTheme();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: load once per path; `now`/`glanceFor` are stable in practice
  useEffect(() => {
    let live = true;
    files
      .read(path)
      .then((content) => {
        const action = glanceFor({ path, content }, now())?.action;
        if (!live) return;
        setLoaded(
          action?.kind === 'field'
            ? { state: 'ready', content, action }
            : { state: 'missing', message: 'This tile has no quick entry.' },
        );
      })
      .catch((e: unknown) => {
        if (live)
          setLoaded({
            state: 'missing',
            message: e instanceof Error ? e.message : 'Could not open the file.',
          });
      });
    return () => {
      live = false;
    };
  }, [path, files]);

  if (loaded.state === 'loading') return null;
  if (loaded.state === 'missing') {
    return <EmptyState icon="warning" title="Nothing to add" message={loaded.message} />;
  }
  const { action, content } = loaded;
  const submit = async () => {
    if (busy || !value.trim()) return;
    const result = action.submit(content, value.trim(), now());
    if (!result.ok) {
      setError(result.error);
      haptics.error();
      return;
    }
    setBusy(true);
    try {
      await files.write(path, result.content);
      haptics.success();
      onSaved(path, result.content);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  };
  return (
    <View style={{ padding: spacing.lg, gap: spacing.md }}>
      <Text variant="headline" accessibilityRole="header">
        {action.label}
      </Text>
      <TextField
        testID="quick-entry-field"
        label={action.label}
        value={value}
        onChangeText={(t) => {
          setValue(t);
          setError(undefined);
        }}
        placeholder={action.placeholder}
        keyboardType={action.keyboard ?? 'default'}
        autoCapitalize={action.keyboard === 'url' ? 'none' : 'sentences'}
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        autoFocus
        {...(error && { error })}
      />
      <Button
        testID="quick-entry-save"
        label="Add"
        fullWidth
        loading={busy}
        disabled={!value.trim()}
        onPress={() => void submit()}
      />
    </View>
  );
}
