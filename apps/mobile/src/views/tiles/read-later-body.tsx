import { openBrowserAsync } from 'expo-web-browser';
import { Alert, Pressable, View } from 'react-native';
import {
  addReadLaterUrl,
  clearReadLater,
  deleteReadLaterItem,
  markReadLaterNew,
  markReadLaterRead,
  type ReadLaterView,
} from '../../components/widgets/tile-controllers.js';
import { useTheme } from '../../theme/theme.js';
import { Button, haptics, Text } from '../../ui/index.js';
import type { AddFormProps, Ctx } from './bodies.js';
import { CheckCircle, EmptyLine, FieldAddForm, ItemRow, Rows } from './parts.js';

type Item = ReadLaterView['unread'][number];

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const subtitleOf = (i: Item) => [hostOf(i.url), ...i.tags.map((t) => `#${t}`)].join(' · ');

export function ReadLaterAddForm({ ctx, onDone }: AddFormProps) {
  return (
    <FieldAddForm
      label="Page URL"
      placeholder="https://"
      keyboardType="url"
      saveLabel="Save page"
      onCancel={onDone}
      onSave={(url) => {
        const ok = ctx.apply(addReadLaterUrl(ctx.content, url, ctx.now));
        if (ok) {
          haptics.success();
          onDone();
        } else haptics.error();
        return ok;
      }}
    />
  );
}

export function ReadLater({ view, ctx }: { view: ReadLaterView; ctx: Ctx }) {
  const { metrics } = useTheme();
  const open = (i: Item) => void openBrowserAsync(i.url).catch(() => {});
  const toggle = (i: Item) => {
    const result =
      i.status === 'new'
        ? markReadLaterRead(ctx.content, i.id, ctx.now)
        : markReadLaterNew(ctx.content, i.id, ctx.now);
    if (ctx.apply(result)) haptics.success();
    else haptics.error();
  };
  const remove = (i: Item) => {
    if (ctx.apply(deleteReadLaterItem(ctx.content, i.id))) haptics.warning();
  };
  // Wiping unread items is not recoverable from the phone, so it asks first.
  const confirmClearAll = () =>
    Alert.alert('Clear all?', 'Removes every saved page, including unread ones.', [
      {
        text: 'Clear all',
        style: 'destructive',
        onPress: () => {
          if (ctx.apply(clearReadLater(ctx.content, true))) haptics.warning();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const row = (i: Item) => {
    const isNew = i.status === 'new';
    const markLabel = isNew ? `Mark ${i.name} as read` : `Mark ${i.name} as unread`;
    return (
      <ItemRow
        key={i.id}
        testID={`read-${i.id}`}
        title={i.name}
        label={`Open ${i.name}`}
        role="link"
        done={!isNew}
        subtitle={subtitleOf(i)}
        leading={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={markLabel}
            onPress={() => toggle(i)}
            hitSlop={8}
            style={{
              width: metrics.hitTarget,
              height: metrics.hitTarget,
              marginLeft: -8,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CheckCircle on={!isNew} />
          </Pressable>
        }
        onPress={() => open(i)}
        actions={[
          { label: 'Open', onPress: () => open(i) },
          { label: isNew ? 'Mark as read' : 'Mark as unread', onPress: () => toggle(i) },
          { label: 'Delete', destructive: true, onPress: () => remove(i) },
        ]}
      />
    );
  };

  return (
    <>
      {view.unread.length === 0 ? (
        <EmptyLine>Nothing waiting to be read.</EmptyLine>
      ) : (
        <Rows>{view.unread.map(row)}</Rows>
      )}
      {view.read.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text
            variant="footnote"
            tone="secondary"
            weight="600"
            style={{ textTransform: 'uppercase' }}
          >
            {`Read (${view.read.length})`}
          </Text>
          <Rows>{view.read.map(row)}</Rows>
        </View>
      ) : null}
      {view.read.length > 0 ? (
        <Button
          label="Clear read"
          size="small"
          variant="plain"
          onPress={() => ctx.apply(clearReadLater(ctx.content))}
        />
      ) : null}
      {view.unread.length + view.read.length > 0 ? (
        <Button label="Clear all" size="small" variant="plain" onPress={confirmClearAll} />
      ) : null}
    </>
  );
}
