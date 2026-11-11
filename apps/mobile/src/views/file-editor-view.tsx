import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, TextInput, View } from 'react-native';
import { tileKindForPath } from '../components/widgets/tile-controllers.js';
import { EditHistory } from '../editor/edit-history.js';
import {
  continueList,
  insertLink,
  type Selection,
  type TextEdit,
  toggleLinePrefix,
  toggleWrap,
} from '../editor/markdown-edit.js';
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
  useKeyboardVisible,
} from '../ui/index.js';
import { ActionLogFull } from './actionlog-full.js';
import { EditorToolbar, type FormatAction } from './editor-toolbar.js';
import { FileContentView, NoViewerNote } from './file-views.js';
import { NewFileSheet } from './new-file-sheet.js';

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
  const [creating, setCreating] = useState(false);
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
      <Button
        label="New file"
        variant="tinted"
        size="medium"
        onPress={() => setCreating(true)}
        testID="new-file"
      />
      {creating ? (
        <NewFileSheet
          folder={folder}
          paths={controller.paths()}
          onCreate={(path, content) => controller.createFile(path, content)}
          onCreated={(path) => {
            setCreating(false);
            void load();
            onOpenFile(path);
          }}
          onClose={() => setCreating(false)}
        />
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

/** Quiet time after the last keystroke before the editor saves on its own. */
export const AUTOSAVE_MS = 1500;

const formatEdit = (action: FormatAction, text: string, sel: Selection): TextEdit => {
  switch (action) {
    case 'bold':
      return toggleWrap(text, sel, '**', 'bold');
    case 'italic':
      return toggleWrap(text, sel, '_', 'italic');
    case 'link':
      return insertLink(text, sel);
    default:
      return toggleLinePrefix(text, sel, action);
  }
};

export function FileEditorView({
  controller,
  path,
  mode = 'view',
  autosaveMs = AUTOSAVE_MS,
}: {
  controller: FileEditorController;
  path: string;
  mode?: FileMode;
  autosaveMs?: number;
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
  const history = useRef(new EditHistory()).current;
  const selection = useRef<Selection>({ start: 0, end: 0 });
  // Set only for a programmatic change (format, undo); cleared once the input reports back.
  const [forcedSelection, setForcedSelection] = useState<Selection | undefined>();
  const autosave = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const savingRef = useRef(false);
  const latest = useRef<string | null>(null);
  const keyboardVisible = useKeyboardVisible();

  const opened = (s: FileEditorState) => {
    history.reset();
    latest.current = s.status === 'open' ? s.content : null;
    setState(s);
  };

  // Declared before the load effect so its cleanup runs first: pending edits are flushed
  // before `close()` drops them when the user leaves the screen.
  useEffect(
    () => () => {
      clearTimeout(autosave.current);
      const s = controller.state;
      if (s.status === 'open' && s.dirty) void controller.save().catch(() => {});
    },
    [controller],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on Retry
  useEffect(() => {
    setError(null);
    controller
      .refresh()
      .then(() => controller.open(path))
      .then(opened)
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
      .then(opened)
      .catch(() => {});
  }, [rev]);

  const unlock = () => {
    if (!passphrase || unlocking) return;
    setUnlocking(true);
    void controller
      .unlock(passphrase)
      .then((s) => {
        opened(s);
        if (s.status === 'open') {
          haptics.success();
          setPassphrase('');
        } else haptics.error();
      })
      .finally(() => setUnlocking(false));
  };

  // The outcome and the end of `saving` are set in one synchronous block so they render
  // together; otherwise the error showed while Save was still disabled and a retry tap was lost.
  const save = async (quiet = false) => {
    clearTimeout(autosave.current);
    if (savingRef.current) {
      scheduleAutosave();
      return;
    }
    savingRef.current = true;
    setError(null);
    setSaving(true);
    try {
      await controller.save();
      setSaved(true);
      if (!quiet) haptics.success();
    } catch (e: unknown) {
      setError(messageOf(e));
      haptics.error();
    }
    savingRef.current = false;
    // `save()` restores the content it started with; keystrokes typed meanwhile go back on top.
    const s = controller.state;
    if (s.status === 'open' && latest.current !== null && latest.current !== s.content) {
      controller.edit(latest.current);
      setSaved(false);
      scheduleAutosave();
    }
    setSaving(false);
    sync();
  };

  const scheduleAutosave = () => {
    clearTimeout(autosave.current);
    autosave.current = setTimeout(() => void save(true), autosaveMs);
  };

  const current = (): TextEdit => ({
    text: controller.state.status === 'open' ? controller.state.content : '',
    selection: selection.current,
  });

  const apply = (text: string, sel: Selection | undefined, coalesce: boolean) => {
    history.record(current(), Date.now(), coalesce);
    commit(text, sel);
  };

  const commit = (text: string, sel: Selection | undefined) => {
    latest.current = text;
    controller.edit(text);
    if (sel) {
      selection.current = sel;
      setForcedSelection(sel);
    }
    setSaved(false);
    sync();
    scheduleAutosave();
  };

  const undo = () => {
    const prev = history.undo(current());
    if (prev) commit(prev.text, prev.selection);
  };

  const redo = () => {
    const next = history.redo(current());
    if (next) commit(next.text, next.selection);
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
      latest.current = next;
      controller.edit(next);
      sync();
      void save();
    };
    // The log owns its scrolling (pinned entry field, sticky day headers), so the screen must not scroll.
    const fullLog = tileKindForPath(kind.innerPath) === 'actionlog';
    return (
      <Screen
        scroll={!fullLog}
        keyboard={fullLog}
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
        {fullLog ? (
          <ActionLogFull content={state.content} now={new Date()} onWrite={write} />
        ) : (
          <FileContentView path={path} content={state.content} onWrite={write} />
        )}
      </Screen>
    );
  }

  if (state.status === 'open') {
    const dirty = state.dirty;
    const markdown = kind.view.type === 'markdown';
    // Notes read better in the body face with room between lines; data files keep monospace.
    const prose = markdown || kind.view.type === 'text';
    const face = prose ? theme.type.body : theme.type.callout;
    const lock = () => {
      haptics.selection();
      clearTimeout(autosave.current);
      controller.lock();
      setSaved(false);
      sync();
    };
    return (
      <Screen
        scroll={false}
        inset="none"
        keyboard
        footer={
          <View style={{ gap: spacing.sm }}>
            <EditorToolbar
              markdown={markdown}
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              keyboardVisible={keyboardVisible}
              onUndo={undo}
              onRedo={redo}
              onFormat={(action) => {
                const e = formatEdit(action, state.content, selection.current);
                apply(e.text, e.selection, false);
              }}
              onDismissKeyboard={() => Keyboard.dismiss()}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1, gap: spacing.xxs }} testID="save-state">
                {dirty && saving ? (
                  <Text variant="footnote" tone="secondary">
                    Saving…
                  </Text>
                ) : dirty ? (
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
              {state.encrypted && !keyboardVisible ? (
                <Button label="Lock" variant="plain" size="medium" onPress={lock} />
              ) : null}
              <Button
                label="Save"
                size="medium"
                disabled={!dirty}
                loading={saving}
                onPress={() => void save()}
              />
            </View>
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
          selection={forcedSelection}
          multiline
          autoCapitalize={prose ? 'sentences' : 'none'}
          autoCorrect={prose}
          spellCheck={prose}
          scrollEnabled
          placeholder={markdown ? 'Start writing…' : 'Empty file'}
          placeholderTextColor={colors.tertiaryLabel}
          selectionColor={colors.accent}
          cursorColor={colors.accent}
          onSelectionChange={(e) => {
            selection.current = e.nativeEvent.selection;
            if (forcedSelection) setForcedSelection(undefined);
          }}
          onChangeText={(text) => {
            const list = markdown ? continueList(state.content, text) : null;
            if (list) apply(list.text, list.selection, false);
            else apply(text, undefined, true);
          }}
          style={[
            face,
            {
              flex: 1,
              color: colors.label,
              fontFamily: prose ? undefined : theme.fontFamily.mono,
              lineHeight: Math.round(face.fontSize * (prose ? 1.5 : 1.4)),
              backgroundColor: colors.surface,
              borderRadius: shape.md,
              marginHorizontal: spacing.lg,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
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
