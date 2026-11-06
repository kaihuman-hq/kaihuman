import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { KnowledgeScreenController } from '../screens/knowledge-screen.js';
import { useTheme } from '../theme/theme.js';
import {
  Badge,
  Button,
  EmptyState,
  haptics,
  Icon,
  ListRow,
  Screen,
  Section,
  Text,
  TextField,
} from '../ui/index.js';

export function KnowledgeView({ controller }: { controller: KnowledgeScreenController }) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const ios = theme.platform === 'ios';
  const pad = ios ? spacing.md : theme.metrics.screenMargin;
  const tile = ios
    ? { iconBackground: colors.accentFill, iconColor: colors.onAccentFill }
    : { iconColor: colors.accent };
  const quiet = ios ? { iconBackground: colors.fill, iconColor: colors.secondaryLabel } : {};
  const ok = ios ? { iconBackground: colors.success } : { iconColor: colors.success };
  const [, setRev] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const add = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      setError(null);
      await controller.addNote(text);
      setText('');
      haptics.success();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      haptics.error();
    }
    setSaving(false);
    setRev((n) => n + 1);
  };

  const inbox = controller.inbox();
  const processed = controller.processed().length;

  return (
    <Screen keyboard refreshing={refreshing} onRefresh={refresh}>
      <Section header="New raw note" footer="Notes land in the inbox until /kb-ingest files them.">
        <View style={{ padding: pad, gap: spacing.md }}>
          <TextField
            label="New note"
            value={text}
            onChangeText={setText}
            multiline
            autoCapitalize="sentences"
            placeholder="A link, a quote, a half-formed thought"
            error={error ?? undefined}
          />
          <Button
            label="Add note"
            icon="add"
            loading={saving}
            disabled={!text.trim()}
            onPress={() => void add()}
          />
        </View>
      </Section>
      <Section header="Overview">
        <ListRow
          title="Inbox"
          icon="knowledge"
          {...tile}
          accessory={
            <View>
              <Badge count={inbox.length} tone={inbox.length ? 'accent' : 'neutral'} />
            </View>
          }
        />
        <ListRow title="Processed" icon="check" {...ok} value={String(processed)} />
      </Section>
      {!loaded ? (
        <View style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.sm }}>
          <ActivityIndicator color={colors.secondaryLabel} />
          <Text variant="footnote" tone="secondary">
            Loading inbox
          </Text>
        </View>
      ) : inbox.length === 0 ? (
        <EmptyState
          icon="empty"
          title="Inbox is empty"
          message="Everything captured has been processed."
        />
      ) : (
        <Section header="Waiting for ingest">
          {inbox.map((item) => (
            <ListRow
              key={item.path}
              title={item.title}
              subtitle={item.name}
              icon="note"
              {...quiet}
            />
          ))}
        </Section>
      )}
      {error && loaded && inbox.length === 0 ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'center' }}>
          <Icon name="warning" size={17} color={colors.danger} />
          <Button label="Retry" variant="plain" size="small" onPress={() => void load()} />
        </View>
      ) : null}
    </Screen>
  );
}
