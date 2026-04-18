export interface Location {
  lat: number;
  lng: number;
}

export interface WeatherData {
  temp: number;
  condition: string;
  windSpeed: number;
  humidity: number;
  metar?: string;
}

export interface TrafficData {
  level: 'low' | 'moderate' | 'heavy' | 'critical';
  incidents: number;
  activeStatus: string;
}

export interface GlobePoint {
  lat: number;
  lng: number;
  size: number;
  color: string;
  label: string;
}

export interface TransportRoute {
  id: string;
  name: string;
  color: string;
  status: string;
  delay: number;
  path: [number, number, number][]; // [lat, lng, alt]
}

export interface AppState {
  userLocation: Location | null;
  selectedLocation: Location | null;
  intelligenceReport: string | null;
  isLoading: boolean;
  weather: WeatherData | null;
  traffic: TrafficData | null;
  transportRoutes: TransportRoute[];
  layerIntensities: Record<string, number>;
}
