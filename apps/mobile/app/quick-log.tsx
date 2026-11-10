import { useLocalSearchParams } from 'expo-router';
import { QuickCaptureScreen } from '../src/views/quick-capture-screen.js';

const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);

export default function QuickLog() {
  const { idea, text } = useLocalSearchParams<{
    idea?: string | string[];
    text?: string | string[];
  }>();
  return <QuickCaptureScreen kind="log" idea={first(idea)} text={first(text)} />;
}
