# ToyotaUTD app

This Expo Router app supports mobile browsers and native iOS. On the web, the voice assistant uses ElevenLabs Conversational AI over WebRTC. The live conversation connects from `/voice` using a short-lived token issued by SpacetimeDB. The ElevenLabs agent is configured to use NVIDIA Nemotron (`nemotron-35-super-vl-nvfp4`); its model and voice settings live in the ElevenLabs agent configuration, not in the client bundle.

## Mobile browser

For microphone access on a phone, serve the web app over HTTPS. Vercel provides HTTPS for deployed previews and production URLs. The static Expo export can also be hosted on Vercel.

For local development, run `npm run web` and open the address Expo prints. To create the production web bundle, run:

```bash
npm run build:web
```

To deploy with Vercel, import this repository and set **Root Directory** to `ToyotaUTD`. The included `vercel.json` builds the static Expo web export into `dist`. Add `EXPO_PUBLIC_GEOAPIFY_API_KEY` in Vercel's environment settings only if the map feature needs it. Keep provider secret keys in server-side configuration or provider-managed agent settings; never use an `EXPO_PUBLIC_` prefix for secrets.

## Native iOS development

The ElevenLabs React Native SDK uses LiveKit WebRTC native modules, so the native app needs an iOS development build. Expo Go does not include these native modules.

1. Install dependencies with `npm install`.
2. Build the iOS development app:

   ```bash
   npx eas-cli@latest build --profile development --platform ios
   ```

   Install the resulting app on your iPhone. Scanning the QR code with Expo Go will not enable real-time voice.
3. Start Metro for the installed development app:

   ```bash
   npm run dev:mobile
   ```

   Keep the phone and computer on the same network, then scan the QR code with the installed ToyotaUTD development app.

The app requests microphone access for voice conversations. The voice agent token is issued by the SpacetimeDB backend; API secrets stay on the backend and are not embedded in the mobile bundle.

## Project checks

```bash
npx expo lint
npx tsc --noEmit
```

Routes live in `src/app/`; reusable code lives in `src/lib/` and `src/components/`.
