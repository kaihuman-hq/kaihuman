import { useRouter } from 'expo-router';
import { CaptureHubView } from '../../../src/views/capture-hub-view.js';

export default function Capture() {
  const router = useRouter();
  return <CaptureHubView onSelect={(kind) => router.push(`/quick-${kind}`)} />;
}
