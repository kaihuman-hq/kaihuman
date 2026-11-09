import type { LinkParam, PaletteToolSetting } from '@kaihuman/formats';
import { useState } from 'react';
import { View } from 'react-native';
import {
  addDefaultEntry,
  blankEntry,
  entryProblem,
  missingDefaults,
  movePaletteEntry,
  type PaletteEntry,
  type PaletteEntryRow,
  type PaletteSection,
  type PaletteSettingsView,
  paletteEntry,
  previewLink,
  removePaletteEntry,
  SECTION_META,
  savePaletteEntry,
} from '../../components/widgets/palette-settings-tile.js';
import { moveItem } from '../../components/widgets/travel-tile.js';
import { useTheme } from '../../theme/theme.js';
import { Badge, Button, haptics, Icon, Text, TextField } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { EmptyLine, Err, ItemRow, Rows } from './parts.js';
import { confirmDestructive, TileSheet } from './tile-sheet.js';

type Editing = { section: PaletteSection; index: number | null; seed?: PaletteEntry };

const SECTIONS: readonly { section: PaletteSection; rows: keyof PaletteSettingsView }[] = [
  { section: 'searchEngines', rows: 'engines' },
  { section: 'assistants', rows: 'assistants' },
  { section: 'tools', rows: 'tools' },
];

export function PaletteSettings({ view, ctx }: { view: PaletteSettingsView; ctx: Ctx }) {
  const { colors, spacing } = useTheme();
  const [editing, setEditing] = useState<Editing | null>(null);
  const run = (result: ReturnType<typeof removePaletteEntry>) => {
    if (ctx.apply(result)) haptics.success();
  };
  const editable = !view.invalid;
  const total = view.engines.length + view.assistants.length + view.tools.length;
  return (
    <>
      {view.problems.map((p) => (
        <View
          key={p}
          accessibilityRole="alert"
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
        >
          <Icon name="warning" size={17} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text variant="footnote" tone="danger">
              {p}
            </Text>
          </View>
        </View>
      ))}
      {SECTIONS.map(({ section, rows }) => {
        const list = view[rows] as PaletteEntryRow[];
        const meta = SECTION_META[section];
        const defaults = editable ? missingDefaults(ctx.content, section) : [];
        return (
          <View key={section} style={{ gap: spacing.sm }}>
            <Text
              variant="footnote"
              tone="secondary"
              weight="600"
              style={{ textTransform: 'uppercase' }}
            >
              {meta.title}
            </Text>
            {list.length > 0 ? (
              <Rows>
                {list.map((r, index) => (
                  <ItemRow
                    // biome-ignore lint/suspicious/noArrayIndexKey: the name is editable, so only the place identifies an entry
                    key={index}
                    testID={`palette-${section}-${index}`}
                    title={r.name || `Unnamed ${meta.noun.toLowerCase()}`}
                    label={`Edit ${r.name || meta.noun.toLowerCase()}`}
                    subtitle={r.problem ?? (r.detail || undefined)}
                    leading={
                      r.prefix ? (
                        <Text variant="subheadline" mono color={colors.accent}>
                          {r.prefix}
                        </Text>
                      ) : undefined
                    }
                    trailing={
                      r.problem ? (
                        <Badge tone="danger" label="Problem" />
                      ) : (
                        <Badge
                          tone={r.enabled ? 'success' : 'neutral'}
                          label={r.enabled ? 'On' : 'Off'}
                        />
                      )
                    }
                    onPress={editable ? () => setEditing({ section, index }) : undefined}
                    actions={
                      editable
                        ? [
                            { label: 'Edit', onPress: () => setEditing({ section, index }) },
                            ...(index > 0
                              ? [
                                  {
                                    label: 'Move up',
                                    onPress: () =>
                                      run(movePaletteEntry(ctx.content, section, index, -1)),
                                  },
                                ]
                              : []),
                            ...(index < list.length - 1
                              ? [
                                  {
                                    label: 'Move down',
                                    onPress: () =>
                                      run(movePaletteEntry(ctx.content, section, index, 1)),
                                  },
                                ]
                              : []),
                            {
                              label: 'Delete',
                              destructive: true,
                              onPress: () =>
                                confirmDestructive(
                                  `Delete ${meta.noun.toLowerCase()}?`,
                                  `"${r.name || 'Unnamed'}" will be removed from the palette.`,
                                  'Delete',
                                  () => run(removePaletteEntry(ctx.content, section, index)),
                                ),
                            },
                          ]
                        : undefined
                    }
                  />
                ))}
              </Rows>
            ) : null}
            {editable ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                <Button
                  label={`Add ${meta.noun.toLowerCase()}`}
                  icon="add"
                  size="small"
                  variant="tinted"
                  onPress={() => setEditing({ section, index: null })}
                />
                {defaults.map((d) => (
                  <Button
                    key={d.url}
                    label={`Restore ${d.name}`}
                    size="small"
                    variant="plain"
                    onPress={() => run(addDefaultEntry(ctx.content, section, d))}
                  />
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
      {total === 0 ? <EmptyLine>Nothing configured.</EmptyLine> : null}
      {editing ? (
        <EntrySheet
          key={`${editing.section}-${editing.index}`}
          editing={editing}
          ctx={ctx}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}

/** Edits one entry on a draft; nothing is written until Save. */
function EntrySheet({
  editing,
  ctx,
  onClose,
}: {
  editing: Editing;
  ctx: Ctx;
  onClose: () => void;
}) {
  const { colors, spacing } = useTheme();
  const { section, index } = editing;
  const meta = SECTION_META[section];
  const [draft, setDraft] = useState<PaletteEntry | undefined>(() =>
    index === null
      ? (editing.seed ?? blankEntry(section))
      : paletteEntry(ctx.content, section, index),
  );
  const [error, setError] = useState<string | null>(null);
  if (!draft) {
    return (
      <TileSheet title="Entry not found" onClose={onClose}>
        <Button label="Close" variant="tinted" fullWidth onPress={onClose} />
      </TileSheet>
    );
  }
  const patch = (p: Partial<PaletteEntry> & Partial<PaletteToolSetting>) =>
    setDraft({ ...draft, ...p } as PaletteEntry);
  const setParams = (params: LinkParam[]) => patch({ params });
  const replaceParam = (i: number, p: LinkParam) =>
    setParams(draft.params.map((x, j) => (j === i ? p : x)));
  const problem = entryProblem(ctx.content, section, index, draft);

  const save = (then?: (content: string) => ReturnType<typeof removePaletteEntry>) => {
    let result = savePaletteEntry(ctx.content, section, index, draft);
    if (result.ok && then && index !== null) result = then(result.content);
    if (!result.ok) {
      setError(result.error);
      haptics.error();
      return;
    }
    if (ctx.apply(result)) {
      haptics.success();
      onClose();
    }
  };
  const askDelete = () =>
    confirmDestructive(
      `Delete ${meta.noun.toLowerCase()}?`,
      `"${draft.name || 'Unnamed'}" will be removed from the palette.`,
      'Delete',
      () => {
        if (index !== null && ctx.apply(removePaletteEntry(ctx.content, section, index))) {
          haptics.success();
          onClose();
        }
      },
    );
  return (
    <TileSheet
      title={index === null ? `Add ${meta.noun.toLowerCase()}` : `Edit ${meta.noun.toLowerCase()}`}
      onClose={onClose}
      testID="palette-sheet"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Err error={error} />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Save" testID="palette-save" onPress={() => save()} fullWidth />
            </View>
            <Button label="Cancel" variant="plain" onPress={onClose} />
          </View>
          {index !== null ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <Button
                label="Save and move up"
                size="small"
                variant="outlined"
                onPress={() => save((c) => movePaletteEntry(c, section, index, -1))}
              />
              <Button
                label="Save and move down"
                size="small"
                variant="outlined"
                onPress={() => save((c) => movePaletteEntry(c, section, index, 1))}
              />
              <Button
                label="Delete"
                size="small"
                variant="destructive"
                icon="trash"
                onPress={askDelete}
              />
            </View>
          ) : null}
        </View>
      }
    >
      <Text variant="footnote" tone="secondary">
        {meta.note}
      </Text>
      {section === 'tools' ? (
        <TextField
          label="Prefix"
          value={(draft as PaletteToolSetting).prefix}
          onChangeText={(prefix) => patch({ prefix: prefix.trim().toLowerCase() })}
          placeholder="l"
        />
      ) : null}
      <TextField
        label="Name"
        value={draft.name}
        onChangeText={(name) => patch({ name })}
        autoCapitalize="words"
      />
      <TextField
        label="URL"
        value={draft.url}
        onChangeText={(url) => patch({ url })}
        placeholder={meta.placeholder}
        keyboardType="url"
      />
      {section === 'tools' ? (
        <TextField
          label="Description (optional)"
          value={(draft as PaletteToolSetting).description ?? ''}
          onChangeText={(description) => patch({ description })}
          autoCapitalize="sentences"
        />
      ) : null}

      <Text variant="footnote" tone="secondary" weight="600" style={{ textTransform: 'uppercase' }}>
        Parameters
      </Text>
      {draft.params.map((param, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: parameters have no identity but their place
        <View key={i} testID={`palette-param-${i}`} style={{ gap: spacing.sm }}>
          <TextField
            label="Parameter name"
            value={param.key}
            onChangeText={(key) => replaceParam(i, { ...param, key })}
          />
          <TextField
            label="Parameter value"
            value={param.value}
            onChangeText={(value) => replaceParam(i, { ...param, value })}
            placeholder="{query} is what is typed"
          />
          <TextField
            label="Parameter value with nothing typed (optional)"
            value={param.empty ?? ''}
            onChangeText={(empty) => {
              const { empty: _drop, ...rest } = param;
              replaceParam(i, empty ? { ...rest, empty } : rest);
            }}
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label={`Move parameter ${i + 1} up`}
              size="small"
              variant="outlined"
              disabled={i === 0}
              onPress={() => setParams(moveItem(draft.params, i, -1))}
            />
            <Button
              label={`Move parameter ${i + 1} down`}
              size="small"
              variant="outlined"
              disabled={i === draft.params.length - 1}
              onPress={() => setParams(moveItem(draft.params, i, 1))}
            />
            <Button
              label={`Remove parameter ${i + 1}`}
              size="small"
              variant="destructive"
              icon="trash"
              onPress={() => setParams(draft.params.filter((_, j) => j !== i))}
            />
          </View>
        </View>
      ))}
      <Button
        label="Add parameter"
        icon="add"
        size="small"
        variant="plain"
        onPress={() => setParams([...draft.params, { key: '', value: '' }])}
      />

      {problem ? (
        <View accessibilityRole="alert">
          <Text variant="footnote" tone="danger">
            {`Left out of the palette until fixed: ${problem}`}
          </Text>
        </View>
      ) : null}
      <Text variant="caption2" mono color={colors.secondaryLabel} testID="palette-preview">
        {`“example” → ${previewLink(draft)}`}
      </Text>
    </TileSheet>
  );
}
