import { render, screen } from '@testing-library/react';
import { Platform, Text } from 'react-native';
import { afterEach, describe, expect, it } from 'vitest';
import { KEYBOARD_BEHAVIOR, KeyboardLift, keyboardScrollProps } from './keyboard.js';

const os = Platform.OS;
afterEach(() => {
  Platform.OS = os;
});

describe('keyboard handling', () => {
  it('lifts with padding on every platform (Android is edge-to-edge)', () => {
    expect(KEYBOARD_BEHAVIOR).toBe('padding');
  });

  it('lets an iOS scroll view inset itself only when nothing lifts it', () => {
    Platform.OS = 'ios';
    expect(keyboardScrollProps(false).automaticallyAdjustKeyboardInsets).toBe(true);
    expect(keyboardScrollProps(true).automaticallyAdjustKeyboardInsets).toBe(false);
    Platform.OS = 'android';
    expect(keyboardScrollProps(false).automaticallyAdjustKeyboardInsets).toBe(false);
    expect(keyboardScrollProps(false).keyboardShouldPersistTaps).toBe('handled');
  });

  it('renders its children', () => {
    render(
      <KeyboardLift>
        <Text>field</Text>
      </KeyboardLift>,
    );
    expect(screen.getByText('field')).toBeTruthy();
  });
});
