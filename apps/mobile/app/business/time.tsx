import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { useBusiness } from '../../src/business/use-business.js';
import { BusinessTimeSheet } from '../../src/views/business-time-sheet.js';

/** `/business/time?client=&project=&fromTimer=1`: the log-time sheet; `fromTimer` stops the timer. */
export default function BusinessTime() {
  const { client, project, fromTimer } = useLocalSearchParams<{
    client?: string;
    project?: string;
    fromTimer?: string;
  }>();
  const router = useRouter();
  const { state, now, today, act } = useBusiness();
  const dismiss = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace('/business' as never)),
    [router],
  );
  return (
    <>
      <Stack.Screen
        options={{ title: fromTimer ? 'Stop timer' : 'Log time', headerShown: false }}
      />
      <ScrollView keyboardShouldPersistTaps="handled">
        {state?.status === 'ready' ? (
          <BusinessTimeSheet
            repo={state.repo}
            now={now}
            today={today}
            {...(client ? { client } : {})}
            {...(project ? { project } : {})}
            fromTimer={fromTimer === '1'}
            onClose={dismiss}
            onSubmit={async (entry, opts) => {
              const ok = await act((w) => w.logTime(entry, opts));
              if (ok) dismiss();
              return ok;
            }}
          />
        ) : (
          <ActivityIndicator style={{ padding: 24 }} />
        )}
      </ScrollView>
    </>
  );
}
