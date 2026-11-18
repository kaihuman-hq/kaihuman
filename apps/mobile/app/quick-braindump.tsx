import { useLocalSearchParams } from 'expo-router';
import { QuickCaptureScreen } from '../src/views/quick-capture-screen.js';

export default function QuickBraindump() {
  const { text } = useLocalSearchParams<{ text?: string | string[] }>();
  return <QuickCaptureScreen kind="braindump" text={Array.isArray(text) ? text[0] : text} />;
}
