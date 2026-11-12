import { Pressable, Text as RNText, View } from 'react-native';
import type { SearchDoc, SearchKind } from '../search/documents.js';
import type { SearchGroup, Segment } from '../search/search.js';
import { useTheme } from '../theme/theme.js';
import { EmptyState, Icon, type IconName, Screen, Section, Text, TextField } from '../ui/index.js';

export interface SearchViewProps {
  query: string;
  onQueryChange: (query: string) => void;
  groups: SearchGroup[];
  recents: string[];
  onOpen: (doc: SearchDoc) => void;
  onPickRecent: (query: string) => void;
  onClearRecents: () => void;
  /** An in-view field, for platforms without a native header search bar. */
  showField: boolean;
}

const KIND_ICON: Record<SearchKind, IconName> = {
  todo: 'todo',
  idea: 'ideas',
  wiki: 'wiki',
  knowledge: 'knowledge',
  note: 'note',
  log: 'log',
  bookmark: 'bookmark',
  file: 'document',
};

/** Matched segments get the accent colour and weight; the rest inherit the line's own style. */
function Highlighted({ segments, accent }: { segments: Segment[]; accent: string }) {
  return (
    <>
      {segments.map((s, i) =>
        s.match ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and never reordered
          <RNText key={i} testID="match" style={{ color: accent, fontWeight: '600' }}>
            {s.text}
          </RNText>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional and never reordered
          <RNText key={i}>{s.text}</RNText>
        ),
      )}
    </>
  );
}

function ResultRow({
  result,
  onOpen,
}: {
  result: SearchGroup['results'][number];
  onOpen: (doc: SearchDoc) => void;
}) {
  const { colors, spacing, metrics } = useTheme();
  const { doc } = result;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={doc.title}
      onPress={() => onOpen(doc)}
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'flex-start',
        minHeight: metrics.hitTarget,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
      }}
    >
      <View style={{ paddingTop: 2 }}>
        <Icon name={KIND_ICON[doc.kind]} size={18} color={colors.secondaryLabel} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text numberOfLines={2}>
          <Highlighted segments={result.title} accent={colors.accent} />
        </Text>
        {doc.subtitle ? (
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {doc.subtitle}
          </Text>
        ) : null}
        {result.snippet ? (
          <Text variant="footnote" tone="secondary" numberOfLines={2}>
            <Highlighted segments={result.snippet} accent={colors.accent} />
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export function SearchView({
  query,
  onQueryChange,
  groups,
  recents,
  onOpen,
  onPickRecent,
  onClearRecents,
  showField,
}: SearchViewProps) {
  const { spacing } = useTheme();
  const trimmed = query.trim();

  return (
    <Screen keyboard syncStatus={false} title="Search" scrollToTopKey={trimmed}>
      {showField ? (
        <TextField
          label="Search"
          value={query}
          onChangeText={onQueryChange}
          placeholder="Search kaihuman"
          returnKeyType="search"
          autoFocus
        />
      ) : null}
      {trimmed === '' ? (
        recents.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: spacing.xs,
              }}
            >
              <Text variant="footnote" tone="secondary" accessibilityRole="header">
                Recent searches
              </Text>
              <Pressable accessibilityRole="button" hitSlop={8} onPress={onClearRecents}>
                <Text variant="footnote" tone="accent">
                  Clear
                </Text>
              </Pressable>
            </View>
            <Section>
              {recents.map((q) => (
                <Pressable
                  key={q}
                  accessibilityRole="button"
                  accessibilityLabel={`Search ${q}`}
                  onPress={() => onPickRecent(q)}
                  style={{
                    flexDirection: 'row',
                    gap: spacing.md,
                    alignItems: 'center',
                    padding: spacing.md,
                  }}
                >
                  <Icon name="clock" size={16} />
                  <Text>{q}</Text>
                </Pressable>
              ))}
            </Section>
          </View>
        ) : (
          <EmptyState
            icon="search"
            title="Search todos, ideas, wiki, files…"
            message="Everything cached on this device is searched, even offline."
          />
        )
      ) : groups.length === 0 ? (
        <EmptyState
          icon="search"
          title={`No results for “${trimmed}”`}
          message="Try fewer words. Files you have not opened yet match by name only."
        />
      ) : (
        groups.map((g) => (
          <Section key={g.kind} header={`${g.label} (${g.total})`}>
            {g.results.map((r) => (
              <ResultRow key={r.doc.id} result={r} onOpen={onOpen} />
            ))}
          </Section>
        ))
      )}
    </Screen>
  );
}
