# hackutd26

The web frontend is in `frontend/`; the existing mobile app is in `ToyotaUTD/` and its SpacetimeDB backend remains in `db/spacetime-backend/`.

```sh
npm ci --prefix frontend
npm test
npm run build
npm run dev
```

Configure `frontend/.env.local` from `frontend/.env.example` for live workshop search. The native app uses `EXPO_PUBLIC_GEOAPIFY_API_KEY`; both apps share `shared/roadside.ts`.

See [integration setup, checks, and current service boundaries](docs/integration.md). The GitHub Actions workflow verifies the frontend, native types/lint, and backend types without deploying them.
