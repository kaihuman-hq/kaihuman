import type { Slug } from '@kaihuman/formats/business';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useBusiness } from '../../../src/business/use-business.js';
import { routeQuery } from '../../../src/navigation/routes.js';
import { BusinessClientView } from '../../../src/views/business-client-view.js';

/** `/business/client/<slug>`: one client's money, time, todos and log. */
export default function BusinessClient() {
  const { slug = '' } = useLocalSearchParams<{ slug?: string }>();
  const router = useRouter();
  const { state, today, refreshing, onRefresh, act } = useBusiness();
  const name =
    state?.status === 'ready' ? state.repo.clients.find((c) => c.slug === slug)?.name : undefined;
  return (
    <>
      <Stack.Screen options={{ title: name ?? 'Client' }} />
      <BusinessClientView
        state={state}
        slug={slug}
        today={today}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onAddLine={(kind, text) => act((w) => w.addClientLine(kind, slug as Slug, text))}
        onStartTimer={(project) =>
          void act((w) => w.startTimer({ client: slug as Slug, ...(project ? { project } : {}) }))
        }
        onLogTime={(project) =>
          router.push(routeQuery('/business/time', { client: slug, project }) as never)
        }
        onOpenInvoice={(n) => router.push(routeQuery('/business/payment', { invoice: n }) as never)}
        onOpenFile={(path) =>
          router.push(`/files/${path.split('/').map(encodeURIComponent).join('/')}` as never)
        }
      />
    </>
  );
}
