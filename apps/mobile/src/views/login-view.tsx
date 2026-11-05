import { useState } from 'react';
import type { LoginScreenController } from '../screens/login-screen.js';
import { Body, Button, Field, Muted, Screen, Title } from './primitives.js';

export function LoginView({
  controller,
  onOpenBrowser,
  onSignedIn,
}: {
  controller: LoginScreenController;
  /** Receives the gateway URL to open in the system browser. */
  onOpenBrowser: (url: string) => void;
  onSignedIn: () => void;
}) {
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);

  const signIn = () => {
    if (controller.signInWithToken(token)) {
      setError(null);
      onSignedIn();
    } else {
      setError('Enter a personal access token');
    }
  };

  return (
    <Screen scroll>
      <Title>kaihuman</Title>
      <Body>Sign in with GitHub to open your knowledge base.</Body>
      <Button
        label="Sign in with GitHub"
        testID="login-browser"
        onPress={() => onOpenBrowser(controller.buildLoginUrl())}
      />
      <Muted>or use a personal access token</Muted>
      <Field
        label="Personal access token"
        value={token}
        onChangeText={setToken}
        secureTextEntry
        testID="login-token"
      />
      {error ? <Body>{error}</Body> : null}
      <Button label="Sign in with token" testID="login-token-submit" onPress={signIn} />
      <Button
        label="Try demo"
        testID="login-demo"
        onPress={() => {
          controller.enterDemo();
          onSignedIn();
        }}
      />
    </Screen>
  );
}
