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

All listings and vehicle data are illustrative. Inspection returns a fixed demo report; photos remain in browser memory and are not uploaded. Booking and price actions show local confirmations. Voice is animated, with preset demo responses and no audio capture. The map is illustrative; its Open in Maps link searches Google Maps. There are no backend requests, deployment steps, or real reservations.

Demo fixtures and financing logic live in `src/domain.ts`; shared components are in `src/ui.tsx`; screen views are in `src/screens.tsx`; navigation and theme state are in `src/App.tsx`.

## Verification

Production build and seven automated checks cover financing edge cases, photo requirements, navigation, appointment selection, and theme switching. The home screen was visually checked in the in-app browser after repairing the preview server and correcting React Native Web text selectors. Full visual parity across all screens remains unverified.

