import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Button } from './button.js';
import { Text } from './text.js';

/** The confirm action of a "new entry" form: Add / Save / Done, top-right per the iOS HIG. */
export interface HeaderAction {
  label: string;
  onPress: () => void;
  /** Form invalid or nothing typed yet. */
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

/** The plain-text bar button a navigation bar or sheet header shows. */
export function HeaderButton({
  label,
  onPress,
  disabled,
  loading,
  testID,
  accessibilityLabel,
}: HeaderAction) {
  return (
    <Button
      label={label}
      variant="plain"
      size="small"
      testID={testID}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      loading={loading}
      onPress={onPress}
    />
  );
}

/**
 * Options for `<Stack.Screen>` inside a form screen: title, Cancel top-left (when `onCancel` is
 * given) and the confirm action top-right. Set from the screen, never from the root layout.
 */
export function formHeaderOptions({
  title,
  action,
  onCancel,
  cancelLabel = 'Cancel',
}: {
  title?: string;
  action: HeaderAction;
  onCancel?: () => void;
  cancelLabel?: string;
}) {
  return {
    ...(title !== undefined && { title }),
    headerRight: () => <HeaderButton {...action} />,
    ...(onCancel && {
      headerLeft: () => (
        <HeaderButton label={cancelLabel} onPress={onCancel} testID="form-header-cancel" />
      ),
    }),
  };
}

/** Cancel left, title centre, confirm right: the header of a form sheet (a Modal has no nav bar). */
export function FormHeader({
  title,
  onCancel,
  action,
  cancelLabel = 'Cancel',
}: {
  title: string;
  onCancel: () => void;
  action?: HeaderAction | null;
  cancelLabel?: string;
}) {
  const { spacing } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: spacing.sm,
      }}
    >
      <HeaderButton label={cancelLabel} onPress={onCancel} testID="form-header-cancel" />
      <Text
        variant="headline"
        accessibilityRole="header"
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        {title}
      </Text>
      {action ? (
        <HeaderButton {...action} testID={action.testID ?? 'form-header-action'} />
      ) : (
        // Keeps the title centred when a form has no confirm action.
        <View style={{ minWidth: 60 }} />
      )}
    </View>
  );
}

interface SheetSlot {
  set: (action: HeaderAction | null) => void;
}
const SheetSlotContext = createContext<SheetSlot | null>(null);

/**
 * Owns the confirm action of one form sheet: forms inside register theirs with
 * `useSheetAction`, and `children` places it in a `FormHeader`.
 */
export function SheetActionProvider({
  children,
}: {
  children: (action: HeaderAction | null) => ReactNode;
}) {
  const [action, set] = useState<HeaderAction | null>(null);
  const slot = useRef<SheetSlot>({ set }).current;
  return <SheetSlotContext.Provider value={slot}>{children(action)}</SheetSlotContext.Provider>;
}

/** True inside a sheet whose header carries the confirm action, so a form drops its own buttons. */
export const useInSheetHeader = () => useContext(SheetSlotContext) !== null;

/**
 * Registers a form's confirm action in the enclosing sheet header. A no-op outside one.
 * `onPress` may change every render; the header always calls the latest.
 */
export function useSheetAction(action: HeaderAction) {
  const slot = useContext(SheetSlotContext);
  const latest = useRef(action.onPress);
  latest.current = action.onPress;
  const { label, disabled, loading, testID, accessibilityLabel } = action;
  useLayoutEffect(() => {
    slot?.set({
      label,
      disabled,
      loading,
      testID,
      accessibilityLabel,
      onPress: () => latest.current(),
    });
  }, [slot, label, disabled, loading, testID, accessibilityLabel]);
  useEffect(() => () => slot?.set(null), [slot]);
}
