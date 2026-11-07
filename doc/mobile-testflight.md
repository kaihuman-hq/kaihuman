# Mobile: EAS Build → TestFlight (Linux only)

EAS builds the iOS app in Expo's cloud, so no Mac or Xcode is needed. Config: `apps/mobile/eas.json`, `apps/mobile/app.json`, `apps/mobile/app.config.ts`.

## Prerequisites

- An [Expo account](https://expo.dev/signup) (free plan works; see the build quota below).
- An Apple Developer account (paid, 99 USD/year) and access to [App Store Connect](https://appstoreconnect.apple.com) with the Admin or App Manager role.
- Node 18+.

## One-time setup

```sh
npm i -g eas-cli
eas login
cd apps/mobile
eas init          # creates the Expo project and writes extra.eas.projectId; commit that change
```

## Build

```sh
eas build -p ios --profile production
```

EAS asks, once:

1. **Apple ID** (and 2FA code), then which **team**.
2. Whether to **log in to the Apple account and let EAS manage credentials**: answer yes. EAS then creates the distribution certificate, the App IDs, the App Group `group.com.kaihuman.app`, and the provisioning profiles for **both** the app (`com.kaihuman.app`) and the widget extension (`com.kaihuman.app.widgets`, declared under `extra.eas.build.experimental.ios.appExtensions`).
3. Whether to register the app in App Store Connect when you submit (below).

Version numbers: `cli.appVersionSource` is `remote` and `production` has `autoIncrement`, so the build number rises on every build. Bump `version` in `app.json` for a new marketing version.

## Submit to TestFlight

```sh
eas submit -p ios --latest
```

EAS asks how to authenticate:

- **App Store Connect API key (recommended)**: App Store Connect → Users and Access → Integrations → Keys → create a key with the App Manager role. Let EAS generate and store one, or give it the `.p8`, Key ID and Issuer ID. No 2FA prompts, works in CI.
- **Apple ID**: simpler, prompts for the password and 2FA each time.

It also asks for the **ASC App ID** (numeric) if the app does not exist yet; EAS can create the app record for you. `ascAppId`/`appleId` are deliberately not in `eas.json`, so EAS asks interactively. After processing (about 10 to 30 minutes) the build appears in TestFlight.

### Export compliance (decide this)

The app does **not** set `ITSAppUsesNonExemptEncryption`, on purpose. It uses HTTPS (exempt), but it also encrypts user data itself with AES-GCM-256 / PBKDF2 through `@noble/ciphers` and the WebCrypto polyfill (`src/runtime/crypto-polyfill.ts`). That is encryption beyond the operating system's, so Apple's questionnaire treats it as non-exempt (it usually qualifies for the standard-encryption exemption, which needs a self-classification report in some regions). With the key unset, App Store Connect asks the export-compliance questions for each build. Answer them for your situation, or ask a lawyer. If you conclude the app is exempt, add `"ITSAppUsesNonExemptEncryption": false` to `ios.infoPlist` in `app.json` to skip the prompt.

## TestFlight testers

1. App Store Connect → your app → TestFlight → **Internal Testing** → `+` → create a group, enable automatic distribution, add testers. Internal testers must be users of your App Store Connect team (Users and Access); up to 100, no Apple review.
2. On the iPhone, install **TestFlight** from the App Store, sign in with the same Apple ID, accept the invite, tap **Install**.

## Add widgets

Long-press the Home Screen → `+` → search **kaihuman** → pick a widget and size → Add Widget. Lock Screen widgets: long-press the Lock Screen → Customize. Controls: Control Center → Add a Control. Sign in to the app once first so the widgets can read the shared data.

## Changing the bundle ID

Edit **only** `ios.bundleIdentifier` in `apps/mobile/app.json`. The widget id (`<id>.widgets`), the App Group (`group.<id>`), entitlements, Info.plist keys, the keychain service and the EAS `appExtensions` entry are all derived from it by `plugins/with-kaihuman-widgets.ts` and `app.config.ts` (tests: `src/targets.test.ts`). `android.package` is separate and Android-only; leave it unless you also update `kh_shortcuts.xml` and the widget configure activity, which reference `com.kaihuman.app`. Then rebuild.

## Troubleshooting

- **Bundle ID is not available / already taken**: pick another id (reverse-DNS of a domain you own), change it as above, run `eas build` again.
- **App Group missing / profile does not include the group**: in the Apple developer portal check Identifiers → App Groups has `group.<id>`, and both App IDs (app and `.widgets`) have App Groups enabled with it. Easiest fix: `eas credentials -p ios` → remove the provisioning profiles (and, if needed, the App IDs' capability) and run the build again so EAS regenerates them.
- **Free-plan build quota**: the free plan has a small monthly build allowance and iOS builds can queue for a long time. Check expo.dev → Billing. Wait for the reset, or pay for a plan. `--local` builds need macOS, so they are not an option on Linux.
- **Rebuild**: `eas build -p ios --profile production` (a new build number is assigned), then `eas submit -p ios --latest`. Or `eas build -p ios --profile production --auto-submit`.
- **Build number already used**: the remote counter is the source of truth; run `eas build:version:get -p ios` / `eas build:version:set -p ios`.

## Optional: development client

```sh
eas device:create                       # register your iPhone's UDID (opens a link to install a profile)
eas build -p ios --profile development  # internal distribution; install from the build page
npx expo start --dev-client
```

Run `eas device:create` before the build so the iPhone is in the ad-hoc profile. Internal builds need a registered device, TestFlight does not.
