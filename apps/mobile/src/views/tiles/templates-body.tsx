import { useState } from 'react';
import { ScrollView, Share, View } from 'react-native';
import {
  addCommandEntry,
  addPromptEntry,
  commandsView,
  interpolateTemplate,
  missingParameters,
  parseTagInput,
  promptsView,
  type TemplateRow,
} from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { Badge, Button, Chip, haptics, Icon, Text, TextField } from '../../ui/index.js';
import type { AddFormProps, Ctx } from './bodies.js';
import { EmptyLine, FormButtons, ItemRow, Rows } from './parts.js';

export type TemplateKind = 'prompt' | 'command';
type Kind = TemplateKind;

export function TemplateAddForm({ ctx, onDone, kind }: AddFormProps & { kind: Kind }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState('');
  const save = () => {
    const tagList = parseTagInput(tags);
    const result =
      kind === 'prompt'
        ? addPromptEntry(ctx.content, title, body, tagList)
        : addCommandEntry(ctx.content, title, body, tagList);
    if (ctx.apply(result)) {
      haptics.success();
      onDone();
    } else haptics.error();
  };
  return (
    <>
      <TextField
        label={`New ${kind} title`}
        value={title}
        onChangeText={setTitle}
        autoCapitalize="sentences"
        autoFocus
        returnKeyType="next"
      />
      <TextField label={`New ${kind} text`} value={body} onChangeText={setBody} multiline />
      <TextField
        label={`New ${kind} tags`}
        value={tags}
        onChangeText={setTags}
        autoCapitalize="none"
        helper="Separate with spaces or commas"
      />
      <FormButtons saveLabel={`Save ${kind}`} onSave={save} onCancel={onDone} />
    </>
  );
}

export function Templates({ ctx, kind }: { ctx: Ctx; kind: Kind }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | undefined>();
  // The dispatcher's view is unfiltered, so search and the tag filter re-run the presenter here.
  const view = (kind === 'prompt' ? promptsView : commandsView)(ctx.content, { text: query, tag });
  const filtering = query.trim() !== '' || tag !== undefined;
  return (
    <>
      <TextField
        label={`Search ${kind}s`}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        returnKeyType="search"
      />
      {view.tags.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {view.tags.map((t) => (
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
      {view.rows.length === 0 ? (
        <EmptyLine>{filtering ? `No matching ${kind}s.` : `No ${kind}s yet.`}</EmptyLine>
      ) : (
        <Rows>
          {view.rows.map((r) => (
            <TemplateItem key={r.title} row={r} />
          ))}
        </Rows>
      )}
    </>
  );
}

function TemplateItem({ row }: { row: TemplateRow }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const { colors, spacing, shape } = useTheme();
  const missing = missingParameters(row, values);
  // There is no clipboard module; the share sheet offers Copy without a new dependency.
  const copy = () => {
    haptics.selection();
    void Share.share({ message: interpolateTemplate(row.template, values) }).catch(() => {});
  };
  return (
    <View>
      <ItemRow
        title={row.title}
        subtitle={
          row.parameters.length > 0 ? `Needs ${row.parameters.join(', ')}` : 'No parameters'
        }
        expanded={open}
        trailing={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            {row.tags.slice(0, 2).map((t) => (
              <Badge key={t} tone="neutral" label={t} />
            ))}
            <Icon
              name={open ? 'chevronDown' : 'chevronRight'}
              size={14}
              color={colors.tertiaryLabel}
              weight="semibold"
            />
          </View>
        }
        onPress={() => setOpen(!open)}
      />
      {open ? (
        <View style={{ gap: spacing.sm, paddingBottom: spacing.md }}>
          {row.parameters.map((p) => (
            <TextField
              key={p}
              label={`${row.title}: ${p}`}
              value={values[p] ?? ''}
              onChangeText={(v) => setValues({ ...values, [p]: v })}
            />
          ))}
          <View
            testID={`preview-${row.title}`}
            style={{ backgroundColor: colors.fill, borderRadius: shape.md, padding: spacing.md }}
          >
            <Text variant="footnote" mono>
              {interpolateTemplate(row.template, values)}
            </Text>
          </View>
          {missing.length > 0 ? (
            <Text variant="footnote" tone="secondary">{`Missing: ${missing.join(', ')}`}</Text>
          ) : null}
          <Button
            label={`Copy ${row.title}`}
            icon="share"
            size="medium"
            variant="tinted"
            onPress={copy}
          />
        </View>
      ) : null}
    </View>
  );
}
