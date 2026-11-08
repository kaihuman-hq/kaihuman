import { useMemo } from 'react';
import { Text as RNText, ScrollView, View } from 'react-native';
import { csvView, jsonView, markdownBlocks, yamlView } from '../files/doc-views.js';
import { useTheme } from '../theme/theme.js';
import { Icon, Text } from '../ui/index.js';
import { WikiBlockView } from './wiki-view.js';

const noop = () => {};

/** Rendered Markdown, with the same block styles as the wiki reader. */
export function MarkdownReader({ content }: { content: string }) {
  const { spacing } = useTheme();
  const blocks = useMemo(() => markdownBlocks(content), [content]);
  if (blocks.length === 0) return <Text tone="secondary">Empty file</Text>;
  return (
    <View testID="reader-markdown" style={{ gap: spacing.md }}>
      {blocks.map((block, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: blocks are positional and static
        <WikiBlockView key={i} block={block} onOpen={noop} />
      ))}
    </View>
  );
}

const CELL_WIDTH = 140;

/** A table that scrolls sideways, so wide sheets keep their columns readable. */
export function CsvTable({ content, path }: { content: string; path: string }) {
  const { colors, spacing, shape } = useTheme();
  const view = useMemo(() => csvView(content, path), [content, path]);
  if (view.header.length === 0 && view.rows.length === 0) {
    return <Text tone="secondary">Empty file</Text>;
  }
  const cell = (text: string, key: number, head: boolean) => (
    <View key={key} style={{ width: CELL_WIDTH, paddingHorizontal: spacing.sm }}>
      <Text variant="footnote" weight={head ? '600' : '400'} mono={!head} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
  return (
    <View testID="reader-csv" style={{ gap: spacing.sm }}>
      <ScrollView
        horizontal
        accessibilityLabel="Table"
        style={{ backgroundColor: colors.surface, borderRadius: shape.md }}
      >
        <View style={{ paddingVertical: spacing.sm }}>
          <View
            style={{
              flexDirection: 'row',
              paddingBottom: spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: colors.separator,
            }}
          >
            {view.header.map((h, i) => cell(h, i, true))}
          </View>
          {view.rows.map((row, r) => (
            <View
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional and static
              key={r}
              style={{ flexDirection: 'row', paddingTop: spacing.sm }}
            >
              {view.header.map((_, c) => cell(row[c] ?? '', c, false))}
            </View>
          ))}
        </View>
      </ScrollView>
      <Text variant="footnote" tone="secondary">
        {view.truncated
          ? `Showing ${view.rows.length} of ${view.rowCount} rows`
          : `${view.rowCount} ${view.rowCount === 1 ? 'row' : 'rows'}`}
      </Text>
    </View>
  );
}

/** Mono text that scrolls sideways instead of wrapping, so structure stays aligned. */
function MonoBlock({ children }: { children: string }) {
  const { colors, spacing, shape } = useTheme();
  return (
    <ScrollView
      horizontal
      style={{ backgroundColor: colors.surface, borderRadius: shape.md }}
      contentContainerStyle={{ padding: spacing.md }}
    >
      <Text variant="footnote" mono>
        {children}
      </Text>
    </ScrollView>
  );
}

export function JsonReader({ content }: { content: string }) {
  const { colors, spacing, shape } = useTheme();
  const view = useMemo(() => jsonView(content), [content]);
  if (!view.ok) {
    return (
      <View
        accessibilityRole="alert"
        testID="reader-json-error"
        style={{
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: spacing.sm,
          padding: spacing.md,
          borderRadius: shape.md,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.danger,
        }}
      >
        <Icon name="warning" size={17} color={colors.danger} />
        <View style={{ flex: 1 }}>
          <Text variant="subheadline" tone="danger">
            {`Not valid JSON: ${view.error}`}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View testID="reader-json" style={{ gap: spacing.sm }}>
      <Text variant="footnote" tone="secondary">
        {view.summary}
      </Text>
      <MonoBlock>{view.pretty}</MonoBlock>
    </View>
  );
}

const INDENT_PX = 6;

export function YamlReader({ content }: { content: string }) {
  const { colors, spacing, shape } = useTheme();
  const lines = useMemo(() => yamlView(content), [content]);
  if (lines.length === 0) return <Text tone="secondary">Empty file</Text>;
  return (
    <ScrollView
      horizontal
      testID="reader-yaml"
      style={{ backgroundColor: colors.surface, borderRadius: shape.md }}
      contentContainerStyle={{ padding: spacing.md }}
    >
      <View style={{ gap: spacing.xxs }}>
        {lines.map((line, i) => (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional and static
            key={i}
            variant="footnote"
            mono
            tone={line.comment ? 'secondary' : 'primary'}
            style={{ paddingLeft: line.indent * INDENT_PX }}
          >
            {line.comment ? (
              line.value
            ) : (
              <>
                {line.listItem ? (
                  <RNText style={{ color: colors.secondaryLabel }}>{'- '}</RNText>
                ) : null}
                {line.key !== null ? (
                  <RNText style={{ color: colors.accent, fontWeight: '600' }}>{line.key}:</RNText>
                ) : null}
                {line.value ? ` ${line.value}` : ''}
              </>
            )}
          </Text>
        ))}
      </View>
    </ScrollView>
  );
}

export function TextReader({ content }: { content: string }) {
  if (!content) return <Text tone="secondary">Empty file</Text>;
  return (
    <View testID="reader-text">
      <MonoBlock>{content}</MonoBlock>
    </View>
  );
}

/** Shown above the source editor for kinds the app cannot render yet. */
export function NoViewerNote({ ext }: { ext: string }) {
  const { colors, spacing, shape } = useTheme();
  return (
    <View
      testID="no-viewer"
      accessibilityRole="alert"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        padding: spacing.md,
        borderRadius: shape.md,
        backgroundColor: colors.accentSoft,
      }}
    >
      <Icon name="info" size={17} color={colors.onAccentSoft} />
      <View style={{ flex: 1 }}>
        <Text variant="subheadline">
          {ext
            ? `No viewer for .${ext} yet. You can edit the source.`
            : 'No viewer for this file yet.'}
        </Text>
      </View>
    </View>
  );
}
