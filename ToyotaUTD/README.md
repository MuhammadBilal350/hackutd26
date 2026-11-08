# ToyotaUTD mobile app

This is a mobile-first Expo Router app. The voice assistant uses ElevenLabs Conversational AI with LiveKit WebRTC, so it needs a custom Expo development build. Expo Go does not include the WebRTC native modules used by the voice SDK.

## Run on a phone

1. Install dependencies with `npm install`.
2. Build and install the development app once:

   ```bash
   npx eas-cli@latest build --profile development --platform ios
   # or use --platform android
   ```

   Follow the EAS prompts to sign in and install the resulting app on your phone. Scanning the QR code with Expo Go will not enable real-time voice.
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
