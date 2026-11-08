# Frontend and original map integration

The `frontend` and original `MapFunctionality` histories are preserved with merge commits. No AI/Map+SpacetimeDB, vision, voice, or other feature branch is included. Existing `main` voice and SpacetimeDB code stays in place.

## Run the web app

From the repository root:

```sh
npm ci --prefix frontend
cp frontend/.env.example frontend/.env.local
# Set VITE_GEOAPIFY_API_KEY in frontend/.env.local, then:
npm run dev
```

On Windows use `Copy-Item frontend/.env.example frontend/.env.local`. Geoapify browser keys are public; restrict allowed origins in the provider dashboard. Do not place private backend credentials in a VITE_ variable. For hosting, build with `npm run build` at the repository root and serve `frontend/dist`. Set the map key before building. Deployment settings and production environments are not changed by this merge.

Service → Workshop & Tow → Find nearby workshops asks for location on user action. The browser supplies coordinates to the same Geoapify search core used by the existing mobile app. Real markers, names, phone links, travel estimates, and directions come from returned listings. Results prefer Toyota listings and fall back to nearby repair businesses. Route API failure keeps air-distance results clearly labeled; missing config, denied location, failed requests, and empty results have visible states. Business authorization is not verified.

## Shared logic and preserved services

`shared/roadside.ts` owns search validation, distance calculations, deduplication, Toyota filtering, and route ordering. `ToyotaUTD/src/lib/roadsideFinder.ts` retains the existing exported functions and obtains location through Expo. The web adapter uses browser geolocation. Neither app persists search results to SpacetimeDB; the original map branch did not implement that contract. The existing ElevenLabs/SpacetimeDB voice integration remains in ToyotaUTD; the new web voice screen remains a labeled preview. Photo analysis, service bookings, and dealer offers in the new frontend remain labeled demos.

## Checks

```sh
npm test
npm run build
cd ToyotaUTD
npm ci --ignore-scripts
npm run lint
npx --no-install tsc --noEmit
cd ../db/spacetime-backend/spacetimedb
npm ci --ignore-scripts
npx --no-install tsc --noEmit
```

`.github/workflows/integration.yml` runs these frontend, native, and backend checks on main/integration pushes and PRs, and saves the web build as an artifact. These checks do not publish a database or deploy an app. Device builds, live Geoapify responses, and ElevenLabs sessions require their configured external environments and remain separate from deterministic CI tests.
