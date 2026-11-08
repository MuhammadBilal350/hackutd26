# Toyota vehicle decision assistant

An Expo app for comparing the estimated cost of keeping a vehicle with buying
or leasing a replacement. It accepts a vehicle photo, typed or spoken questions,
and optional location lookups for nearby service options.

## Run the app

```bash
npm install
npm run start
```

## Deploy app and APIs on Vercel

1. In Vercel, set **Root Directory** to `ToyotaUTD` (enable including files
   outside the root directory only if Vercel asks). The repository root itself
   is not the Expo app.
2. Set **Framework Preset** to **Other**. The committed `vercel.json` runs
   `npx expo export --platform web` and publishes `dist`. Vercel also deploys
   the app's `api/` directory as serverless functions.
3. In **Project Settings → Environment Variables**, add
   `NVIDIA_API_KEY`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID` for the
   server functions. Optionally add `NVIDIA_MODEL` and `NVIDIA_VISION_MODEL`.
   Never prefix provider secrets with `EXPO_PUBLIC_` or put them in the mobile
   app.
4. Add `EXPO_PUBLIC_API_URL` with your Vercel deployment origin (for example
   `https://your-project.vercel.app`, no trailing slash) and
   `EXPO_PUBLIC_GEOAPIFY_API_KEY` for the existing nearby service finder. These
   public values are embedded into the Expo web build; redeploy after changing
   them. Use the same `EXPO_PUBLIC_API_URL` in a local `.env` when testing a
   native app against the deployed API.
5. Deploy. The health endpoint is `/api/health`; the app uses `/api/analyze`,
   `/api/speak`, and `/api/transcribe`.

For local Expo development, copy `.env.example` to `.env`, set the two
`EXPO_PUBLIC_` values, and restart Expo. Keep provider secrets in Vercel's
environment-variable settings, not in the Expo `.env`.

The client sends photos to the NVIDIA vision model, then sends its observations,
the user's question, the deterministic cost comparison, and recent conversation
turns to the NVIDIA reasoning model. ElevenLabs transcribes voice questions and
speaks replies. When a question asks for a nearby workshop, the app calls the
existing Geoapify finder with device location and passes its result to the
assistant; the LLM does not have direct access to device location or Maps.

## Estimates and limitations

The 10-year keep, loan, and lease comparison is calculated locally from editable
inputs. Vehicle value loss is the difference between the user's entered
purchase price and current value; it is not a market valuation. Lease totals
assume continuous leases and exclude mileage, disposition, and excess-wear
fees. Photos can reveal visible details and dashboard warnings, not hidden
mechanical condition. Nearby listings are not verified as authorized Toyota
dealers or repair centers.

Vehicle identity, mileage, current value, and offers are user-entered; there is
no license-plate lookup, live credit bureau, vehicle valuation, dealer
inventory/pricing, or lender-rate integration configured. Conversation context
is held only while the app screen is open. Enter actual offers and estimates
before using the comparison; the assistant must not present generated values as
quotes or recommend a purchase based on missing data.
