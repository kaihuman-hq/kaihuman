import { authStore } from '@kaihuman/core';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Alert, Platform } from 'react-native';
import { MoreView } from '../../../src/views/more-view.js';

// Same NodeNext default-import typing quirk as app/login.tsx.
const appVersion = (Constants as unknown as { expoConfig?: { version?: string } | null }).expoConfig
  ?.version;

export default function More() {
  const router = useRouter();
  const signOut = () => {
    authStore.logout();
    router.replace('/login');
  };
  const confirmSignOut = () => {
    // Alert.alert is a no-op on web, so the preview signs out directly.
    if (Platform.OS === 'web') return signOut();
    Alert.alert('Sign out?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  };
  return (
    <MoreView
      onNavigate={(href) => router.push(href as never)}
      onSignOut={confirmSignOut}
      version={appVersion ?? ''}
    />
  );
}
