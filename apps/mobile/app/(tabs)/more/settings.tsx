import { useRouter } from 'expo-router';
import { useSyncNow } from '../../../src/sync/hooks.js';
import { SettingsView } from '../../../src/views/settings-view.js';

export default function Settings() {
  const router = useRouter();
  const sync = useSyncNow();
  return <SettingsView onNavigate={(href) => router.push(href as never)} sync={sync} />;
}
