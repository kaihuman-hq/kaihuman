import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import {
  actionLogList,
  actionLogReport,
  actionLogStats,
  logAction,
  parseTagInput,
} from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { Button, Chip, haptics, Icon, SegmentedControl, Text, TextField } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { EmptyLine, ItemRow, QuickAdd, Rows, Stat, StatRow } from './parts.js';

const RECENT = 5;
type Mode = 'log' | 'report';

export function ActionLog({ ctx }: { ctx: Ctx }) {
  const [mode, setMode] = useState<Mode>('log');
  return (
    <>
      <SegmentedControl
        options={[
          { value: 'log', label: 'Log' },
          { value: 'report', label: 'Report' },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'log' ? <LogPane ctx={ctx} /> : <ReportPane ctx={ctx} />}
    </>
  );
}

function LogPane({ ctx }: { ctx: Ctx }) {
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | undefined>();
  const [all, setAll] = useState(false);
  const { colors } = useTheme();
  const list = actionLogList(ctx.content, { text: query, tag, limit: all ? undefined : RECENT });
  const stats = actionLogStats(ctx.content, ctx.now);
  const filtering = query.trim() !== '' || tag !== undefined;
  const submit = () => {
    if (ctx.apply(logAction(ctx.content, text, ctx.now, parseTagInput(tags)))) {
      haptics.success();
      setText('');
      setTags('');
    } else haptics.error();
  };
  return (
    <>
      <StatRow>
        <Stat label="This week" value={String(stats.week)} />
        <Stat label="This month" value={String(stats.month)} />
        <Stat label="Total" value={String(stats.total)} />
      </StatRow>
      <TextField
        label="Search log"
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {list.tags.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {list.tags.map((t) => (
              <Chip
                key={t}
                label={`#${t}`}
                accessibilityLabel={`Filter by ${t}`}
                selected={tag === t}
                onPress={() => setTag(tag === t ? undefined : t)}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}
      {list.entries.length === 0 ? (
        <EmptyLine>{filtering ? 'No matching entries.' : 'Nothing logged yet.'}</EmptyLine>
      ) : (
        <Rows>
          {list.entries.map((e) => (
            <ItemRow
              key={`${e.timestamp}-${e.description}`}
              title={e.description}
              subtitle={e.timestamp}
              leading={<Icon name="check" size={18} color={colors.success} />}
            />
          ))}
        </Rows>
      )}
      {all || list.matches > RECENT ? (
        <Button
          label={all ? 'Show fewer' : `Show all ${list.matches}`}
          size="medium"
          variant="plain"
          onPress={() => setAll(!all)}
        />
      ) : null}
      <QuickAdd
        label="What did you do?"
        placeholder="Ran 5k #run"
        value={text}
        onChangeText={setText}
        onSubmit={submit}
        addLabel="Log action"
      />
      <TextField
        label="Tags"
        value={tags}
        onChangeText={setTags}
        autoCapitalize="none"
        helper="Optional; #tags in the text work too"
      />
    </>
  );
}

function ReportPane({ ctx }: { ctx: Ctx }) {
  const report = actionLogReport(ctx.content, ctx.now);
  const peak = Math.max(1, ...report.months.map((m) => m.count));
  const { colors, shape } = useTheme();
  return (
    <>
      <Text variant="footnote" tone="secondary" weight="600">
        Last 12 months
      </Text>
      <Rows>
        {report.months.map((m) => (
          <ItemRow
            key={m.month}
            title={m.month}
            subtitle={undefined}
            trailing={
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View
                  style={{
                    width: Math.round((m.count / peak) * 96),
                    height: 8,
                    borderRadius: shape.sm,
                    backgroundColor: colors.accentFill,
                  }}
                />
                <Text variant="body" mono style={{ fontVariant: ['tabular-nums'] }}>
                  {String(m.count)}
                </Text>
              </View>
            }
          />
        ))}
      </Rows>
      <Text variant="footnote" tone="secondary" weight="600">
        Top tags
      </Text>
      {report.topTags.length === 0 ? (
        <EmptyLine>No tags yet.</EmptyLine>
      ) : (
        <Rows>
          {report.topTags.map((t) => (
            <ItemRow
              key={t.tag}
              title={`#${t.tag}`}
              trailing={
                <Text variant="body" mono style={{ fontVariant: ['tabular-nums'] }}>
                  {String(t.count)}
                </Text>
              }
            />
          ))}
        </Rows>
      )}
    </>
  );
}
