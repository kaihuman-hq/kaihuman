import { Redirect } from 'expo-router';

// `kaihuman://auth/callback?...` also reaches expo-router as a path. The token itself is consumed by
// the link handler (startAppLinkHandling) or the auth session; this only stops "Unmatched route".
export default function AuthCallback() {
  return <Redirect href="/" />;
}
