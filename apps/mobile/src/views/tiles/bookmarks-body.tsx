import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';
import { View } from 'react-native';
import {
  addBookmarkEntry,
  type Bookmark,
  type BookmarkSort,
  type BookmarksView,
  bookmarksView,
  deleteBookmarkEntry,
  editBookmarkEntry,
  parseTagInput,
  recordBookmarkUse,
  setBookmarkPinned,
} from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { Button, Chip, haptics, Icon, Text, TextField } from '../../ui/index.js';
import type { Ctx } from './bodies.js';
import { EmptyLine, ItemRow, Rows, useDisclosure } from './parts.js';

const COLLAPSED = 5;
const SORTS: readonly { value: BookmarkSort; label: string }[] = [
  { value: 'NEWEST', label: 'Newest' },
  { value: 'MOST_USED', label: 'Most used' },
  { value: 'LEAST_USED', label: 'Least used' },
  { value: 'FRECENCY', label: 'Frecency' },
];

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text variant="footnote" tone="secondary" weight="600" style={{ textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

/** Shared by add and edit: address, optional title, optional comma-separated tags. */
function BookmarkForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Bookmark;
  submitLabel: string;
  onSubmit: (draft: { url: string; title: string; tags: string[] }) => boolean;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [title, setTitle] = useState(initial?.title === initial?.url ? '' : (initial?.title ?? ''));
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');
  return (
    <View style={{ gap: 12 }}>
      <TextField
        label="Bookmark URL"
        value={url}
        onChangeText={setUrl}
        placeholder="https://"
        keyboardType="url"
        autoCapitalize="none"
      />
      <TextField
        label="Title (optional)"
        value={title}
        onChangeText={setTitle}
        placeholder="Defaults to the address"
      />
      <TextField
        label="Tags (optional)"
        value={tags}
        onChangeText={setTags}
        placeholder="work, reading"
        autoCapitalize="none"
        helper="Separate tags with commas"
      />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button
          label={submitLabel}
          variant="filled"
          onPress={() => {
            if (onSubmit({ url, title, tags: parseTagInput(tags) })) haptics.success();
            else haptics.error();
          }}
        />
        <Button label="Cancel" variant="plain" onPress={onCancel} />
      </View>
    </View>
  );
}

export function Bookmarks({ initial, ctx }: { initial: BookmarksView; ctx: Ctx }) {
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | undefined>();
  const [sort, setSort] = useState<BookmarkSort>('NEWEST');
  const [all, setAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const form = useDisclosure();
  const { colors } = useTheme();
  const filtered = Boolean(query.trim() || tag || sort !== 'NEWEST');
  // The tile's own view is the unfiltered default; any filter re-derives it from the file text.
  const view = filtered ? bookmarksView(ctx.content, { text: query, tag, sort }, ctx.now) : initial;
  // A tag that vanished (last bookmark with it was deleted) must not leave an empty, stuck filter.
  const activeTag = tag && view.tags.includes(tag) ? tag : undefined;
  const allTags = filtered ? bookmarksView(ctx.content, {}, ctx.now).tags : initial.tags;
  // Pinned bookmarks lead, keeping the chosen order within each group.
  const ordered = [
    ...view.bookmarks.filter((b) => b.pinned),
    ...view.bookmarks.filter((b) => !b.pinned),
  ];
  const shown = all ? ordered : ordered.slice(0, COLLAPSED);

  const open = (b: Bookmark) => {
    void openBrowserAsync(b.url).catch(() => {});
    ctx.apply(recordBookmarkUse(ctx.content, b.id, ctx.now));
  };

  const row = (b: Bookmark) =>
    editing === b.id ? (
      <BookmarkForm
        key={b.id}
        initial={b}
        submitLabel="Save changes"
        onCancel={() => setEditing(null)}
        onSubmit={(d) => {
          const ok = ctx.apply(editBookmarkEntry(ctx.content, b.id, d, ctx.now));
          if (ok) setEditing(null);
          return ok;
        }}
      />
    ) : (
      <ItemRow
        key={b.id}
        testID={`bookmark-${b.id}`}
        title={b.title}
        subtitle={[hostOf(b.url), ...b.tags.map((t) => `#${t}`)].join(' · ')}
        leading={<Icon name={b.pinned ? 'star' : 'bookmark'} size={20} color={colors.accent} />}
        trailing={
          <Icon name="chevronRight" size={14} color={colors.tertiaryLabel} weight="semibold" />
        }
        onPress={() => open(b)}
        actions={[
          { label: 'Open', onPress: () => open(b) },
          {
            label: b.pinned ? 'Unpin' : 'Pin',
            onPress: () => {
              if (ctx.apply(setBookmarkPinned(ctx.content, b.id, !b.pinned, ctx.now)))
                haptics.success();
            },
          },
          { label: 'Edit', onPress: () => setEditing(b.id) },
          {
            label: 'Delete bookmark',
            destructive: true,
            onPress: () => {
              if (ctx.apply(deleteBookmarkEntry(ctx.content, b.id, ctx.now))) haptics.warning();
            },
          },
        ]}
      />
    );

  return (
    <>
      <TextField
        label="Search bookmarks"
        value={query}
        onChangeText={setQuery}
        placeholder="Title or address"
        returnKeyType="search"
      />
      {allTags.length > 0 ? (
        <Section label="Tags">
          <Chip label="All" selected={!activeTag} onPress={() => setTag(undefined)} />
          {allTags.map((t) => (
            <Chip
              key={t}
              label={`#${t}`}
              accessibilityLabel={`Tag ${t}`}
              selected={activeTag === t}
              onPress={() => setTag(activeTag === t ? undefined : t)}
            />
          ))}
        </Section>
      ) : null}
      <Section label="Sort by">
        {SORTS.map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            accessibilityLabel={`Sort ${s.label}`}
            selected={sort === s.value}
            onPress={() => setSort(s.value)}
          />
        ))}
      </Section>
      {ordered.length === 0 ? (
        <EmptyLine>{filtered ? 'No bookmarks match.' : 'No bookmarks yet.'}</EmptyLine>
      ) : (
        <>
          <Rows>{shown.map(row)}</Rows>
          {ordered.length > COLLAPSED ? (
            <Button
              variant="plain"
              size="small"
              label={all ? 'Show fewer' : `Show all ${ordered.length} bookmarks`}
              onPress={() => setAll(!all)}
            />
          ) : null}
        </>
      )}
      {form.open ? (
        <BookmarkForm
          submitLabel="Save bookmark"
          onCancel={form.hide}
          onSubmit={(d) => {
            const ok = ctx.apply(addBookmarkEntry(ctx.content, d, ctx.now));
            if (ok) form.hide();
            return ok;
          }}
        />
      ) : (
        <Button label="Add bookmark" variant="tinted" icon="add" fullWidth onPress={form.show} />
      )}
    </>
  );
}
