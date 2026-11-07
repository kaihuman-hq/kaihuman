import { authStore, githubProfileStore } from '@kaihuman/core';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { MoreView } from '../../../src/views/more-view.js';
import { useSignalValue } from '../../../src/views/use-signal.js';

// Same NodeNext default-import typing quirk as app/login.tsx.
const appVersion = (Constants as unknown as { expoConfig?: { version?: string } | null }).expoConfig
  ?.version;

export default function More() {
  const router = useRouter();
  const user = useSignalValue(authStore.user);
  const repo = useSignalValue(githubProfileStore.currentRepo);
  const signOut = () => {
    authStore.logout();
    router.replace('/login');
  };
  const confirmSignOut = () => {
    // Alert.alert is a no-op on web, so the preview signs out directly.
    if (Platform.OS === 'web') return signOut();
    Alert.alert('Sign out?', 'You can sign in again with GitHub at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };
  return (
    <MoreView
      onNavigate={(href) => router.push(href as never)}
      onSignOut={confirmSignOut}
      version={appVersion ?? ''}
      account={user ? { name: user.name ?? user.login, login: user.login } : undefined}
      repo={repo?.full_name}
    />
  );
}
