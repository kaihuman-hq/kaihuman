import { Pressable } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Icon } from '../ui/index.js';
import type { FileMode } from './file-editor-view.js';

/** Header control that flips a file between its viewer and the raw source. */
export function FileModeToggle({
  mode,
  onChange,
}: {
  mode: FileMode;
  onChange: (mode: FileMode) => void;
}) {
  const { colors, metrics } = useTheme();
  const label = mode === 'view' ? 'View source' : 'View';
  return (
    <Pressable
      testID="toggle-source"
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(metrics.hitTarget - 22) / 2}
      onPress={() => onChange(mode === 'view' ? 'source' : 'view')}
    >
      <Icon name={mode === 'view' ? 'code' : 'document'} size={22} color={colors.accent} />
    </Pressable>
  );
}
