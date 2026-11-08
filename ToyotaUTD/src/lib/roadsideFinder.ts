import { createRoadsideFinder, type Coordinates } from '../../../shared/roadside';
export type { ServiceCenter, FinderResult } from '../../../shared/roadside';

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


const search = createRoadsideFinder(process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY);
export async function findNearestToyotaCenter(providedLocation?: Coordinates, radiusMiles = 25) {
  return search(providedLocation ?? await getUserLocation(), radiusMiles);
}
