// Fetch live flights via backend proxy (FR24 backed)
export async function getLiveFlights(minLat: number, minLng: number, maxLat: number, maxLng: number) {
  try {
    const url = `/api/flights?lamin=${minLat}&lomin=${minLng}&lamax=${maxLat}&lomax=${maxLng}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Proxy API error.');
    const data = await response.json();
    return data.flights || [];
  } catch (error) {
    console.warn("Could not fetch live flights:", error);
    return []; 
  }
}

// Fetch live critical events via USGS Earthquakes (since GDACS CORS can be tricky, USGS is reliable JSONP/CORS friendly)
export async function getCriticalEvents() {
  try {
    const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('USGS fetch failed');
    const data = await response.json();
    return data.features.map((feature: any) => ({
      id: feature.id,
      title: feature.properties.title,
      mag: feature.properties.mag,
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
      time: feature.properties.time,
      url: feature.properties.url
    }));
  } catch (error) {
    console.warn("Could not fetch critical events:", error);
    return [];
  }
}
