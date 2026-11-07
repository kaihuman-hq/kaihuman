import { useRef, useState } from 'react';
import { View } from 'react-native';
import type { LoginScreenController, OpenAuthSession } from '../screens/login-screen.js';
import { useTheme } from '../theme/theme.js';
import { Button, GithubMark, haptics, Screen, Text, TextField } from '../ui/index.js';

const MARK = 88;

/** The K logo, drawn from theme colours so it inverts with the scheme (Volt on Ink in dark). */
function BrandMark() {
  const { colors, platform } = useTheme();
  const bar = (left: number, top: number, width: number, height: number, rotate: string) => ({
    position: 'absolute' as const,
    left,
    top,
    width,
    height,
    borderRadius: 2,
    backgroundColor: colors.onAccentFill,
    transform: [{ rotate }],
  });
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="kaihuman logo"
      style={{
        width: MARK,
        height: MARK,
        borderRadius: platform === 'ios' ? MARK * 0.225 : 28,
        backgroundColor: colors.accentFill,
      }}
    >
      {/* Drawn from bars rather than a glyph so it never scales with Dynamic Type. */}
      <View style={{ width: MARK, height: MARK }}>
        <View style={bar(27, 22, 10, 44, '0deg')} />
        <View style={bar(46, 20, 10, 38, '42deg')} />
        <View style={bar(46, 40, 10, 38, '-48deg')} />
      </View>
    </View>
  );
}

export function LoginView({
  controller,
  openAuthSession,
  onSignedIn,
}: {
  controller: LoginScreenController;
  /** Opens the gateway URL in an auth session that resolves when the app callback is hit. */
  openAuthSession: OpenAuthSession;
  onSignedIn: () => void;
}) {
  const { spacing } = useTheme();
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const [browserError, setBrowserError] = useState<string | null>(null);

  const signInWithBrowser = async () => {
    setBrowserError(null);
    try {
      const outcome = await controller.signInWithBrowser(openAuthSession);
      if (outcome === 'signed-in') {
        haptics.success();
        onSignedIn();
      } else if (outcome === 'no-token') {
        setBrowserError(
          'GitHub sign-in returned no token. Try again, or use a personal access token.',
        );
        haptics.error();
      }
    } catch {
      setBrowserError('Could not open GitHub sign-in. Try again, or use a personal access token.');
      haptics.error();
    }
  };

  const signIn = () => {
    if (controller.signInWithToken(tokenRef.current)) {
      setError(null);
      haptics.success();
      onSignedIn();
    } else {
      setError('Enter a personal access token');
      haptics.error();
    }
  };

  return (
    <Screen scroll={false} keyboard>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.xl, paddingTop: spacing.xxl }}>
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <BrandMark />
          <Text variant="largeTitle" align="center" accessibilityRole="header">
            kaihuman
          </Text>
          <Text variant="callout" tone="secondary" align="center">
            Your knowledge base, todos and ideas, synced from GitHub.
          </Text>
        </View>

        <View style={{ gap: spacing.md }}>
          <Button
            label="Sign in with GitHub"
            leading={(color) => <GithubMark color={color} />}
            fullWidth
            testID="login-browser"
            onPress={() => void signInWithBrowser()}
          />
          {browserError ? (
            <Text variant="footnote" tone="danger" align="center">
              {browserError}
            </Text>
          ) : null}
          <Button
            label="Try demo"
            variant="tinted"
            fullWidth
            testID="login-demo"
            onPress={() => {
              controller.enterDemo();
              onSignedIn();
            }}
          />
        </View>

        <View style={{ gap: spacing.md, alignItems: 'center' }}>
          <View style={{ alignItems: 'center' }}>
            <Button
              label={showToken ? 'Hide token sign-in' : 'Use a personal access token'}
              variant="plain"
              size="medium"
              testID="login-token-toggle"
              onPress={() => setShowToken((v) => !v)}
            />
          </View>
          {showToken ? (
            <View style={{ alignSelf: 'stretch', gap: spacing.md }}>
              <TextField
                label="Personal access token"
                value={token}
                onChangeText={(t) => {
                  setToken(t);
                  if (error) setError(null);
                }}
                secureTextEntry
                returnKeyType="go"
                onSubmitEditing={signIn}
                error={error ?? undefined}
                helper="Needs the repo scope. Stored on this device only."
                testID="login-token"
              />
              <Button
                label="Sign in with token"
                variant="outlined"
                fullWidth
                testID="login-token-submit"
                onPress={signIn}
              />
            </View>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}
