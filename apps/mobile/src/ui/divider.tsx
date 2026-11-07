import { StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme.js';

export function Divider({ inset = 0 }: { inset?: number }) {
  const theme = useTheme();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        height: StyleSheet.hairlineWidth,
        marginLeft: inset,
        backgroundColor: theme.colors.separator,
      }}
    />
  );
}
