import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from 'react-native';
import type { TileKind } from '../components/widgets/tile-controllers.js';
import { tileKindForPath } from '../components/widgets/tile-controllers.js';
import {
  type DashboardEdit,
  dropIndex,
  filesOfKind,
  moveItem,
  NEW_TILE_FILES,
  newTileFile,
} from '../screens/dashboard-edit.js';
import type { DashboardPage } from '../screens/dashboards.js';
import { useTheme } from '../theme/theme.js';
import {
  Button,
  errorMessage,
  haptics,
  Icon,
  ListRow,
  Section,
  Text,
  TextField,
} from '../ui/index.js';
import { useInsets } from '../ui/insets.js';
import { TILE_META } from './tile-view.js';

/** What the dashboard screen hands the pager so it can offer edit mode. */
export interface DashboardEditor {
  /** Every file path in the repository, for the add-tile picker. */
  tree: readonly string[];
  /** Saves the edits to the dashboard config; rejects with a message to show. */
  onEdit: (edits: DashboardEdit[]) => Promise<void>;
  onCreateFile: (path: string, content: string) => Promise<void>;
  newDashboardId: () => Promise<string>;
}

const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const titleOf = (path: string) => {
  const kind = tileKindForPath(path);
  return kind ? TILE_META[kind].title : nameOf(path);
};

/** Bottom sheet in the style of the dashboard menu. */
export function Sheet({
  visible,
  title,
  onClose,
  testID,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  testID: string;
  children: ReactNode;
}) {
  const { colors, spacing, shape } = useTheme();
  const insets = useInsets();
  const { height } = useWindowDimensions();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${title}`}
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: colors.shadow,
            opacity: 0.4,
          }}
        />
        <View
          testID={testID}
          accessibilityViewIsModal
          style={{
            maxHeight: height * 0.85,
            backgroundColor: colors.background,
            borderTopLeftRadius: shape.lg,
            borderTopRightRadius: shape.lg,
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.md,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
            }}
          >
            <Text variant="headline" accessibilityRole="header" style={{ flex: 1 }}>
              {title}
            </Text>
            <Button label="Done" variant="plain" size="small" onPress={onClose} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: spacing.md }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function EditRow({
  path,
  index,
  count,
  disabled,
  onDragState,
  onDrop,
  onRemove,
  onOpen,
}: {
  path: string;
  index: number;
  count: number;
  disabled: boolean;
  onDragState: (dragging: boolean) => void;
  onDrop: (from: number, to: number) => void;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const { colors, spacing, shape, metrics } = useTheme();
  const kind = tileKindForPath(path);
  const y = useRef(new Animated.Value(0)).current;
  const height = useRef(64);
  const latest = useRef({ index, count, onDrop, onDragState });
  latest.current = { index, count, onDrop, onDragState };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          latest.current.onDragState(true);
          haptics.selection();
        },
        onPanResponderMove: Animated.event([null, { dy: y }], { useNativeDriver: false }),
        onPanResponderRelease: (_, g) => {
          const { index: from, count: n } = latest.current;
          const to = dropIndex(
            from,
            { dx: g.dx, dy: g.dy },
            { count: n, columns: 1, cellWidth: 0, cellHeight: height.current, gap: spacing.sm },
          );
          y.setValue(0);
          latest.current.onDragState(false);
          if (to !== from) latest.current.onDrop(from, to);
        },
        onPanResponderTerminate: () => {
          y.setValue(0);
          latest.current.onDragState(false);
        },
      }),
    [y, spacing.sm],
  );
  const title = titleOf(path);
  return (
    <Animated.View
      testID={`edit-tile-${path}`}
      onLayout={(e) => {
        height.current = e.nativeEvent.layout.height;
      }}
      accessibilityActions={[
        { name: 'moveUp', label: 'Move up' },
        { name: 'moveDown', label: 'Move down' },
      ]}
      onAccessibilityAction={(e) => {
        if (e.nativeEvent.actionName === 'moveUp' && index > 0) onDrop(index, index - 1);
        if (e.nativeEvent.actionName === 'moveDown' && index < count - 1) onDrop(index, index + 1);
      }}
      style={{
        transform: [{ translateY: y }],
        zIndex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.surface,
        borderRadius: shape.lg,
        paddingHorizontal: spacing.sm,
        minHeight: Math.max(metrics.hitTarget, 56),
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${title}`}
        testID={`remove-tile-${path}`}
        disabled={disabled}
        onPress={onRemove}
        hitSlop={6}
        style={{ padding: spacing.xs }}
      >
        <Icon name="trash" size={20} color={colors.danger} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Tile settings, ${title}`}
        testID={`tile-settings-${path}`}
        disabled={disabled}
        onPress={onOpen}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        {kind ? <Icon name={TILE_META[kind].icon} size={20} color={colors.accent} /> : null}
        <View style={{ flex: 1 }}>
          <Text variant="body" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="caption2" mono tone="secondary" numberOfLines={1}>
            {nameOf(path)}
          </Text>
        </View>
      </Pressable>
      <View
        {...(disabled ? {} : responder.panHandlers)}
        accessibilityLabel={`Drag to reorder ${title}`}
        testID={`drag-tile-${path}`}
        style={{ padding: spacing.sm }}
      >
        <Icon name="sort" size={20} color={colors.secondaryLabel} />
      </View>
    </Animated.View>
  );
}

/** One dashboard's tiles as a reorderable list, shown in place of the tiles while editing. */
export function EditTiles({
  page,
  pages,
  editor,
  onScrollEnabled,
}: {
  page: DashboardPage;
  pages: readonly DashboardPage[];
  editor: DashboardEditor;
  onScrollEnabled: (on: boolean) => void;
}) {
  const { colors, spacing } = useTheme();
  const shown = page.files.map((f) => f.path);
  const key = shown.join('\n');
  // Shows the new order at once; the reload after the save confirms it.
  const [order, setOrder] = useState(shown);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only when the saved order changes
  useEffect(() => setOrder(shown), [key]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const save = async (edits: DashboardEdit[]) => {
    setBusy(true);
    setError(null);
    try {
      await editor.onEdit(edits);
      haptics.success();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      setOrder(shown);
      haptics.error();
      return false;
    } finally {
      setBusy(false);
    }
  };

  const drop = (from: number, to: number) => {
    const next = moveItem(order, from, to);
    setOrder(next);
    void save([{ type: 'reorderTiles', dashboard: page.id, paths: next }]);
  };
  const remove = (path: string) => {
    setOrder((o) => o.filter((p) => p !== path));
    void save([{ type: 'removeTile', dashboard: page.id, path }]);
  };

  return (
    <View style={{ gap: spacing.sm }} testID="dashboard-edit-tiles">
      {error ? (
        <Text variant="footnote" color={colors.danger} testID="dashboard-edit-error">
          {error}
        </Text>
      ) : null}
      {order.length === 0 ? (
        <Text variant="footnote" tone="secondary">
          No tiles on this dashboard yet.
        </Text>
      ) : null}
      {order.map((path, i) => (
        <EditRow
          key={path}
          path={path}
          index={i}
          count={order.length}
          disabled={busy}
          onDragState={(d) => onScrollEnabled(!d)}
          onDrop={drop}
          onRemove={() => remove(path)}
          onOpen={() => setSettingsFor(path)}
        />
      ))}
      <Button
        label="Add tile"
        icon="add"
        variant="tinted"
        disabled={busy}
        onPress={() => setAdding(true)}
        testID="add-tile"
      />
      <TileSettingsSheet
        path={settingsFor}
        page={page}
        pages={pages}
        onClose={() => setSettingsFor(null)}
        onSave={async (edits) => {
          if (await save(edits)) setSettingsFor(null);
        }}
      />
      <AddTileSheet
        visible={adding}
        page={page}
        editor={editor}
        onClose={() => setAdding(false)}
        onAdd={async (path) => {
          if (await save([{ type: 'addTile', dashboard: page.id, path }])) setAdding(false);
        }}
      />
    </View>
  );
}

function TileSettingsSheet({
  path,
  page,
  pages,
  onClose,
  onSave,
}: {
  path: string | null;
  page: DashboardPage;
  pages: readonly DashboardPage[];
  onClose: () => void;
  onSave: (edits: DashboardEdit[]) => void;
}) {
  const others = pages.filter((p) => p.id !== page.id);
  return (
    <Sheet
      visible={path !== null}
      title={path ? titleOf(path) : ''}
      onClose={onClose}
      testID="tile-settings-sheet"
    >
      {path ? (
        <>
          <Text variant="footnote" mono tone="secondary">
            {path}
          </Text>
          {others.length > 0 ? (
            <Section header="Move to dashboard">
              {others.map((p) => (
                <ListRow
                  key={p.id}
                  title={p.name}
                  testID={`move-to-${p.id}`}
                  onPress={() => onSave([{ type: 'moveTile', dashboard: page.id, path, to: p.id }])}
                />
              ))}
            </Section>
          ) : null}
          <Section footer="The tile stays on this dashboard in the web console.">
            <ListRow
              title="Hide on mobile"
              testID="hide-on-mobile"
              onPress={() => onSave([{ type: 'hideTileOnMobile', dashboard: page.id, path }])}
            />
            <ListRow
              title="Remove from dashboard"
              destructive
              testID="remove-from-dashboard"
              onPress={() => onSave([{ type: 'removeTile', dashboard: page.id, path }])}
            />
          </Section>
        </>
      ) : null}
    </Sheet>
  );
}

function AddTileSheet({
  visible,
  page,
  editor,
  onClose,
  onAdd,
}: {
  visible: boolean;
  page: DashboardPage;
  editor: DashboardEditor;
  onClose: () => void;
  onAdd: (path: string) => Promise<void>;
}) {
  const [kind, setKind] = useState<TileKind | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setKind(null);
    setName('');
    setError(null);
    onClose();
  };
  const onPage = new Set(page.files.map((f) => f.path));
  const existing = kind ? filesOfKind(editor.tree, kind).filter((p) => !onPage.has(p)) : [];

  const add = async (path: string) => {
    await onAdd(path);
    setKind(null);
    setName('');
  };
  const create = async () => {
    if (!kind) return;
    const file = newTileFile(editor.tree, kind, name);
    if (!file.ok) return setError(file.error);
    setBusy(true);
    setError(null);
    try {
      await editor.onCreateFile(file.path, file.content);
      await add(file.path);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      title={kind ? `Add ${TILE_META[kind].title}` : 'Add tile'}
      onClose={close}
      testID="add-tile-sheet"
    >
      {kind === null ? (
        <Section>
          {NEW_TILE_FILES.map((s) => (
            <ListRow
              key={s.kind}
              title={TILE_META[s.kind].title}
              icon={TILE_META[s.kind].icon}
              accessory="chevron"
              testID={`add-kind-${s.kind}`}
              onPress={() => setKind(s.kind)}
            />
          ))}
        </Section>
      ) : (
        <>
          {existing.length > 0 ? (
            <Section header="Use a file">
              {existing.map((p) => (
                <ListRow
                  key={p}
                  title={nameOf(p)}
                  subtitle={p}
                  testID={`add-file-${p}`}
                  onPress={() => void add(p)}
                />
              ))}
            </Section>
          ) : null}
          <Section header="Or create one">
            <View style={{ padding: 12, gap: 12 }}>
              <TextField
                label="File name"
                value={name}
                onChangeText={setName}
                placeholder="e.g. work"
                {...(error ? { error } : {})}
                testID="new-tile-name"
                onSubmitEditing={() => void create()}
              />
              <Button
                label="Create and add"
                loading={busy}
                disabled={busy}
                onPress={() => void create()}
                testID="create-tile"
              />
            </View>
          </Section>
          <Button label="Back" variant="plain" onPress={() => setKind(null)} />
        </>
      )}
    </Sheet>
  );
}

/** Add, rename, reorder and delete dashboards. */
export function DashboardsSheet({
  visible,
  pages,
  editor,
  onClose,
}: {
  visible: boolean;
  pages: readonly DashboardPage[];
  editor: DashboardEditor;
  onClose: () => void;
}) {
  const { colors, spacing } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newName, setNewName] = useState('');

  const save = async (edits: () => Promise<DashboardEdit[]>) => {
    setBusy(true);
    setError(null);
    try {
      await editor.onEdit(await edits());
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} title="Dashboards" onClose={onClose} testID="dashboards-sheet">
      {error ? (
        <Text variant="footnote" color={colors.danger} testID="dashboards-error">
          {error}
        </Text>
      ) : null}
      {pages.map((p, i) => (
        <View
          key={p.id}
          testID={`dashboard-row-${p.id}`}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: spacing.sm,
            gap: spacing.sm,
          }}
        >
          {renaming?.id === p.id ? (
            <View style={{ gap: spacing.sm }}>
              <TextField
                label="Name"
                value={renaming.name}
                autoFocus
                autoCapitalize="sentences"
                onChangeText={(name) => setRenaming({ id: p.id, name })}
                testID={`rename-field-${p.id}`}
              />
              <Button
                label="Save name"
                size="small"
                disabled={busy}
                testID={`rename-save-${p.id}`}
                onPress={async () => {
                  const ok = await save(async () => [
                    { type: 'renameDashboard', id: p.id, name: renaming.name },
                  ]);
                  if (ok) setRenaming(null);
                }}
              />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
              <Text variant="body" style={{ flex: 1 }} numberOfLines={1}>
                {p.name}
              </Text>
              <Button
                label="Rename"
                accessibilityLabel={`Rename ${p.name}`}
                variant="plain"
                size="small"
                disabled={busy}
                testID={`rename-${p.id}`}
                onPress={() => setRenaming({ id: p.id, name: p.name })}
              />
              <Button
                label="↑"
                accessibilityLabel={`Move ${p.name} up`}
                variant="plain"
                size="small"
                disabled={busy || i === 0}
                testID={`dashboard-up-${p.id}`}
                onPress={() =>
                  void save(async () => [{ type: 'moveDashboard', id: p.id, to: i - 1 }])
                }
              />
              <Button
                label="↓"
                accessibilityLabel={`Move ${p.name} down`}
                variant="plain"
                size="small"
                disabled={busy || i === pages.length - 1}
                testID={`dashboard-down-${p.id}`}
                onPress={() =>
                  void save(async () => [{ type: 'moveDashboard', id: p.id, to: i + 1 }])
                }
              />
              <Button
                label={confirmDelete === p.id ? 'Delete?' : 'Delete'}
                accessibilityLabel={
                  confirmDelete === p.id ? `Confirm delete ${p.name}` : `Delete ${p.name}`
                }
                variant={confirmDelete === p.id ? 'destructive' : 'plain'}
                size="small"
                disabled={busy || pages.length < 2}
                testID={`dashboard-delete-${p.id}`}
                onPress={async () => {
                  if (confirmDelete !== p.id) return setConfirmDelete(p.id);
                  setConfirmDelete(null);
                  await save(async () => [{ type: 'deleteDashboard', id: p.id }]);
                }}
              />
            </View>
          )}
        </View>
      ))}
      <View style={{ gap: spacing.sm }}>
        <TextField
          label="New dashboard"
          value={newName}
          placeholder="Name"
          autoCapitalize="sentences"
          onChangeText={setNewName}
          testID="new-dashboard-name"
        />
        <Button
          label="Add dashboard"
          icon="add"
          variant="tinted"
          disabled={busy || !newName.trim()}
          testID="add-dashboard"
          onPress={async () => {
            const ok = await save(async () => [
              { type: 'addDashboard', id: await editor.newDashboardId(), name: newName },
            ]);
            if (ok) setNewName('');
          }}
        />
      </View>
    </Sheet>
  );
}
