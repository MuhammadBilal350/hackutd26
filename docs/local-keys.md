# Local API settings

Put the public Geoapify browser key in `frontend/.env.local`, using the provided template. Restrict allowed origins in Geoapify to your localhost/deployment origins. VITE_ values are included in browser code even when the file is git-ignored.

Keep private service keys in the root `.env.local`. Never put ElevenLabs, MarketCheck, or other private credentials in a VITE_ or EXPO_PUBLIC_ variable. ElevenLabs is currently consumed by the existing remote SpacetimeDB voice module, so it must be configured in that module's environment too; a local file does not configure the remote service or turn the web voice preview into a live voice client. MarketCheck is optional for the original standalone exterior valuation service. Neither key is required for offline dashboard analysis.

Restart Vite after editing its environment file. Run `npm run vision` alongside `npm run dev` for photo analysis. The default vision gateway is 127.0.0.1:8780; Vite proxies `/api/vision` to it. Exterior inference still requires its trained checkpoint.

Both actual `.env.local` files and environment-file variants are ignored by Git. Commit only `.env.example` placeholders. Ignore rules do not erase credentials from earlier commits.
