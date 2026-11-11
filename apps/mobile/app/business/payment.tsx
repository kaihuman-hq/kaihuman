import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, ScrollView } from 'react-native';
import { useBusiness } from '../../src/business/use-business.js';
import { BusinessPaymentSheet } from '../../src/views/business-payment-sheet.js';

/** `/business/payment?invoice=<number>`: records a payment against an issued invoice. */
export default function BusinessPayment() {
  const { invoice = '' } = useLocalSearchParams<{ invoice?: string }>();
  const router = useRouter();
  const { state, today, act } = useBusiness();
  const dismiss = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace('/business' as never)),
    [router],
  );
  return (
    <>
      <Stack.Screen options={{ title: 'Record payment', headerShown: false }} />
      <ScrollView keyboardShouldPersistTaps="handled">
        {state?.status === 'ready' ? (
          <BusinessPaymentSheet
            repo={state.repo}
            invoice={invoice}
            today={today}
            onClose={dismiss}
            onSubmit={async (payment) => {
              const ok = await act((w) => w.recordPayment(payment));
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
