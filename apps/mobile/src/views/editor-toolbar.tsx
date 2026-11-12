import { Pressable, ScrollView, View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { haptics, Icon, type IconName } from '../ui/index.js';

export type FormatAction = 'heading' | 'bold' | 'italic' | 'bullet' | 'task' | 'link';

const FORMATS: { action: FormatAction; icon: IconName; label: string }[] = [
  { action: 'heading', icon: 'heading', label: 'Heading' },
  { action: 'bold', icon: 'bold', label: 'Bold' },
  { action: 'italic', icon: 'italic', label: 'Italic' },
  { action: 'bullet', icon: 'list', label: 'Bulleted list' },
  { action: 'task', icon: 'checkbox', label: 'Checkbox' },
  { action: 'link', icon: 'link', label: 'Link' },
];

function ToolButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: IconName;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors, metrics, shape } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      style={({ pressed }) => ({
        width: metrics.hitTarget,
        height: 36,
        borderRadius: shape.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.surface : 'transparent',
        opacity: disabled ? 0.35 : 1,
      })}
    >
      <Icon name={icon} size={19} color={colors.label} />
    </Pressable>
  );
}

/** Row above the keyboard: undo/redo always; markdown formatting only for markdown files. */
export function EditorToolbar({
  markdown,
  canUndo,
  canRedo,
  keyboardVisible,
  onUndo,
  onRedo,
  onFormat,
  onDismissKeyboard,
}: {
  markdown: boolean;
  canUndo: boolean;
  canRedo: boolean;
  keyboardVisible: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onFormat: (action: FormatAction) => void;
  onDismissKeyboard: () => void;
}) {
  const { colors, spacing } = useTheme();
  const divider = (
    <View
      style={{ width: 1, height: 20, backgroundColor: colors.separator, marginHorizontal: 2 }}
    />
  );
  return (
    <View testID="editor-toolbar" style={{ flexDirection: 'row', alignItems: 'center' }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="always"
        contentContainerStyle={{ alignItems: 'center', gap: spacing.xxs }}
        style={{ flex: 1 }}
      >
        <ToolButton icon="undo" label="Undo" disabled={!canUndo} onPress={onUndo} />
        <ToolButton icon="redo" label="Redo" disabled={!canRedo} onPress={onRedo} />
        {markdown ? divider : null}
        {markdown
          ? FORMATS.map((f) => (
              <ToolButton
                key={f.action}
                icon={f.icon}
                label={f.label}
                onPress={() => onFormat(f.action)}
              />
            ))
          : null}
      </ScrollView>
      {keyboardVisible ? (
        <ToolButton icon="keyboardDismiss" label="Hide keyboard" onPress={onDismissKeyboard} />
      ) : null}
    </View>
  );
}
