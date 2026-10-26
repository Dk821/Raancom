export interface Position { latitude: number; longitude: number; accuracy: number }
export interface GeoResult { position: Position | null; problem: string | null }

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable';

/**
 * Check the current geolocation permission state WITHOUT triggering a prompt.
 * Returns 'unavailable' if the Permissions API is not supported.
 */
export async function checkLocationPermission(): Promise<PermissionState> {
  if (!('geolocation' in navigator)) return 'unavailable';
  if (!('permissions' in navigator)) return 'prompt'; // assume prompt if API missing
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state as PermissionState;
  } catch {
    return 'prompt';
  }
}

/** One-shot high-accuracy location. Never throws: a denied/failed lookup returns a readable reason,
 *  and the server records the attendance as "needs review" instead of refusing it. */
export function getPosition(timeoutMs = 15000): Promise<GeoResult> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ position: null, problem: 'This device does not support location.' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({
        position: { latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy },
        problem: null,
      }),
      (err) => resolve({
        position: null,
        problem:
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Your attendance will be saved but flagged for review.'
            : err.code === err.TIMEOUT
              ? 'Could not get your location in time. Your attendance will be flagged for review.'
              : 'Location is unavailable. Your attendance will be flagged for review.',
      }),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
    );
  });
}

// ─── Geoapify Reverse Geocoding ─────────────────────────────────────────────

export interface AddressInfo {
  street: string | null;       // e.g. "Upper Montagu Street"
  houseNumber: string | null;  // e.g. "38"
  area: string | null;         // suburb / neighbourhood
  city: string | null;         // e.g. "City of Westminster"
  district: string | null;     // county / district (county field)
  state: string | null;        // e.g. "England"
  postalCode: string | null;   // e.g. "W1H 1LJ"
  country: string | null;      // e.g. "United Kingdom"
  formattedAddress: string | null; // full one-liner from Geoapify
}

/**
 * Reverse-geocode a lat/lng pair using the Geoapify Geocoding API.
 * Endpoint: GET /v1/geocode/reverse?lat=…&lon=…&apiKey=…
 *
 * Returns null if the API key is missing or the call fails (non-throwing).
 */
export async function geocodeAddress(
  latitude: number,
  longitude: number,
): Promise<AddressInfo | null> {
  const key = import.meta.env.VITE_GEOAPIFY_API_KEY as string | undefined;
  if (!key || key === 'YOUR_GEOAPIFY_API_KEY_HERE') return null;

  try {
    const url =
      `https://api.geoapify.com/v1/geocode/reverse` +
      `?lat=${latitude}&lon=${longitude}&apiKey=${encodeURIComponent(key)}`;

    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return null;

    const json = await res.json();
    // Geoapify returns a GeoJSON FeatureCollection
    const props = json?.features?.[0]?.properties;
    if (!props) return null;

    // Build street: "38 Upper Montagu Street" or just "Upper Montagu Street"
    const houseNumber = props.housenumber ?? null;
    const streetName  = props.street ?? null;
    const street      = streetName
      ? [houseNumber, streetName].filter(Boolean).join(' ')
      : null;

    return {
      street,
      houseNumber,
      area:            props.suburb ?? props.neighbourhood ?? props.quarter ?? null,
      city:            props.city ?? props.town ?? props.village ?? null,
      district:        props.county ?? props.state_district ?? null,
      state:           props.state ?? null,
      postalCode:      props.postcode ?? null,
      country:         props.country ?? null,
      formattedAddress: props.formatted ?? null,
    };
  } catch {
    return null;
  }
}
