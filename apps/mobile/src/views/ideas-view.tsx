import type { IdeaSlug } from '@kaihuman/formats';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { IdeaStatusFilter, IdeasScreenController } from '../screens/ideas-screen.js';
import { Body, Button, Card, Field, Muted, Row, Screen, Title } from './primitives.js';

const STATUSES = ['seed', 'exploring', 'committed', 'shipped', 'parked', 'dropped'] as const;

export function IdeasView({ controller }: { controller: IdeasScreenController }) {
  const [, setRev] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IdeaSlug | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  const rerender = () => setRev((n) => n + 1);
  useEffect(() => {
    controller
      .load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoaded(true));
  }, [controller]);

  // Controller calls can reject (offline, conflicts); show that instead of dropping the input.
  const run = async (action: () => Promise<unknown>) => {
    try {
      setError(null);
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    rerender();
  };

  const filter = (patch: Parameters<IdeasScreenController['setFilters']>[0]) => {
    controller.setFilters(patch);
    rerender();
  };

  const entry = selected ? controller.get(selected) : undefined;
  const entries = controller.view();

  return (
    <Screen scroll>
      <Title>Ideas</Title>
      {error && (
        <View accessibilityRole="alert">
          <Body>{error}</Body>
        </View>
      )}
      {!loaded && <Muted>Loading...</Muted>}
      <Field
        label="Search ideas"
        value={controller.filters.query}
        onChangeText={(query) => filter({ query })}
      />
      <Row>
        {controller.chips().map((c) => (
          <Button
            key={c.status}
            testID={`chip-${c.status}`}
            label={`${c.status} (${c.count})`}
            disabled={controller.filters.status === c.status}
            onPress={() => filter({ status: c.status as IdeaStatusFilter })}
          />
        ))}
      </Row>
      {loaded && entries.length === 0 && <Muted>No ideas</Muted>}
      {entries.map((e) => (
        <Card key={e.slug}>
          <Body>{e.idea.title}</Body>
          <Muted>{`${e.idea.status} - ${e.activity.level}${e.idea.product ? ` - ${e.idea.product}` : ''}`}</Muted>
          <Button label="Open" testID={`open-${e.slug}`} onPress={() => setSelected(e.slug)} />
        </Card>
      ))}
      {entry && selected && (
        <Card>
          <Title>{entry.idea.title}</Title>
          <Muted>{entry.idea.status}</Muted>
          {entry.idea.summary ? <Body>{entry.idea.summary}</Body> : null}
          {entry.idea.log.slice(0, 5).map((l) => (
            <Muted key={`${l.at}-${l.text}`}>{`${l.at} ${l.text}`}</Muted>
          ))}
          <Field label="Log entry" value={text} onChangeText={setText} />
          <Button
            label="Add log"
            onPress={() => {
              void run(() => controller.log(selected, text));
              setText('');
            }}
          />
          <Row>
            {STATUSES.map((s) => (
              <Button
                key={s}
                label={s}
                testID={`status-${s}`}
                disabled={entry.idea.status === s}
                onPress={() => void run(() => controller.setStatus(selected, s))}
              />
            ))}
          </Row>
        </Card>
      )}
      <Field label="New idea title" value={title} onChangeText={setTitle} />
      <Button
        label="Create idea"
        disabled={!title.trim()}
        onPress={() => {
          void run(async () => {
            setSelected(await controller.create({ title: title.trim() }));
            setTitle('');
          });
        }}
      />
    </Screen>
  );
}
