# Frontend, vision, AI, and map database integration

The `frontend`, original `MapFunctionality`, `vision`, and partner `AI&Map-functionality-w/-SpacetimeDB` histories are preserved with merge commits. Existing native voice and private SpacetimeDB code stays in place. The partner public workshop database is separate from that private voice backend.

## Run the web app

From the repository root:

```sh
npm ci --prefix frontend
cp frontend/.env.example frontend/.env.local
# Set VITE_GEOAPIFY_API_KEY in frontend/.env.local, then:
npm run dev
```

Copy root `.env.example` to root `.env.local` for private AI/speech settings. Vite serves the partner `/api/analyze`, `/api/service-centers`, `/api/speak`, `/api/transcribe`, and `/api/health` handlers locally; `/api/vision` remains proxied to the Python gateway. Restart Vite after changing private settings. The current preview is http://127.0.0.1:5177/ with its vision gateway on port 8781.

On Windows use `Copy-Item frontend/.env.example frontend/.env.local`. Geoapify browser keys are public; restrict allowed origins in the provider dashboard. Do not place private backend credentials in a VITE_ variable. For hosting, build with `npm run build` at the repository root and serve `frontend/dist`. Set the map key before building. Deployment settings and production environments are not changed by this merge.

Service → Workshop & Tow → Find nearby workshops asks for location on user action. The browser supplies coordinates to the same Geoapify search core used by the existing mobile app. Real markers, names, phone links, travel estimates, and directions come from returned listings. Results prefer Toyota listings and fall back to nearby repair businesses. Route API failure keeps air-distance results clearly labeled; missing config, denied location, failed requests, and empty results have visible states. Business authorization is not verified.

## Shared logic and preserved services

`shared/roadside.ts` owns search validation, distance calculations, deduplication, Toyota filtering, and route ordering. `ToyotaUTD/src/lib/roadsideFinder.ts` retains the existing exported functions and obtains location through Expo. The web adapter uses browser geolocation and saves returned business listings through the partner upsert reducer. A public service-center subscription shows connection status and shared listing count. Shared rows never replace nearby search results or enter another user's AI conversation. Partial/failed writes remain visible while map results and directions stay usable.

The web assistant uses NVIDIA reasoning with the current session's questions, structured inspection findings, finance selections, and most recent real map search. It does not send raw inspection photos or subscribe to public chat history. Speech endpoints are connected but the supplied ElevenLabs account has no credits; typed AI remains available, and the UI reports speech unavailability. Replacement speech integration is deferred. The supplied cloud vision model returned HTTP 410; the web inspection uses local OpenCV/exterior inference instead. Service bookings and dealer offers remain labeled demos.

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

`.github/workflows/integration.yml` runs frontend/API, native, both database module, and vision checks on main/integration pushes and PRs, and saves the web build as an artifact. These checks do not publish a database or deploy an app. Live Geoapify, NVIDIA, and map database save checks were also performed locally. Device builds and speech sessions require their configured external environments and remain separate from deterministic CI tests.

## Vision integration

The `vision` branch is preserved with a merge commit, including both original standalone interfaces, the synthetic dataset, and model/training documentation. Two README/ignore-rule conflicts were resolved by keeping both sets of content.

Install the lightweight dashboard/gateway dependencies and start the gateway in a second terminal:

```sh
python -m pip install -r requirements.txt cryptography
npm run vision
```

The default API is `http://127.0.0.1:8780`. `npm run dev` proxies `/api/vision` from the web origin to this gateway. `VISION_PROXY_TARGET` can change the local target; `VITE_VISION_API_BASE` configures the web API path for a hosted reverse proxy. Alternate frontend ports must be listed in the gateway's `VISION_ALLOWED_ORIGINS` environment variable. Production hosting needs an actual Python vision service and same-origin reverse proxy; this merge does not provision one or deploy weights.

Inspect uploads real dashboard/exterior photo bytes with entered year, mileage, and exterior angle. The dashboard endpoint invokes the original offline OpenCV detector and scoring rules. Its score and mileage update both Report and Home. Service-history text stays in memory as notes and is not claimed to affect the detector.

The exterior endpoint invokes the original damage detector only when its checkpoint is installed. Missing checkpoints return an explicit unavailable state; checkpoints that fail the original quality gate cannot produce a rating. One exterior photo covers one angle, and missing angles remain visible. Dashboard success is retained when exterior is unavailable, and the reverse partial-success case shows the dashboard as unavailable, never as zero warning lights. No detector result is a mechanical diagnosis.

```sh
npm run test:vision
```

The CI vision job runs both original Python suites plus real loopback gateway tests using the bundled synthetic image. Frontend tests cover actual upload bodies, partial failures, report/Home synchronization, and unavailable states. This verifies integration, not detector accuracy on arbitrary real photos. Full exterior inference also needs the separately documented optional model dependencies and trained checkpoint; see `exterior_vision/README.md` and `MODEL_CARD.md`.
