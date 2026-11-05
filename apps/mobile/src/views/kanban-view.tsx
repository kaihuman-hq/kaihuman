import { useEffect, useState } from 'react';
import type { KanbanBoardController } from '../screens/kanban-board.js';
import { TODO_STATUSES } from '../screens/kanban-board.js';
import { Body, Button, Card, Muted, Screen, Title } from './primitives.js';

export function KanbanView({ controller }: { controller: KanbanBoardController }) {
  // The controller is mutable, not signal-based: bump to re-read after load/moves.
  const [, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    controller
      .load()
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => {
        if (live) {
          setLoading(false);
          setVersion((v) => v + 1);
        }
      });
    return () => {
      live = false;
    };
  }, [controller]);

  const move = async (path: string, index: number, status: (typeof TODO_STATUSES)[number]) => {
    const res = await controller.setStatus(path, index, status);
    setError(res.ok ? null : res.error);
    setVersion((v) => v + 1);
  };

  const columns = controller.columns();

  return (
    <Screen scroll>
      <Title>Board</Title>
      {loading ? <Muted>Loading</Muted> : null}
      {error ? <Body>{`Error: ${error}`}</Body> : null}
      {TODO_STATUSES.map((status) => (
        <Card key={status}>
          <Body>{`${status} (${columns[status].length})`}</Body>
          {columns[status].map(({ item, itemIndex, filePath }) => (
            <Card key={`${filePath}:${itemIndex}`}>
              <Body>{item.text}</Body>
              {item.tags.length ? <Muted>{item.tags.map((t) => `#${t}`).join(' ')}</Muted> : null}
              {TODO_STATUSES.filter((s) => s !== status).map((s) => (
                <Button
                  key={s}
                  label={`Move to ${s}`}
                  testID={`move-${itemIndex}-${s}`}
                  onPress={() => void move(filePath, itemIndex, s)}
                />
              ))}
            </Card>
          ))}
        </Card>
      ))}
    </Screen>
  );
}
