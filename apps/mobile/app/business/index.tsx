import { Stack, useRouter } from 'expo-router';
import { useBusiness } from '../../src/business/use-business.js';
import { routeQuery } from '../../src/navigation/routes.js';
import { BusinessView } from '../../src/views/business-view.js';

/** `/business`: timer, hours, what needs attention, open invoices and clients. */
export default function Business() {
  const router = useRouter();
  const { state, now, today, refreshing, onRefresh, act } = useBusiness();
  return (
    <>
      <Stack.Screen options={{ title: 'Business' }} />
      <BusinessView
        state={state}
        now={now}
        today={today}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onOpenClient={(slug) => router.push(`/business/client/${slug}` as never)}
        onOpenInvoice={(n) => router.push(routeQuery('/business/payment', { invoice: n }) as never)}
        onStartTimer={(client) => void act((w) => w.startTimer({ client }))}
        onLogTime={() => router.push('/business/time' as never)}
        onStopTimer={() => router.push('/business/time?fromTimer=1' as never)}
        onCancelTimer={() => void act((w) => w.cancelTimer())}
      />
    </>
  );
}
