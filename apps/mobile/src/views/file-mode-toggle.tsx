import { Pressable } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Icon } from '../ui/index.js';
import type { FileMode } from './file-editor-view.js';

/** Header control that flips a file between its viewer and the raw source. */
export function FileModeToggle({
  mode,
  onChange,
  markdown = false,
}: {
  mode: FileMode;
  onChange: (mode: FileMode) => void;
  /** Notes read as "Edit" / "Preview" rather than source code. */
  markdown?: boolean;
}) {
  const { colors, metrics } = useTheme();
  const label = markdown
    ? mode === 'view'
      ? 'Edit'
      : 'Preview'
    : mode === 'view'
      ? 'View source'
      : 'View';
  const icon = mode === 'view' ? (markdown ? 'edit' : 'code') : 'document';
  return (
    <Pressable
      testID="toggle-source"
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={(metrics.hitTarget - 22) / 2}
      onPress={() => onChange(mode === 'view' ? 'source' : 'view')}
    >
      <Icon name={icon} size={22} color={colors.accent} />
    </Pressable>
  );
}
