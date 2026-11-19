import { useCallback, useEffect, useState } from 'react';
import type { BraindumpsScreenController } from '../screens/braindumps-screen.js';
import { useFocusRefresh, useSyncRevision } from '../sync/hooks.js';
import { EmptyState, ListRow, Screen, Section } from '../ui/index.js';

/** Braindump list with a "New braindump" row on top (a Fab would be missing on iOS). */
export function BraindumpsView({
  controller,
  onOpen,
  onNew,
}: {
  controller: BraindumpsScreenController;
  onOpen: (path: string) => void;
  onNew: () => void;
}) {
  const [, setRev] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const rev = useSyncRevision();
  useFocusRefresh();

  const load = useCallback(async () => {
    try {
      setFailed(false);
      await controller.load();
    } catch {
      setFailed(true);
    } finally {
      setLoaded(true);
      setRev((n) => n + 1);
    }
  }, [controller]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` re-reads after a sync
  useEffect(() => {
    void load();
  }, [load, rev]);

  const items = controller.items();
  return (
    <Screen pullSearch>
      <Section>
        <ListRow
          testID="braindump-new"
          title="New braindump"
          icon="add"
          iconTone="accent"
          onPress={onNew}
        />
      </Section>
      {!loaded ? null : items.length === 0 ? (
        <EmptyState
          icon={failed ? 'warning' : 'note'}
          title={failed ? "Couldn't load braindumps" : 'No braindumps yet'}
          message={
            failed ? 'Check your connection and try again.' : 'Dump a thought, sort it later.'
          }
          action={{
            label: failed ? 'Try again' : 'New braindump',
            onPress: failed ? () => void load() : onNew,
          }}
        />
      ) : (
        <Section animated>
          {items.map((i) => (
            <ListRow
              key={i.path}
              title={i.title}
              subtitle={new Date(i.createdAt).toLocaleString()}
              icon="note"
              iconTone="neutral"
              accessory="chevron"
              onPress={() => onOpen(i.path)}
            />
          ))}
        </Section>
      )}
    </Screen>
  );
}
