import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import type { WikiScreenController } from '../screens/wiki-screen.js';
import { colors, typography } from '../theme/tokens.js';
import { Body, Button, Card, Muted, Row, Screen, Title } from './primitives.js';

export function WikiView({
  controller,
  initialPath = null,
}: {
  controller: WikiScreenController;
  initialPath?: string | null;
}) {
  const [, setRev] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(initialPath);

  useEffect(() => {
    controller
      .load()
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoaded(true));
  }, [controller]);

  const page = path ? controller.page(path) : undefined;

  if (page && path) {
    const base = { fontFamily: typography.mono, fontSize: typography.sizes.body };
    return (
      <Screen scroll>
        <Button label="Back to pages" onPress={() => setPath(null)} />
        <Title>{page.title}</Title>
        <View testID="wiki-page">
          <Text style={{ ...base, color: colors.text }}>
            {controller.render(path).map((seg, i) =>
              seg.type === 'text' ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and static
                <Text key={i}>{seg.text}</Text>
              ) : seg.path ? (
                <Text
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and static
                  key={i}
                  accessibilityRole="link"
                  onPress={() => seg.path && setPath(seg.path)}
                  style={{ color: colors.accent }}
                >
                  {seg.label}
                </Text>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and static
                <Text key={i} style={{ color: colors.muted }}>
                  {seg.label}
                </Text>
              ),
            )}
          </Text>
        </View>
        {controller.backlinks(path).length > 0 && <Muted>Linked from</Muted>}
        {controller.backlinks(path).map((b) => (
          <Button key={b.path} label={b.title} onPress={() => setPath(b.path)} />
        ))}
      </Screen>
    );
  }

  const pages = controller.list();
  return (
    <Screen scroll>
      <Title>Wiki</Title>
      {error && (
        <View accessibilityRole="alert">
          <Body>{error}</Body>
        </View>
      )}
      {!loaded && <Muted>Loading...</Muted>}
      {loaded && pages.length === 0 && <Muted>No wiki pages</Muted>}
      <Row>
        {controller.allTags().map((t) => (
          <Button
            key={t}
            label={`#${t}`}
            onPress={() => {
              controller.setTag(t);
              setRev((n) => n + 1);
            }}
          />
        ))}
        {controller.allTags().length > 0 && (
          <Button
            label="All"
            onPress={() => {
              controller.setTag(null);
              setRev((n) => n + 1);
            }}
          />
        )}
      </Row>
      {pages.map((p) => (
        <Card key={p.path}>
          <Body>{p.title}</Body>
          <Button label={`Open ${p.title}`} onPress={() => setPath(p.path)} />
        </Card>
      ))}
    </Screen>
  );
}
