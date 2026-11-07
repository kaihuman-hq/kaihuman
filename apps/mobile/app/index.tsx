import { authStore } from '@kaihuman/core';
import { Redirect } from 'expo-router';
import { useSignalValue } from '../src/views/use-signal.js';

export default function Index() {
  const token = useSignalValue(authStore.token);
  return <Redirect href={token ? '/dashboard' : '/login'} />;
}
