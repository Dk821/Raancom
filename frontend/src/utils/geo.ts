export interface Position { latitude: number; longitude: number; accuracy: number }
export interface GeoResult { position: Position | null; problem: string | null }

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
