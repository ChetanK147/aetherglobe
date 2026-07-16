export interface Location {
  lat: number;
  lng: number;
}

export interface WeatherData {
  temp: number | null;
  condition: string;
  windSpeed: number | null;
  humidity: number | null;
  observed?: string | null;
  source?: string;
}

export interface FlightData {
  id?: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude?: number | null;
  velocity?: number | null;
  track?: number | null;
  squawk?: string | null;
  aircraft?: string | null;
  registration?: string | null;
}

export interface CriticalEvent {
  id: string;
  magnitude: number;
  place: string;
  time: number;
  lat: number;
  lng: number;
  depth?: number;
  url?: string;
}

export interface AppState {
  userLocation: Location | null;
  selectedLocation: Location | null;
  intelligenceReport: string | null;
  isLoading: boolean;
  weather: WeatherData | null;
  layerIntensities: Record<string, number>;
  surfaceViewActive: boolean;
  liveFlights: FlightData[];
  criticalEvents: CriticalEvent[];
}
