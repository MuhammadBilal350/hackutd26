# Camry companion

Interactive frontend built with React, TypeScript, and React Native Web. No Expo. The supplied light and dark image sheets guide the mobile layouts, cards, navigation, and colors.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (currently http://localhost:5173).

```sh
npm test
npm run build
npm run preview
```

## Included

Home, forecast, inspection uploads, report, maintenance, workshops, financing, dealer offers, and a voice preview. Both themes, animated screen entrances and chart bars, voice pulses, reduced-motion support, local theme persistence, and financing calculations are implemented.

The core layout uses React Native Web View, Text, Pressable, TextInput, and Switch. Browser-specific file inputs, SVG icons, charts, and CSS handle web presentation. This source is prepared for browser rendering; native iOS/Android packaging would require platform adapters for those web-specific pieces.

Vehicle defaults, financing, and dealer data remain illustrative. Inspection now sends real photos to the Python vision API; start it from the repository root with `npm run vision` after installing `requirements.txt`. Dashboard reports update the home score. Exterior results require the original model checkpoint and quality gate; unavailable components are clearly reported. Booking and price actions show local confirmations. Voice remains a preset preview with no audio capture. Workshop search uses the shared original Geoapify integration: configure VITE_GEOAPIFY_API_KEY in .env.local, then select Service → Workshop & Tow → Find nearby workshops. It requests location only on that action and displays provider listings, markers, distances, calls, and directions. No reservations or deployments are made. See ../docs/integration.md for setup and service boundaries.

Demo fixtures and financing logic live in `src/domain.ts`; shared components are in `src/ui.tsx`; screen views are in `src/screens.tsx`; navigation and theme state are in `src/App.tsx`.

## Verification

Production builds and automated checks cover the frontend flows plus shared map filtering, routing fallback, input validation, and browser search states. Root CI also checks the existing mobile app lint/types and SpacetimeDB module types. External provider availability and native device sessions require separate live environments.

