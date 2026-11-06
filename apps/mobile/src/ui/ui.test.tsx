import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HeaderShownContext } from 'expo-router/react-navigation';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Badge,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Fab,
  haptics,
  Icon,
  ListRow,
  Screen,
  ScreenTitle,
  Section,
  SegmentedControl,
  StatTile,
  Text,
  TextField,
} from './index.js';

function setPlatform(platform: 'ios' | 'android') {
  window.history.replaceState(null, '', platform === 'android' ? '/?platform=android' : '/');
}

const scheme = vi.hoisted(() => ({ current: 'dark' as 'light' | 'dark' }));

// react-native-web reads the media query once at load, so drive the hook directly.
vi.mock('react-native', async () => ({
  ...(await vi.importActual<object>('react-native-web')),
  useColorScheme: () => scheme.current,
}));

function setScheme(next: 'light' | 'dark') {
  scheme.current = next;
  window.matchMedia = ((query: string) => ({
    matches: next === 'dark' && query.includes('dark'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  setPlatform('ios');
  setScheme('dark');
});
afterEach(() => {
  cleanup();
  setPlatform('ios');
});

const bothPlatforms = ['ios', 'android'] as const;

describe('Icon', () => {
  it('is decorative by default and labelled on request', () => {
    render(<Icon name="home" />);
    expect(screen.getByTestId('icon-home').getAttribute('aria-hidden')).toBe('true');
    cleanup();
    render(<Icon name="settings" accessibilityLabel="Settings" />);
    expect(screen.getByLabelText('Settings')).toBeTruthy();
  });
});

describe('haptics', () => {
  it('is a no-op on web and never throws', () => {
    expect(() => {
      haptics.selection();
      haptics.light();
      haptics.medium();
      haptics.success();
      haptics.warning();
      haptics.error();
    }).not.toThrow();
  });
});

describe('Text', () => {
  it('renders children and follows light/dark', () => {
    setScheme('dark');
    const { unmount } = render(<Text>Hello</Text>);
    const dark = getComputedStyle(screen.getByText('Hello')).color;
    unmount();
    setScheme('light');
    render(<Text>Hello</Text>);
    expect(getComputedStyle(screen.getByText('Hello')).color).not.toBe(dark);
  });
});

describe('Screen', () => {
  it('shows an inline title on web only when given one', () => {
    render(
      <Screen title="Board">
        <Text>content</Text>
      </Screen>,
    );
    expect(screen.getByRole('heading', { name: 'Board' })).toBeTruthy();
    expect(screen.getByText('content')).toBeTruthy();
  });

  it('skips the inline title when a navigation header already shows it', () => {
    render(
      <HeaderShownContext.Provider value={true}>
        <Screen title="Repositories">
          <Text>content</Text>
        </Screen>
      </HeaderShownContext.Provider>,
    );
    expect(screen.queryByRole('heading', { name: 'Repositories' })).toBeNull();
  });

  it('renders footer and non-scrolling content', () => {
    render(
      <Screen scroll={false} footer={<Text>footer</Text>}>
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.getByText('footer')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });

  it('works with safe-area insets provided', () => {
    render(
      <SafeAreaInsetsContext.Provider value={{ top: 47, bottom: 34, left: 0, right: 0 }}>
        <Screen>
          <Text>inset</Text>
        </Screen>
      </SafeAreaInsetsContext.Provider>,
    );
    expect(screen.getByText('inset')).toBeTruthy();
  });

  it('ScreenTitle is a heading', () => {
    render(<ScreenTitle>Sign in</ScreenTitle>);
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });
});

describe.each(bothPlatforms)('on %s design', (platform) => {
  beforeEach(() => setPlatform(platform));

  it('ListRow renders title, value, accessory and fires onPress', () => {
    const onPress = vi.fn();
    render(
      <Section header="Account" footer="Footer text">
        <ListRow title="Repo" value="main" icon="repos" accessory="chevron" onPress={onPress} />
        <ListRow title="Selected" accessory="check" />
      </Section>,
    );
    expect(screen.getByText(/Account/i)).toBeTruthy();
    expect(screen.getByText('Footer text')).toBeTruthy();
    expect(screen.getByTestId('icon-chevron_right')).toBeTruthy();
    expect(screen.getByTestId('icon-check')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Repo, main' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('ListRow without handlers is not a button, and disabled rows do not fire', () => {
    const onPress = vi.fn();
    render(
      <>
        <ListRow title="Static" />
        <ListRow title="Off" onPress={onPress} disabled />
      </>,
    );
    expect(screen.queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByText('Off'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('ListRow accepts a custom accessory node', () => {
    render(<ListRow title="Row" accessory={<Badge count={3} />} />);
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('Button fires onPress, blocks when disabled or loading', () => {
    const onPress = vi.fn();
    const { rerender } = render(<Button label="Go" onPress={onPress} icon="add" />);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    rerender(<Button label="Go" onPress={onPress} disabled />);
    fireEvent.click(screen.getByText('Go'));
    rerender(<Button label="Go" onPress={onPress} loading />);
    fireEvent.click(screen.getByText('Go'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    'filled',
    'tinted',
    'plain',
    'outlined',
    'destructive',
  ] as const)('Button renders the %s variant', (variant) => {
    render(<Button label="Label" onPress={() => {}} variant={variant} size="small" />);
    expect(screen.getByText('Label')).toBeTruthy();
  });

  it('TextField forwards text and shows error over helper', () => {
    const onChangeText = vi.fn();
    const { rerender } = render(
      <TextField label="Token" value="" onChangeText={onChangeText} helper="Paste it" />,
    );
    fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'abc' } });
    expect(onChangeText).toHaveBeenCalledWith('abc');
    expect(screen.getByText('Paste it')).toBeTruthy();
    rerender(
      <TextField
        label="Token"
        value=""
        onChangeText={onChangeText}
        helper="Paste it"
        error="Bad"
      />,
    );
    expect(screen.getByText('Bad')).toBeTruthy();
    expect(screen.queryByText('Paste it')).toBeNull();
  });

  it('SegmentedControl reports selection changes, not re-taps', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        options={[
          { value: 'a', label: 'Alpha' },
          { value: 'b', label: 'Beta' },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText('Alpha'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Beta'));
    expect(onChange).toHaveBeenCalledWith('b');
    expect(screen.getByRole('button', { name: /Alpha/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  it('Chip is pressable when given onPress and reflects selection', () => {
    const onPress = vi.fn();
    render(<Chip label="Work" selected onPress={onPress} icon="flag" />);
    fireEvent.click(screen.getByRole('button', { name: /Work/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Chip without onPress is static', () => {
    render(<Chip label="Static" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('Badge renders count and label in every tone', () => {
    render(
      <>
        {(['accent', 'neutral', 'danger', 'success', 'warning'] as const).map((tone) => (
          <Badge key={tone} tone={tone} label={tone} />
        ))}
        <Badge count={7} />
      </>,
    );
    expect(screen.getByText('warning')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('EmptyState renders copy and fires its action', () => {
    const onPress = vi.fn();
    render(
      <EmptyState
        icon="empty"
        title="Nothing here"
        message="Capture something"
        action={{ label: 'Capture', onPress }}
      />,
    );
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(screen.getByText('Capture something')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Capture' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('Card renders header and is pressable with onPress', () => {
    const onPress = vi.fn();
    render(
      <Card title="Inbox" icon="todo" accessory={<Badge count={2} />} onPress={onPress}>
        <Text>inside</Text>
      </Card>,
    );
    expect(screen.getByText('Inbox')).toBeTruthy();
    expect(screen.getByText('inside')).toBeTruthy();
    fireEvent.click(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('StatTile shows label, value and delta', () => {
    render(<StatTile label="Done" value={12} delta="+3 this week" tone="success" icon="check" />);
    expect(screen.getByText('Done')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('+3 this week')).toBeTruthy();
  });

  it('Divider renders', () => {
    const { container } = render(<Divider inset={16} />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe('Fab', () => {
  it('renders nothing in the iOS design', () => {
    setPlatform('ios');
    const { container } = render(<Fab icon="add" onPress={() => {}} accessibilityLabel="New" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders and fires on the Android design', () => {
    setPlatform('android');
    const onPress = vi.fn();
    render(<Fab icon="add" label="Capture" onPress={onPress} accessibilityLabel="New" />);
    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Capture')).toBeTruthy();
  });
});

describe('theme switching', () => {
  it('re-renders with the new scheme without remounting errors', () => {
    setScheme('light');
    act(() => {
      render(<Button label="Light" onPress={() => {}} />);
    });
    expect(screen.getByText('Light')).toBeTruthy();
  });
});
