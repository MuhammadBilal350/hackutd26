# Local API settings

Put the public Geoapify browser key in `frontend/.env.local`, using the provided template. Restrict allowed origins in Geoapify to your localhost/deployment origins. VITE_ values are included in browser code even when the file is git-ignored.

Keep private service keys in the root `.env.local`. Never put NVIDIA, ElevenLabs, MarketCheck, or private database credentials in a VITE_ or EXPO_PUBLIC_ variable. The local web API loads NVIDIA_API_KEY/NVIDIA_MODEL and ELEVENLABS_API_KEY/ELEVENLABS_VOICE_ID from this file on startup. The separate native SpacetimeDB voice module still needs its own environment configured remotely. MarketCheck is optional for the original standalone exterior valuation service. No API key is required for offline dashboard analysis.

The public partner database endpoint belongs in frontend/.env.local as VITE_SPACETIMEDB_HOST and VITE_SPACETIMEDB_DATABASE. Server writes use root SPACETIMEDB_HOST and SPACETIMEDB_DATABASE. Anonymous writes work with the partner's public reducer; no private database token is required for the current integration. Never supply an administrative token to a public client.

Restart Vite after editing its environment file. Run `npm run vision` alongside `npm run dev` for photo analysis. The default vision gateway is 127.0.0.1:8780; Vite proxies `/api/vision` to it. Exterior inference still requires its trained checkpoint.

Both actual `.env.local` files and environment-file variants are ignored by Git. Commit only `.env.example` placeholders. Ignore rules do not erase credentials from earlier commits.
