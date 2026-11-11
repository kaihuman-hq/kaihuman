import { appFolderFor } from '@kaihuman/core';
import { useState } from 'react';
import { normalizeFolder, rememberFolder } from '../files/create-target.js';
import { NEW_FILE_KINDS, type NewFileKind, newFile } from '../screens/new-file.js';
import { Button, ErrorBoundary, errorMessage, ListRow, Section } from '../ui/index.js';
import { CreateTargetRow, useCreateTarget } from './create-target-row.js';
import { TILE_META } from './tile-view.js';
import { TileSheet } from './tiles/tile-sheet.js';

const labelOf = (kind: NewFileKind) =>
  kind.id === 'note' ? 'Note' : (TILE_META[kind.id as keyof typeof TILE_META]?.title ?? kind.id);

export interface NewFileSheetProps {
  /** The folder open in the browser: the picker starts there. */
  folder: string;
  /** Repo file paths: the folder list and the collision check. */
  paths: readonly string[];
  onCreate: (path: string, content: string) => Promise<void>;
  /** After the file exists, e.g. to open it. */
  onCreated: (path: string) => void;
  onClose: () => void;
}

/** File browser "New file": pick a kind, then folder (the open one) and name. */
export function NewFileSheet({ folder, paths, onCreate, onCreated, onClose }: NewFileSheetProps) {
  const [kind, setKind] = useState<NewFileKind | null>(null);
  return (
    <TileSheet
      title={kind ? `New ${labelOf(kind)}` : 'New file'}
      onClose={onClose}
      testID="new-file-sheet"
    >
      {/* A failing form must not take the browser (or the app) down with it. */}
      <ErrorBoundary what="the new file form" resetKey={kind}>
        {kind ? (
          <NewFileForm
            key={kind.id}
            kind={kind}
            folder={folder}
            paths={paths}
            onCreate={onCreate}
            onCreated={onCreated}
            onBack={() => setKind(null)}
          />
        ) : (
          <Section>
            {NEW_FILE_KINDS.map((k) => (
              <ListRow
                key={k.id}
                title={labelOf(k)}
                subtitle={k.spec.suffix}
                icon={
                  k.id === 'note'
                    ? 'document'
                    : (TILE_META[k.id as keyof typeof TILE_META]?.icon ?? 'document')
                }
                accessory="chevron"
                testID={`new-file-kind-${k.id}`}
                onPress={() => setKind(k)}
              />
            ))}
          </Section>
        )}
      </ErrorBoundary>
    </TileSheet>
  );
}

function NewFileForm({
  kind,
  folder,
  paths,
  onCreate,
  onCreated,
  onBack,
}: Omit<NewFileSheetProps, 'onClose'> & { kind: NewFileKind; onBack: () => void }) {
  const appFolder = appFolderFor(paths);
  const place = useCreateTarget(kind.spec, appFolder, undefined, folder);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    const file = newFile(kind, place.target, paths);
    if (!file.ok) return setError(file.error);
    setBusy(true);
    setError(null);
    try {
      await onCreate(file.path, file.content);
      rememberFolder(kind.spec.id, normalizeFolder(place.target.folder) ?? '');
      onCreated(file.path);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CreateTargetRow
        spec={kind.spec}
        state={{
          ...place,
          setName: (v) => {
            setError(null);
            place.setName(v);
          },
        }}
        appFolder={appFolder}
        paths={paths}
        initiallyOpen
        error={error}
        onSubmit={() => void create()}
      />
      <Button
        label="Create"
        loading={busy}
        disabled={busy}
        onPress={() => void create()}
        testID="new-file-create"
      />
      <Button label="Back" variant="plain" onPress={onBack} />
    </>
  );
}
