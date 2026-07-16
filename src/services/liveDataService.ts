import type { CriticalEvent, FlightData } from '../types';

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getLiveFlights(
  minLat: number,
  minLng: number,
  maxLat: number,
  maxLng: number,
): Promise<FlightData[]> {
  try {
    const params = new URLSearchParams({
      lamin: String(minLat),
      lomin: String(minLng),
      lamax: String(maxLat),
      lomax: String(maxLng),
    });
    const data = await readJson<{ flights: FlightData[] }>(await fetch(`/api/flights?${params}`));
    return data.flights || [];
  } catch (error) {
    console.warn('Could not fetch live flights:', error);
    return [];
  }
}

export async function getCriticalEvents(): Promise<CriticalEvent[]> {
  try {
    const data = await readJson<{ earthquakes: CriticalEvent[] }>(await fetch('/api/live/usgs'));
    return data.earthquakes || [];
  } catch (error) {
    console.warn('Could not fetch USGS events:', error);
    return [];
  }
}
