import { useLocalSearchParams } from 'expo-router';
import { QuickCaptureScreen } from '../src/views/quick-capture-screen.js';

export default function QuickLog() {
  const { idea } = useLocalSearchParams<{ idea?: string | string[] }>();
  return <QuickCaptureScreen kind="log" idea={Array.isArray(idea) ? idea[0] : idea} />;
}
