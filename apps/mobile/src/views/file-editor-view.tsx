import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, TextInput, View } from 'react-native';
import { fileKindForPath, hasViewer } from '../files/file-kinds.js';
import type {
  DirectoryEntry,
  FileEditorController,
  FileEditorState,
} from '../screens/file-editor-screen.js';
import { useFocusRefresh, useRefresh, useSyncRevision } from '../sync/hooks.js';
import { useTheme } from '../theme/theme.js';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  haptics,
  Icon,
  ListRow,
  Screen,
  Section,
  Text,
  TextField,
} from '../ui/index.js';
import { FileContentView, NoViewerNote } from './file-views.js';

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

function InlineError({ children }: { children: ReactNode }) {
  const { colors, spacing, shape } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: shape.md,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.danger,
      }}
    >
      <Icon name="warning" size={17} color={colors.danger} />
      <View style={{ flex: 1 }}>
        <Text variant="subheadline" tone="danger">
          {children}
        </Text>
      </View>
    </View>
  );
}

function Loading({ label }: { label: string }) {
  const { colors, spacing } = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl }}
    >
      <ActivityIndicator color={colors.secondaryLabel} />
      <Text variant="subheadline" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

function Breadcrumbs({
  crumbs,
  onGo,
}: {
  crumbs: { name: string; path: string }[];
  onGo: (path: string) => void;
}) {
  const { spacing, colors } = useTheme();
  const items = [{ name: 'Files', path: '' }, ...crumbs];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Folder path"
      contentContainerStyle={{ alignItems: 'center', gap: spacing.xs }}
    >
      {items.map((c, i) => (
        <View key={c.path || 'root'} style={{ flexDirection: 'row', alignItems: 'center' }}>
          {i > 0 ? <Icon name="chevronRight" size={12} color={colors.tertiaryLabel} /> : null}
          <Chip
            label={c.name}
            icon={i === 0 ? 'files' : undefined}
            selected={i === items.length - 1}
            onPress={() => onGo(c.path)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const countLabel = (n: number) => (n === 1 ? '1 item' : `${n} items`);

export function FileBrowserView({
  controller,
  onOpenFile,
}: {
  controller: FileEditorController;
  onOpenFile: (path: string) => void;
}) {
  const theme = useTheme();
  const { spacing } = theme;
  const [, setRev] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { refreshing, onRefresh } = useRefresh();
  const rev = useSyncRevision();
  useFocusRefresh();

  const load = useCallback(
    () =>
      controller
        .refresh()
        .then(() => setError(null))
        .catch((e: unknown) => {
          setError(messageOf(e));
          haptics.error();
        })
        .finally(() => setRev((n) => n + 1)),
    [controller],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` re-reads after a sync
  useEffect(() => {
    // Only the first load shows the skeleton; revision reloads swap data in place.
    load().finally(() => setLoading(false));
  }, [load, rev]);

  const go = (fn: () => void) => {
    haptics.selection();
    fn();
    setRev((n) => n + 1);
  };

  const entries = controller.list();
  const folder = controller.folder;

  const row = (e: DirectoryEntry) => {
    if (e.kind === 'folder') {
      return (
        <ListRow
          key={e.path}
          testID={`entry-${e.path}`}
          title={e.name}
          subtitle={countLabel(controller.list(e.path).length)}
          icon="folder"
          iconTone="info"
          accessory="chevron"
          onPress={() => go(() => controller.enter(e.path))}
        />
      );
    }
    return (
      <ListRow
        key={e.path}
        testID={`entry-${e.path}`}
        title={e.name}
        subtitle={e.encrypted ? 'Encrypted' : undefined}
        icon={e.encrypted ? 'lock' : 'document'}
        iconTone={e.encrypted ? 'warning' : 'neutral'}
        accessory={e.encrypted ? <Badge label="Encrypted" tone="warning" /> : 'none'}
        onPress={() => onOpenFile(e.path)}
      />
    );
  };

  return (
    <Screen title="Files" refreshing={refreshing} onRefresh={onRefresh}>
      {/* At the root the title already says where you are. */}
      {folder ? (
        <Breadcrumbs
          crumbs={controller.breadcrumbs()}
          onGo={(p) => go(() => controller.enter(p))}
        />
      ) : null}
      {error ? <InlineError>{error}</InlineError> : null}
      {loading && entries.length === 0 ? (
        <Loading label="Loading files" />
      ) : entries.length === 0 && !error ? (
        <EmptyState
          icon="files"
          title={folder ? 'This folder is empty' : 'No files yet'}
          message={
            folder
              ? 'Files you add to this folder in the repository show up here.'
              : 'Pull down to refresh, or choose another repository.'
          }
          action={
            folder ? { label: 'Up one level', onPress: () => go(() => controller.up()) } : undefined
          }
        />
      ) : entries.length > 0 ? (
        <Section footer={countLabel(entries.length)}>{entries.map(row)}</Section>
      ) : error ? (
        <Button label="Try again" variant="tinted" size="medium" onPress={() => void load()} />
      ) : null}
      {folder && entries.length > 0 ? (
        <View style={{ paddingTop: spacing.xs }}>
          <Button
            label="Up one level"
            variant="plain"
            size="medium"
            onPress={() => go(() => controller.up())}
          />
        </View>
      ) : null}
    </Screen>
  );
}

/** `view` shows the native reader or tile; `source` is the raw text editor. */
export type FileMode = 'view' | 'source';

export function FileEditorView({
  controller,
  path,
  mode = 'view',
}: {
  controller: FileEditorController;
  path: string;
  mode?: FileMode;
}) {
  const theme = useTheme();
  const { colors, spacing, shape } = theme;
  const [state, setState] = useState<FileEditorState>({ status: 'closed' });
  const [error, setError] = useState<string | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on Retry
  useEffect(() => {
    setError(null);
    controller
      .refresh()
      .then(() => controller.open(path))
      .then(setState)
      .catch((e: unknown) => {
        setError(messageOf(e));
        haptics.error();
      });
    return () => controller.close();
  }, [controller, path, attempt]);

  const sync = () => setState(controller.state);

  // A sync can bring a newer copy; re-read unless local edits are pending.
  const rev = useSyncRevision();
  const firstRev = useRef(rev);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a new revision re-reads
  useEffect(() => {
    if (rev === firstRev.current) return;
    const current = controller.state;
    if (current.status !== 'open' || current.dirty) return;
    controller
      .open(path)
      .then(setState)
      .catch(() => {});
  }, [rev]);

  const unlock = () => {
    if (!passphrase || unlocking) return;
    setUnlocking(true);
    void controller
      .unlock(passphrase)
      .then((s) => {
        setState(s);
        if (s.status === 'open') {
          haptics.success();
          setPassphrase('');
        } else haptics.error();
      })
      .finally(() => setUnlocking(false));
  };

  const save = () => {
    setError(null);
    setSaving(true);
    controller
      .save()
      .then(() => {
        setSaved(true);
        haptics.success();
      })
      .catch((e: unknown) => {
        setError(messageOf(e));
        haptics.error();
      })
      .finally(() => {
        setSaving(false);
        sync();
      });
  };

  const pathLabel = (
    <Text variant="footnote" tone="secondary" mono numberOfLines={2} testID="editor-path">
      {path}
    </Text>
  );

  if (state.status === 'locked') {
    return (
      <Screen keyboard>
        <View style={{ paddingTop: spacing.xl }}>
          <Card padding={spacing.xl}>
            <View style={{ alignItems: 'center', gap: spacing.sm, paddingBottom: spacing.sm }}>
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: colors.accentSoft,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="lock" size={28} color={colors.onAccentSoft} />
              </View>
              <Text variant="title3" align="center" accessibilityRole="header">
                This file is encrypted
              </Text>
              <Text variant="subheadline" tone="secondary" align="center">
                Enter the passphrase to read and edit it.
              </Text>
              {pathLabel}
            </View>
            {state.error ? <InlineError>{state.error}</InlineError> : null}
            <TextField
              label="Passphrase"
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
              returnKeyType="go"
              onSubmitEditing={unlock}
              testID="passphrase"
            />
            <Button
              label="Unlock"
              fullWidth
              loading={unlocking}
              disabled={!passphrase}
              onPress={unlock}
            />
          </Card>
        </View>
      </Screen>
    );
  }

  const kind = fileKindForPath(path);
  if (state.status === 'open' && mode === 'view' && hasViewer(kind.view)) {
    // Viewer writes take the sync engine's optimistic path: edit, then save.
    const write = (next: string) => {
      controller.edit(next);
      sync();
      save();
    };
    return (
      <Screen
        footer={
          state.encrypted ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text variant="footnote" tone="secondary" style={{ flex: 1 }}>
                Encrypted file
              </Text>
              <Button
                label="Lock"
                variant="plain"
                size="medium"
                onPress={() => {
                  haptics.selection();
                  controller.lock();
                  setSaved(false);
                  sync();
                }}
              />
            </View>
          ) : undefined
        }
      >
        {pathLabel}
        {error ? <InlineError>{error}</InlineError> : null}
        <FileContentView path={path} content={state.content} onWrite={write} />
      </Screen>
    );
  }

  if (state.status === 'open') {
    const dirty = state.dirty;
    return (
      <Screen
        scroll={false}
        inset="none"
        keyboard
        footer={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={{ flex: 1, gap: spacing.xxs }}>
              {dirty ? (
                <Badge label="Unsaved changes" tone="warning" />
              ) : saved ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Icon name="check" size={14} color={colors.success} weight="semibold" />
                  <Text variant="footnote" tone="success">
                    Saved
                  </Text>
                </View>
              ) : (
                <Text variant="footnote" tone="secondary">
                  {state.encrypted ? 'Encrypted file' : 'No changes'}
                </Text>
              )}
            </View>
            {state.encrypted ? (
              <Button
                label="Lock"
                variant="plain"
                size="medium"
                onPress={() => {
                  haptics.selection();
                  controller.lock();
                  setSaved(false);
                  sync();
                }}
              />
            ) : null}
            <Button label="Save" size="medium" disabled={!dirty} loading={saving} onPress={save} />
          </View>
        }
      >
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
          {pathLabel}
          {kind.view.type === 'unknown' ? <NoViewerNote ext={kind.view.ext} /> : null}
          {error ? <InlineError>{error}</InlineError> : null}
        </View>
        <TextInput
          accessibilityLabel="Content"
          value={state.content}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          scrollEnabled
          placeholder="Empty file"
          placeholderTextColor={colors.tertiaryLabel}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          onChangeText={(text) => {
            controller.edit(text);
            setSaved(false);
            sync();
          }}
          style={[
            theme.type.callout,
            {
              flex: 1,
              color: colors.label,
              fontFamily: theme.fontFamily.mono,
              backgroundColor: colors.surface,
              borderRadius: shape.md,
              marginHorizontal: spacing.lg,
              padding: spacing.md,
              textAlignVertical: 'top',
              outlineWidth: 0,
              // A 'solid' style makes the zero width win over the browser's focus ring in the web preview.
              outlineStyle: 'solid',
            },
          ]}
        />
      </Screen>
    );
  }

  if (error) {
    return (
      <Screen>
        <EmptyState
          icon="warning"
          title="Couldn't open the file"
          message={error}
          action={{ label: 'Try again', onPress: () => setAttempt((n) => n + 1) }}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <Loading label="Opening file" />
    </Screen>
  );
}
