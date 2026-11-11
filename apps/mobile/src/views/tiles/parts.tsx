import { Children, isValidElement, type ReactNode, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, View } from 'react-native';
import { useTheme } from '../../theme/theme.js';
import {
  Button,
  Divider,
  Icon,
  type IconName,
  MotionItem,
  MotionList,
  SwipeReveal,
  Text,
  TextField,
} from '../../ui/index.js';

export interface RowAction {
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

/** Long-press menu: an action sheet on iOS, an alert dialog elsewhere. */
function showActions(title: string, actions: readonly RowAction[]) {
  if (Platform.OS === 'ios') {
    const options = [...actions.map((a) => a.label), 'Cancel'];
    const destructiveIndex = actions.findIndex((a) => a.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: destructiveIndex >= 0 ? destructiveIndex : undefined,
      },
      (index) => actions[index]?.onPress(),
    );
    return;
  }
  Alert.alert(title, undefined, [
    ...actions.map((a) => ({
      text: a.label,
      style: a.destructive ? ('destructive' as const) : ('default' as const),
      onPress: a.onPress,
    })),
    { text: 'Cancel', style: 'cancel' as const },
  ]);
}

/** Hairline-separated rows that sit directly on the card surface. */
export function Rows({ children }: { children?: ReactNode }) {
  const rows = Children.toArray(children);
  return (
    <MotionList>
      {rows.map((row, i) => (
        // Rows keep their own key so a removed one animates out instead of the last.
        <MotionItem key={isValidElement(row) && row.key != null ? row.key : i}>
          {i > 0 ? <Divider /> : null}
          {row}
        </MotionItem>
      ))}
    </MotionList>
  );
}

export interface ItemRowProps {
  title: string;
  subtitle?: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Strike through and mute the title (finished items). */
  done?: boolean;
  mono?: boolean;
  onPress?: () => void;
  actions?: readonly RowAction[];
  /** Also reveal `actions` by swiping (native only); long press stays as the fallback. */
  swipe?: boolean;
  /** With `swipe`: a long swipe runs the last action directly instead of revealing its button. */
  fullSwipe?: boolean;
  role?: 'button' | 'checkbox' | 'link';
  checked?: boolean;
  expanded?: boolean;
  label?: string;
  testID?: string;
}

export function ItemRow({
  title,
  subtitle,
  leading,
  trailing,
  done,
  onPress,
  actions,
  swipe,
  fullSwipe,
  role = 'button',
  checked,
  expanded,
  label,
  testID,
}: ItemRowProps) {
  const { colors, spacing, metrics, platform } = useTheme();
  const ios = platform === 'ios';
  const interactive = Boolean(onPress || actions?.length);
  const body = (pressed: boolean) => (
    <View
      style={{
        minHeight: metrics.hitTarget,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: pressed && ios ? colors.pressed : 'transparent',
      }}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text
          variant={ios ? 'body' : 'body'}
          tone={done ? 'secondary' : 'primary'}
          style={done ? { textDecorationLine: 'line-through' } : undefined}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text variant={ios ? 'footnote' : 'subheadline'} tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
  if (!interactive) return <View testID={testID}>{body(false)}</View>;
  const pressable = (
    <Pressable
      accessibilityRole={role}
      accessibilityLabel={label ?? title}
      aria-checked={checked}
      aria-expanded={expanded}
      accessibilityHint={actions?.length ? 'Long press for more actions' : undefined}
      onPress={onPress}
      onLongPress={actions?.length ? () => showActions(title, actions) : undefined}
      testID={testID}
      android_ripple={ios ? undefined : { color: colors.pressed }}
    >
      {({ pressed }) => body(pressed)}
    </Pressable>
  );
  if (swipe && actions?.length && Platform.OS !== 'web') {
    return (
      <SwipeReveal
        actions={actions}
        fullSwipe={fullSwipe}
        testID={testID ? `${testID}-swipeable` : undefined}
      >
        {pressable}
      </SwipeReveal>
    );
  }
  return pressable;
}

/** A round check marker; filled when `on`. */
export function CheckCircle({ on }: { on: boolean }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: on ? 0 : 2,
        borderColor: colors.secondaryLabel,
        backgroundColor: on ? colors.accentFill : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {on ? <Icon name="check" size={14} color={colors.onAccentFill} weight="bold" /> : null}
    </View>
  );
}

/** A number on a soft tile: mono value, small label. */
export function Stat({
  label,
  value,
  unit,
  tone = 'primary',
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: 'primary' | 'success' | 'danger';
}) {
  const { colors, spacing, shape } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}${unit ? ` ${unit}` : ''}`}
      style={{
        flex: 1,
        minWidth: 128,
        backgroundColor: colors.fill,
        borderRadius: shape.md,
        padding: spacing.md,
        gap: spacing.xxs,
      }}
    >
      <Text variant="caption2" tone="secondary" weight="600" style={{ textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text variant="title3" mono tone={tone} style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      {unit ? (
        <Text variant="caption2" tone="secondary">
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

export function StatRow({ children }: { children: ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>
  );
}

/** Horizontal meter; `value` is 0..1 (clamped). */
export function Meter({ value, label }: { value: number; label: string }) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(1, value));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}
      style={{ height: 6, borderRadius: 3, backgroundColor: colors.fill, overflow: 'hidden' }}
    >
      <View
        style={{
          width: `${pct * 100}%`,
          height: 6,
          borderRadius: 3,
          backgroundColor: colors.accent,
        }}
      />
    </View>
  );
}

export function Err({ error }: { error: string | null }) {
  const { colors, spacing } = useTheme();
  if (!error) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
    >
      <Icon name="warning" size={17} color={colors.danger} />
      <View style={{ flex: 1 }}>
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      </View>
    </View>
  );
}

export function EmptyLine({ children }: { children: string }) {
  return (
    <Text variant="subheadline" tone="secondary" style={{ paddingVertical: 8 }}>
      {children}
    </Text>
  );
}

/** A single-line input with a round add button, like Reminders' new-item row. */
export function QuickAdd({
  label,
  value,
  onChangeText,
  onSubmit,
  addLabel,
  placeholder,
  keyboardType,
  autoFocus,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  addLabel: string;
  placeholder?: string;
  keyboardType?: 'default' | 'url';
  autoFocus?: boolean;
}) {
  const { colors, spacing, metrics } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <TextField
          label={label}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          returnKeyType="done"
          onSubmitEditing={onSubmit}
          autoFocus={autoFocus}
          keyboardType={keyboardType}
          autoCapitalize={keyboardType === 'url' ? 'none' : 'sentences'}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={addLabel}
        onPress={onSubmit}
        hitSlop={4}
        style={({ pressed }) => ({
          width: metrics.hitTarget,
          height: metrics.hitTarget,
          borderRadius: metrics.hitTarget / 2,
          backgroundColor: colors.accentFill,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Icon name="add" size={22} color={colors.onAccentFill} weight="semibold" />
      </Pressable>
    </View>
  );
}

/** Save and Cancel under an add form; every add sheet ends the same way. */
export function FormButtons({
  saveLabel,
  onSave,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  saveLabel: string;
  onSave: () => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <View style={{ flex: 1 }}>
        <Button label={saveLabel} onPress={onSave} fullWidth />
      </View>
      <Button label={cancelLabel} variant="plain" onPress={onCancel} />
    </View>
  );
}

/** One field plus Save and Cancel: the add sheet for tiles whose entry is a single value. */
export function FieldAddForm({
  label,
  saveLabel,
  placeholder,
  keyboardType,
  onSave,
  onCancel,
}: {
  label: string;
  saveLabel: string;
  placeholder?: string;
  keyboardType?: 'default' | 'url';
  /** Whether the value was accepted; a rejected value stays in the field. */
  onSave: (value: string) => boolean;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const save = () => {
    onSave(value);
  };
  return (
    <>
      <TextField
        label={label}
        value={value}
        onChangeText={setValue}
        placeholder={placeholder}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'url' ? 'none' : 'sentences'}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={save}
      />
      <FormButtons saveLabel={saveLabel} onSave={save} onCancel={onCancel} />
    </>
  );
}

/** A plain button that reveals a form; keeps cards calm until the user wants to add. */
export function useDisclosure() {
  const [open, setOpen] = useState(false);
  return { open, show: () => setOpen(true), hide: () => setOpen(false) };
}

export const TileIcon = ({ name }: { name: IconName }) => {
  const { colors, shape } = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 32,
        height: 32,
        borderRadius: shape.sm,
        backgroundColor: colors.accentSoft,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name={name} size={18} color={colors.onAccentSoft} />
    </View>
  );
};
