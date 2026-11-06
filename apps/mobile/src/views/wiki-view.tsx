import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text as RNText, ScrollView, View } from 'react-native';
import type { WikiScreenController } from '../screens/wiki-screen.js';
import { useTheme } from '../theme/theme.js';
import {
  Button,
  Chip,
  EmptyState,
  haptics,
  ListRow,
  Screen,
  Section,
  Text,
  TextField,
} from '../ui/index.js';

// The reader shows the body; frontmatter is metadata already surfaced as title and tags.
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function WikiView({
  controller,
  initialPath = null,
}: {
  controller: WikiScreenController;
  initialPath?: string | null;
}) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const ios = theme.platform === 'ios';
  const tile = ios
    ? { iconBackground: colors.accentFill, iconColor: colors.onAccentFill }
    : { iconColor: colors.accent };
  const [, setRev] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(initialPath);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      await controller.load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoaded(true);
      setRev((n) => n + 1);
    }
  }, [controller]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const page = path ? controller.page(path) : undefined;

  if (page && path) {
    const segments = controller.render(path);
    const backlinks = controller.backlinks(path);
    const body = theme.type.body;
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Button
          label="All pages"
          variant="plain"
          size="medium"
          accessibilityLabel="Back to all pages"
          onPress={() => setPath(null)}
        />
        <View style={{ gap: spacing.sm, paddingHorizontal: spacing.xs }}>
          <Text variant="title1" accessibilityRole="header">
            {page.title}
          </Text>
          {page.tags.length > 0 ? (
            <Text variant="footnote" tone="secondary">
              {page.tags.map((t) => `#${t}`).join('  ')}
            </Text>
          ) : null}
        </View>
        <View testID="wiki-page" style={{ paddingHorizontal: spacing.xs, paddingTop: spacing.sm }}>
          <RNText
            selectable
            style={{
              ...body,
              // Generous leading and a capped measure keep long pages comfortable to read.
              lineHeight: Math.round((body.fontSize ?? 17) * 1.5),
              color: colors.label,
              fontFamily: theme.fontFamily.system,
            }}
          >
            {segments.map((seg, i) => {
              if (seg.type === 'text')
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and static
                  <RNText key={i}>
                    {i === 0 ? seg.text.replace(FRONTMATTER, '').trimStart() : seg.text}
                  </RNText>
                );
              return seg.path ? (
                <RNText
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and static
                  key={i}
                  accessibilityRole="link"
                  onPress={() => {
                    haptics.selection();
                    if (seg.path) setPath(seg.path);
                  }}
                  style={{ color: colors.accent, fontWeight: '600' }}
                >
                  {seg.label}
                </RNText>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and static
                <RNText key={i} style={{ color: colors.secondaryLabel }}>
                  {seg.label}
                </RNText>
              );
            })}
          </RNText>
        </View>
        {backlinks.length > 0 ? (
          <Section header="Linked from">
            {backlinks.map((b) => (
              <ListRow
                key={b.path}
                title={b.title}
                icon="wiki"
                {...tile}
                accessory="chevron"
                onPress={() => setPath(b.path)}
              />
            ))}
          </Section>
        ) : null}
      </Screen>
    );
  }

  const q = query.trim().toLowerCase();
  const pages = controller
    .list()
    .filter((p) => !q || p.title.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q)));
  const tags = controller.allTags();

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <TextField
        label="Search pages"
        value={query}
        onChangeText={setQuery}
        placeholder="Title or tag"
        returnKeyType="search"
      />
      {tags.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginHorizontal: -theme.metrics.screenMargin }}
          contentContainerStyle={{
            gap: spacing.sm,
            paddingHorizontal: theme.metrics.screenMargin,
            paddingVertical: spacing.xs,
          }}
        >
          <Chip
            label="All"
            selected={tag === null}
            onPress={() => {
              haptics.selection();
              controller.setTag(null);
              setTag(null);
            }}
          />
          {tags.map((t) => (
            <Chip
              key={t}
              label={`#${t}`}
              selected={tag === t}
              onPress={() => {
                haptics.selection();
                controller.setTag(t);
                setTag(t);
              }}
            />
          ))}
        </ScrollView>
      ) : null}
      {!loaded ? (
        <View style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.sm }}>
          <ActivityIndicator color={colors.secondaryLabel} />
          <Text variant="footnote" tone="secondary">
            Loading pages
          </Text>
        </View>
      ) : error ? (
        <EmptyState
          icon="warning"
          title="Couldn't load the wiki"
          message={error}
          action={{ label: 'Retry', onPress: () => void load() }}
        />
      ) : pages.length === 0 ? (
        q || tag ? (
          <EmptyState
            icon="search"
            title="No matching pages"
            message="Try a different search or tag."
          />
        ) : (
          <EmptyState icon="wiki" title="No wiki pages" message="Pages in .kh/wiki appear here." />
        )
      ) : (
        <Section footer={`${pages.length} ${pages.length === 1 ? 'page' : 'pages'}`}>
          {pages.map((p) => (
            <ListRow
              key={p.path}
              title={p.title}
              subtitle={p.tags.length ? p.tags.map((t) => `#${t}`).join('  ') : undefined}
              icon="wiki"
              {...tile}
              accessory="chevron"
              onPress={() => setPath(p.path)}
            />
          ))}
        </Section>
      )}
    </Screen>
  );
}
