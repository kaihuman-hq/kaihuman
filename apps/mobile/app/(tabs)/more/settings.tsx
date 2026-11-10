import { useRouter } from 'expo-router';
import { SettingsView } from '../../../src/views/settings-view.js';

export default function Settings() {
  const router = useRouter();
  return <SettingsView onNavigate={(href) => router.push(href as never)} />;
}
