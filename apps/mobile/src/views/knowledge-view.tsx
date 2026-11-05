import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { KnowledgeScreenController } from '../screens/knowledge-screen.js';
import { Body, Button, Card, Field, Muted, Screen, Title } from './primitives.js';

export function KnowledgeView({ controller }: { controller: KnowledgeScreenController }) {
  const [, setRev] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    controller
      .load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoaded(true));
  }, [controller]);

  const add = async () => {
    try {
      setError(null);
      await controller.addNote(text);
      setText('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setRev((n) => n + 1);
  };

  const inbox = controller.inbox();
  return (
    <Screen scroll>
      <Title>Knowledge inbox</Title>
      {error && (
        <View accessibilityRole="alert">
          <Body>{error}</Body>
        </View>
      )}
      {!loaded && <Muted>Loading...</Muted>}
      {loaded && inbox.length === 0 && <Muted>Inbox is empty</Muted>}
      {inbox.map((item) => (
        <Card key={item.path}>
          <Body>{item.title}</Body>
          <Muted>{item.name}</Muted>
        </Card>
      ))}
      <Muted>{`${controller.processed().length} processed`}</Muted>
      <Field label="New note" value={text} onChangeText={setText} multiline />
      <Button label="Add note" disabled={!text.trim()} onPress={() => void add()} />
    </Screen>
  );
}
