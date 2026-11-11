import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  type CreateSpec,
  type CreateTarget,
  fileNameFor,
  initialFolder,
  joinPath,
  loadLastFolders,
  normalizeFolder,
  type ResolvedTarget,
  repoFolders,
  resolveTarget,
} from '../files/create-target.js';
import { useTheme } from '../theme/theme.js';
import { Icon, ListRow, Section, Text, TextField } from '../ui/index.js';

const MAX_FOLDERS = 8;

export interface CreateTargetState {
  target: CreateTarget;
  /** The user changed the folder or the name, so the kind's built-in path no longer applies. */
  custom: boolean;
  setFolder: (folder: string) => void;
  setName: (name: string) => void;
  /** Back to the defaults after a save; the remembered folder is read again. */
  reset: () => void;
}

/**
 * Folder and name for a new file. The name follows the kind's default (and `hint`, e.g. the
 * capture's first line) until the user edits it, so the one-tap path needs no input.
 */
export function useCreateTarget(
  spec: CreateSpec,
  appFolder: string,
  hint?: string,
): CreateTargetState {
  const [folder, setFolder] = useState(() => initialFolder(spec, loadLastFolders(), appFolder));
  const [typed, setTyped] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  return {
    target: { folder, name: typed ?? spec.defaultName(now, hint) },
    custom: typed !== null || folder !== spec.defaultFolder(appFolder),
    setFolder,
    setName: setTyped,
    reset: () => {
      setFolder(initialFolder(spec, loadLastFolders(), appFolder));
      setTyped(null);
    },
  };
}

export interface CreateTargetRowProps {
  spec: CreateSpec;
  state: CreateTargetState;
  appFolder: string;
  /** Repo file paths: the folder list and the collision check. */
  paths: readonly string[];
  /** Start with the fields open, where choosing the file is the point (the add-tile picker). */
  initiallyOpen?: boolean;
  /** A save error to show under the name. */
  error?: string | null;
  onSubmit?: () => void;
}

/** `Saves to …` row that opens into a folder picker and a file-name field. */
export function CreateTargetRow({
  spec,
  state,
  appFolder,
  paths,
  initiallyOpen = false,
  error,
  onSubmit,
}: CreateTargetRowProps) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const { target, setFolder, setName } = state;
  const folders = useMemo(() => repoFolders(paths, appFolder), [paths, appFolder]);
  const resolved = resolveTarget(spec, target, paths);
  const preview = joinPath(
    normalizeFolder(target.folder) ?? target.folder,
    fileNameFor(target.name, spec.suffix) ?? spec.suffix,
  );
  const query = target.folder.trim().toLowerCase();
  const matches = folders
    .filter((f) => f !== target.folder && f.toLowerCase().includes(query))
    .slice(0, MAX_FOLDERS);
  const shownError = error ?? (resolved.ok ? null : resolved.error);
  const isNew = !folders.includes(normalizeFolder(target.folder) ?? '');

  if (!open) {
    return (
      <Pressable
        testID="create-target-row"
        accessibilityRole="button"
        accessibilityLabel={`Saves to ${preview}`}
        accessibilityHint="Choose the folder and file name"
        onPress={() => setOpen(true)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <Icon name="folder" size={16} color={colors.secondaryLabel} />
        <View style={{ flex: 1 }}>
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {preview}
          </Text>
        </View>
        <Icon name="chevronRight" size={14} color={colors.tertiaryLabel} />
      </Pressable>
    );
  }

  return (
    <View style={{ gap: spacing.sm }} testID="create-target">
      <TextField
        label="Folder"
        value={target.folder}
        onChangeText={setFolder}
        placeholder="Repo root"
        helper={isNew && target.folder.trim() ? 'A new folder is created.' : undefined}
        testID="create-target-folder"
      />
      {matches.length > 0 ? (
        <Section>
          {matches.map((f) => (
            <ListRow
              key={f || '/'}
              title={f || 'Repo root'}
              icon="folder"
              testID={`create-folder-${f || '/'}`}
              onPress={() => setFolder(f)}
            />
          ))}
        </Section>
      ) : null}
      <TextField
        label="File name"
        value={target.name}
        onChangeText={setName}
        helper={helperFor(resolved, spec.suffix)}
        {...(shownError && { error: shownError })}
        returnKeyType="done"
        {...(onSubmit && { onSubmitEditing: onSubmit })}
        testID="create-target-name"
      />
    </View>
  );
}

const helperFor = (resolved: ResolvedTarget, suffix: string): string =>
  !resolved.ok
    ? `Ends in ${suffix}.`
    : resolved.exists
      ? `Adds to ${resolved.path}`
      : `Creates ${resolved.path}`;
