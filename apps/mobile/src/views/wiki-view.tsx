import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text as RNText, ScrollView, View } from 'react-native';
import type { WikiScreenController, WikiSegment } from '../screens/wiki-screen.js';
import { type TextVariant, useTheme } from '../theme/theme.js';
import {
  BackButton,
  Chip,
  EmptyState,
  haptics,
  ListRow,
  Screen,
  Section,
  Text,
  TextField,
} from '../ui/index.js';
import { type WikiBlock, wikiBlocks, withoutTitleHeading } from './wiki-blocks.js';

const HEADING_VARIANT: Record<1 | 2 | 3, TextVariant> = { 1: 'title2', 2: 'title3', 3: 'headline' };

/** Inline runs of one block: text plus tappable `[[wikilinks]]` in accent. */
function Inlines({
  inlines,
  onOpen,
}: {
  inlines: readonly WikiSegment[];
  onOpen: (path: string) => void;
}) {
  const { colors } = useTheme();
  return inlines.map((seg, i) => {
    if (seg.type === 'text')
      // biome-ignore lint/suspicious/noArrayIndexKey: inlines are positional and static
      return <RNText key={i}>{seg.text}</RNText>;
    const target = seg.path;
    return target ? (
      <RNText
        // biome-ignore lint/suspicious/noArrayIndexKey: inlines are positional and static
        key={i}
        accessibilityRole="link"
        onPress={() => {
          haptics.selection();
          onOpen(target);
        }}
        style={{ color: colors.accent, fontWeight: '600' }}
      >
        {seg.label}
      </RNText>
    ) : (
      // biome-ignore lint/suspicious/noArrayIndexKey: inlines are positional and static
      <RNText key={i} style={{ color: colors.secondaryLabel }}>
        {seg.label}
      </RNText>
    );
  });
}

function WikiBlockView({ block, onOpen }: { block: WikiBlock; onOpen: (path: string) => void }) {
  const theme = useTheme();
  const { colors, spacing, shape } = theme;
  // Generous leading keeps long pages comfortable to read.
  const reading = { lineHeight: Math.round(theme.type.body.fontSize * 1.45) };
  switch (block.kind) {
    case 'heading':
      return (
        <Text
          variant={HEADING_VARIANT[block.level]}
          accessibilityRole="header"
          style={{ paddingTop: block.level === 3 ? spacing.xs : spacing.sm }}
        >
          <Inlines inlines={block.inlines} onOpen={onOpen} />
        </Text>
      );
    case 'bullet':
      return (
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            paddingLeft: spacing.xs + block.depth * spacing.lg,
            marginTop: -spacing.xs,
          }}
        >
          <Text tone="secondary" style={[reading, { minWidth: spacing.md }]}>
            {block.marker}
          </Text>
          <View style={{ flex: 1 }}>
            <Text style={reading}>
              <Inlines inlines={block.inlines} onOpen={onOpen} />
            </Text>
          </View>
        </View>
      );
    case 'quote':
      return (
        <View
          style={{ borderLeftWidth: 3, borderLeftColor: colors.separator, paddingLeft: spacing.md }}
        >
          <Text tone="secondary" style={reading}>
            <Inlines inlines={block.inlines} onOpen={onOpen} />
          </Text>
        </View>
      );
    case 'code':
      return (
        <View style={{ backgroundColor: colors.fill, borderRadius: shape.sm, padding: spacing.md }}>
          <Text variant="footnote" mono>
            {block.text}
          </Text>
        </View>
      );
    default:
      return (
        <Text style={reading}>
          <Inlines inlines={block.inlines} onOpen={onOpen} />
        </Text>
      );
  }
}

export function WikiView({
  controller,
  initialPath = null,
}: {
  controller: WikiScreenController;
  initialPath?: string | null;
}) {
  const theme = useTheme();
  const { colors, spacing } = theme;
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
    const { title, blocks } = withoutTitleHeading(page.title, wikiBlocks(controller.render(path)));
    const backlinks = controller.backlinks(path);
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <BackButton label="Wiki" onPress={() => setPath(null)} />
        <View style={{ gap: spacing.sm, paddingHorizontal: spacing.xs }}>
          <Text variant="title1" accessibilityRole="header">
            {title}
          </Text>
          {page.tags.length > 0 ? (
            <Text variant="footnote" tone="secondary">
              {page.tags.map((t) => `#${t}`).join('  ')}
            </Text>
          ) : null}
        </View>
        <View testID="wiki-page" style={{ paddingHorizontal: spacing.xs, gap: spacing.md }}>
          {blocks.map((block, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional and static
            <WikiBlockView key={i} block={block} onOpen={setPath} />
          ))}
        </View>
        {backlinks.length > 0 ? (
          <Section header="Linked from">
            {backlinks.map((b) => (
              <ListRow
                key={b.path}
                title={b.title}
                icon="wiki"
                iconTone="accent"
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
          action={{ label: 'Try again', onPress: () => void load() }}
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
              iconTone="accent"
              accessory="chevron"
              onPress={() => setPath(p.path)}
            />
          ))}
        </Section>
      )}
    </Screen>
  );
}
