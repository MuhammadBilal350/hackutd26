
const API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;

const PLACES_URL = "https://api.geoapify.com/v2/places";
const ROUTE_MATRIX_URL = "https://api.geoapify.com/v1/routematrix";

export interface ServiceCenter {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lon: number;
  distanceMiles: number;
  drivingDistanceMiles: number | null;
  durationMinutes: number | null;
  isToyotaRelated: boolean;
  authorization: "unverified";
}

export interface FinderResult {
  userLocation: {
    lat: number;
    lon: number;
  };
  nearest: ServiceCenter | null;
  centers: ServiceCenter[];
  usedFallback: boolean;
}

// Check API key
function checkApiKey() {
  if (!API_KEY) {
    throw new Error(
      "Geoapify API key missing. Add EXPO_PUBLIC_GEOAPIFY_API_KEY to your project-root .env file."
    );
  }
}

// Validate coordinates
function validateLocation(location: {
  lat: number;
  lon: number;
}) {
  if (
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lon) ||
    location.lat < -90 ||
    location.lat > 90 ||
    location.lon < -180 ||
    location.lon > 180
  ) {
    throw new Error("Invalid location coordinates.");
  }
}

// Get driver's current location using Expo
export async function getUserLocation() {
  const Location = await import("expo-location");

  const { status } = await Location.requestForegroundPermissionsAsync();

  if (status !== "granted") {
    throw new Error("Location permission was not granted.");
  }

  const location = await Location.getCurrentPositionAsync({});

  return {
    lat: location.coords.latitude,
    lon: location.coords.longitude,
  };
}

// Calculate straight-line distance in miles
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8;
  const radians = (value: number) =>
    (value * Math.PI) / 180;

  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return (
    2 *
    R *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  );
}

// Search Geoapify for nearby vehicle repair businesses
async function searchNearbyServiceCenters(
  location: { lat: number; lon: number },
  radiusMiles = 25
): Promise<ServiceCenter[]> {
  checkApiKey();

  const radiusMeters = Math.round(radiusMiles * 1609.34);

  const params = new URLSearchParams({
    categories: "service.vehicle.repair,commercial.vehicle",
    filter: `circle:${location.lon},${location.lat},${radiusMeters}`,
    bias: `proximity:${location.lon},${location.lat}`,
    limit: "50",
    lang: "en",
    apiKey: API_KEY!,
  });

  const response = await fetch(
    `${PLACES_URL}?${params.toString()}`
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(
      `Geoapify Places error ${response.status}: ${error.slice(0, 200)}`
    );
  }

  const data = await response.json();

  const centers: ServiceCenter[] = (data.features || [])
    .map((feature: any): ServiceCenter | null => {
      const properties = feature.properties || {};
      const coordinates = feature.geometry?.coordinates;

      const lat =
        properties.lat ?? coordinates?.[1];

      const lon =
        properties.lon ?? coordinates?.[0];

      if (
        typeof lat !== "number" ||
        typeof lon !== "number"
      ) {
        return null;
      }

      const raw = properties.datasource?.raw || {};

      const name =
        properties.name ||
        properties.address_line1 ||
        "Auto Repair Center";

      const brand =
        properties.brand ||
        raw.brand ||
        "";

      const address =
        properties.formatted ||
        [
          properties.address_line1,
          properties.address_line2,
        ]
          .filter(Boolean)
          .join(", ") ||
        "Address not listed";

      return {
        id:
          properties.place_id ||
          `${lat}-${lon}`,
        name,
        address,
        phone:
          properties.phone ||
          raw.phone ||
          raw["contact:phone"] ||
          null,
        lat,
        lon,
        distanceMiles: calculateDistance(
          location.lat,
          location.lon,
          lat,
          lon
        ),
        drivingDistanceMiles: null,
        durationMinutes: null,
        isToyotaRelated: /toyota/i.test(
          `${name} ${brand}`
        ),
        authorization: "unverified",
      };
    })
    .filter(
      (center: ServiceCenter | null): center is ServiceCenter =>
        center !== null
    );

  // Remove duplicate locations
  const uniqueCenters = Array.from(
    new Map(
      centers.map((center) => [center.id, center])
    ).values()
  );

  return uniqueCenters.sort(
    (a, b) => a.distanceMiles - b.distanceMiles
  );
}

// Get driving distances and estimated times
async function addDrivingDistances(
  location: { lat: number; lon: number },
  centers: ServiceCenter[]
): Promise<ServiceCenter[]> {
  checkApiKey();

  const candidates = centers.slice(0, 10);

  if (candidates.length === 0) {
    return [];
  }

  try {
    const response = await fetch(
      `${ROUTE_MATRIX_URL}?apiKey=${encodeURIComponent(API_KEY!)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: "drive",
          sources: [
            {
              location: [location.lon, location.lat],
            },
          ],
          targets: candidates.map((center) => ({
            location: [center.lon, center.lat],
          })),
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(
        `Geoapify Route Matrix error ${response.status}: ${error.slice(0, 200)}`
      );
    }

    const data = await response.json();

    const routes = data.sources_to_targets?.[0] || [];

    return candidates
      .map((center, index) => {
        const route = routes[index];

        const distance =
          typeof route?.distance === "number"
            ? route.distance
            : null;

        const duration =
          typeof route?.time === "number"
            ? route.time
            : null;

        return {
          ...center,
          drivingDistanceMiles:
            distance === null
              ? null
              : distance / 1609.34,
          durationMinutes:
            duration === null
              ? null
              : Math.round(duration / 60),
        };
      })
      .sort((a, b) => {
        if (a.durationMinutes === null) return 1;
        if (b.durationMinutes === null) return -1;

        return a.durationMinutes - b.durationMinutes;
      });
  } catch (error) {
    console.warn(
      "Driving routes unavailable. Using straight-line distance.",
      error
    );

    return candidates;
  }
}

// MAIN FUNCTION
export async function findNearestToyotaCenter(
  providedLocation?: {
    lat: number;
    lon: number;
  },
  radiusMiles = 25
): Promise<FinderResult> {
  checkApiKey();

  const userLocation =
    providedLocation || (await getUserLocation());

  validateLocation(userLocation);

  // Search nearby repair shops
  const allCenters = await searchNearbyServiceCenters(
    userLocation,
    radiusMiles
  );

  // Prefer Toyota-related listings
  const toyotaCenters = allCenters.filter(
    (center) => center.isToyotaRelated
  );

  const usedFallback = toyotaCenters.length === 0;

  const selectedCenters = usedFallback
    ? allCenters
    : toyotaCenters;

  // Calculate driving distances
  const centers = await addDrivingDistances(
    userLocation,
    selectedCenters
  );

  return {
    userLocation,
    nearest: centers[0] || null,
    centers,
    usedFallback,
  };
  /*
  How to test:
  1. Ensure the EXPO_PUBLIC_GEOAPIFY_API_KEY is set in the .env file.
  2. Call findNearestToyotaCenter() with or without a provided location.
  3. Check the returned result for the nearest Toyota center and driving distances.

  Run in terminal:
  cd ~/hackutd26/ToyotaUTD

set -a
source .env
set +a

npx tsx -e "import('./src/app/roadsideFinder.ts').then(async m => { const r = await m.findNearestToyotaCenter({lat:32.9483,lon:-96.7299}); console.log('CENTERS FOUND:',r.centers.length); console.log('NEAREST:',r.nearest); console.log('RESULTS:',r.centers); console.log('FALLBACK:',r.usedFallback); }).catch(console.error)"
  */
}
