import type { QuickKind } from '../navigation/routes.js';
import { useTheme } from '../theme/theme.js';
import type { IconName } from '../ui/index.js';
import { haptics, ListRow, Screen, Section } from '../ui/index.js';

type TileTone = 'accentFill' | 'warning' | 'info' | 'success' | 'secondaryLabel';

interface CaptureOption {
  kind: QuickKind;
  title: string;
  subtitle: string;
  icon: IconName;
  tile: TileTone;
}

const OPTIONS: readonly CaptureOption[] = [
  {
    kind: 'todo',
    title: 'Todo',
    subtitle: 'Add to your todo list',
    icon: 'todo',
    tile: 'accentFill',
  },
  { kind: 'note', title: 'Note', subtitle: 'Jot something down', icon: 'note', tile: 'warning' },
  { kind: 'log', title: 'Log', subtitle: 'Timestamped journal entry', icon: 'log', tile: 'info' },
  {
    kind: 'idea',
    title: 'Idea',
    subtitle: 'Park an idea for later',
    icon: 'ideas',
    tile: 'success',
  },
  {
    kind: 'knowledge',
    title: 'Knowledge',
    subtitle: 'Save a fact or link',
    icon: 'knowledge',
    tile: 'secondaryLabel',
  },
];

export function CaptureHubView({ onSelect }: { onSelect: (kind: QuickKind) => void }) {
  const { colors, platform } = useTheme();
  // Android rows show a plain tinted glyph instead of a tile, so the tile colours only apply on iOS.
  const ios = platform === 'ios';
  return (
    <Screen title="Capture">
      <Section footer="Everything you capture is saved to your repository.">
        {OPTIONS.map((o) => (
          <ListRow
            key={o.kind}
            testID={`capture-${o.kind}`}
            title={o.title}
            subtitle={o.subtitle}
            icon={o.icon}
            iconBackground={colors[o.tile]}
            // Dark glyph on the bright tiles in dark mode, light-surface glyph in light mode.
            iconColor={
              ios ? (o.tile === 'accentFill' ? colors.onAccentFill : colors.background) : undefined
            }
            accessory="chevron"
            onPress={() => {
              haptics.selection();
              onSelect(o.kind);
            }}
          />
        ))}
      </Section>
    </Screen>
  );
}
