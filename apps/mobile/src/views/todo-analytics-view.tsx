import { useEffect, useState } from 'react';
import type { TimeFrame, TodoAnalyticsController } from '../screens/todo-analytics.js';
import { Body, Button, Card, Muted, Row, Screen, Title } from './primitives.js';

const FRAMES: TimeFrame[] = ['4W', '13W', '52W', 'ALL'];

export function TodoAnalyticsView({ controller }: { controller: TodoAnalyticsController }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<TimeFrame>('13W');

  useEffect(() => {
    let live = true;
    controller
      .load()
      .catch((err: unknown) => live && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => live && setLoaded(true));
    return () => {
      live = false;
    };
  }, [controller]);

  if (!loaded) {
    return (
      <Screen>
        <Title>Todo analytics</Title>
        <Muted>Loading</Muted>
      </Screen>
    );
  }

  const summary = controller.summary();
  return (
    <Screen scroll>
      <Title>Todo analytics</Title>
      {error ? <Body>{`Error: ${error}`}</Body> : null}
      <Card>
        <Body>{`Total: ${summary.total}`}</Body>
        <Body>{`Completion: ${summary.completionRate === null ? 'n/a' : `${summary.completionRate}%`}`}</Body>
        {Object.entries(summary.byStatus).map(([status, count]) => (
          <Muted key={status}>{`${status}: ${count}`}</Muted>
        ))}
      </Card>
      <Row>
        {FRAMES.map((f) => (
          <Button
            key={f}
            label={f === frame ? `[${f}]` : f}
            testID={`frame-${f}`}
            onPress={() => setFrame(f)}
          />
        ))}
      </Row>
      <Card>
        <Body>Done per week</Body>
        {controller.velocity(frame).map((p) => (
          <Muted key={p.week}>{`${p.week}: ${p.count}`}</Muted>
        ))}
      </Card>
      <Card>
        <Body>Tags</Body>
        {controller.tagDistribution().map((t) => (
          <Muted key={t.tag}>{`#${t.tag}: ${t.count}`}</Muted>
        ))}
      </Card>
      <Card>
        <Body>Milestones</Body>
        {controller.milestoneProgress().map((m) => (
          <Muted key={m.milestone.id}>{`${m.milestone.name}: ${m.donePct}% of ${m.total}`}</Muted>
        ))}
      </Card>
    </Screen>
  );
}
