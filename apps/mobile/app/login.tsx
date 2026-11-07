import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo } from 'react';
import { LoginScreenController } from '../src/screens/login-screen.js';
import { LoginView } from '../src/views/login-view.js';

// expo-constants' CJS-style typings make the default import resolve to the module namespace under NodeNext.
interface ConstantsLike {
  expoConfig?: { extra?: Record<string, unknown> } | null;
}

const DEFAULT_GATEWAY = 'https://auth.kaihuman.com/login';

export default function Login() {
  const router = useRouter();
  const gateway =
    ((Constants as unknown as ConstantsLike).expoConfig?.extra?.authGatewayUrl as
      | string
      | undefined) ?? DEFAULT_GATEWAY;
  const controller = useMemo(() => new LoginScreenController(gateway), [gateway]);
  const url = Linking.useURL();

  useEffect(() => {
    if (url && controller.handleDeepLink(url)) router.replace('/dashboard');
  }, [url, controller, router]);

  return (
    <>
      <Stack.Screen options={{ title: 'Sign in' }} />
      <LoginView
        controller={controller}
        openAuthSession={WebBrowser.openAuthSessionAsync}
        onSignedIn={() => router.replace('/dashboard')}
      />
    </>
  );
}
