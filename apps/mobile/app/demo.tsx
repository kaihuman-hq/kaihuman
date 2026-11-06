import { Redirect } from 'expo-router';
import { enterDemoOnce } from '../src/runtime/pending-url.js';

// Target of `kaihuman://demo`. Enters demo mode before redirecting because on a cold start the
// router resolves this route before the link handler's async initial-URL lookup finishes.
export default function Demo() {
  enterDemoOnce();
  return <Redirect href="/dashboard" />;
}
