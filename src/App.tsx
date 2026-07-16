import { lazy, Suspense, useEffect, useState } from 'react';
import { BrainCircuit, Map as MapIcon, PanelRightOpen } from 'lucide-react';
import NavigationHUD from './components/NavigationHUD';
import VisionProHUD from './components/VisionProHUD';
import TacticalHUD from './components/TacticalHUD';
import GTA6Interface from './components/GTA6Interface';
import type { AppState, WeatherData } from './types';
import { getGlobalIntelligence } from './services/intelligenceService';
import { getCriticalEvents, getLiveFlights } from './services/liveDataService';

const AtmosphericGlobe = lazy(() => import('./components/AtmosphericGlobe'));
const TacticalMap = lazy(() => import('./components/TacticalMap'));
const IntelligenceCenter = lazy(() => import('./components/IntelligenceCenter'));

const DEFAULT_LOCATION = { lat: 34.0151, lng: 71.5249 };
type UiMode = 'vision' | 'tactical' | 'gta6';
type MobilePanel = 'intelligence' | 'status' | null;

function weatherCodeToCondition(code: number | null): string {
  if (code === null) return 'Unavailable';
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Partly cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Mixed conditions';
}

async function fetchWeather(lat: number, lng: number): Promise<WeatherData | null> {
  try {
    const params = new URLSearchParams({ lat: String(lat), lng: String(lng) });
    const response = await fetch(`/api/weather?${params}`);
    const data = await response.json() as {
      temp?: number | null;
      humidity?: number | null;
      windSpeed?: number | null;
      weatherCode?: number | null;
      observed?: string | null;
      source?: string;
      error?: string;
    };
    if (!response.ok) throw new Error(data.error || 'Weather service unavailable');
    return {
      temp: data.temp ?? null,
      humidity: data.humidity ?? null,
      windSpeed: data.windSpeed ?? null,
      condition: weatherCodeToCondition(data.weatherCode ?? null),
      observed: data.observed ?? null,
      source: data.source || 'open-meteo',
    };
  } catch (error) {
    console.warn('Could not fetch weather:', error);
    return null;
  }
}

export default function App() {
  const [uiMode, setUiMode] = useState<UiMode>('vision');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [state, setState] = useState<AppState>({
    userLocation: null,
    selectedLocation: DEFAULT_LOCATION,
    intelligenceReport: null,
    isLoading: false,
    weather: null,
    layerIntensities: {
      'Global Air Traffic': 1,
      'Seismic Activity': 1,
      'Satellite Cloud Cover': 1,
    },
    surfaceViewActive: false,
    liveFlights: [],
    criticalEvents: [],
  });

  useEffect(() => {
    let active = true;

    const fetchGlobalData = async () => {
      const selected = state.selectedLocation;
      if (!selected) return;
      const radius = 10;
      const minLat = Math.max(-90, selected.lat - radius);
      const maxLat = Math.min(90, selected.lat + radius);
      const minLng = Math.max(-180, selected.lng - radius);
      const maxLng = Math.min(180, selected.lng + radius);
      const [flights, events] = await Promise.all([
        getLiveFlights(minLat, minLng, maxLat, maxLng),
        getCriticalEvents(),
      ]);
      if (active) {
        setState((previous) => ({
          ...previous,
          liveFlights: flights,
          criticalEvents: events,
        }));
      }
    };

    void fetchGlobalData();
    const interval = window.setInterval(fetchGlobalData, 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [state.selectedLocation]);

  useEffect(() => {
    void handleIntelligenceRequest(
      DEFAULT_LOCATION.lat,
      DEFAULT_LOCATION.lng,
      'Provide a baseline overview for this regional hub.',
    );
  }, []);

  const handleIntensityChange = (layerName: string, value: number) => {
    setState((previous) => ({
      ...previous,
      layerIntensities: { ...previous.layerIntensities, [layerName]: value },
    }));
  };

  const handleIntelligenceRequest = async (
    lat: number,
    lng: number,
    context: string,
    useDeepThinking = false,
  ) => {
    setState((previous) => ({ ...previous, isLoading: true }));
    const [report, weather] = await Promise.all([
      getGlobalIntelligence(lat, lng, context, useDeepThinking),
      fetchWeather(lat, lng),
    ]);
    setState((previous) => ({
      ...previous,
      intelligenceReport: report,
      weather,
      isLoading: false,
    }));
  };

  const handleLocationSelect = (lat: number, lng: number) => {
    const selectedLocation = { lat, lng };
    setMobilePanel(null);
    setState((previous) => ({ ...previous, selectedLocation }));
    void handleIntelligenceRequest(lat, lng, 'Analyze this selected location using verified sources.');
  };

  const requestGeolocation = () => {
    setState((previous) => ({ ...previous, isLoading: true }));
    if (!navigator.geolocation) {
      setState((previous) => ({ ...previous, isLoading: false }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = { lat: position.coords.latitude, lng: position.coords.longitude };
        setState((previous) => ({
          ...previous,
          userLocation: location,
          selectedLocation: location,
        }));
        void handleIntelligenceRequest(
          location.lat,
          location.lng,
          'Provide a baseline overview for the current coordinates.',
        );
      },
      (error) => {
        console.warn('Geolocation unavailable:', error);
        setState((previous) => ({ ...previous, isLoading: false }));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const toggleSurfaceMap = () => {
    setMobilePanel(null);
    setState((previous) => ({ ...previous, surfaceViewActive: !previous.surfaceViewActive }));
  };

  const primaryFlight = state.liveFlights[0];

  return (
    <div className="relative h-[100dvh] min-h-[100dvh] w-full overflow-hidden bg-bg selection:bg-accent/30 lg:grid lg:grid-cols-[280px_minmax(0,1fr)_280px] lg:grid-rows-[60px_minmax(0,1fr)_100px] lg:gap-2.5 lg:p-5">
      <div className="absolute inset-0 pointer-events-none z-0">
        <Suspense fallback={<div className="text-accent flex h-full w-full items-center justify-center px-6 text-center font-mono animate-pulse">Establishing orbital link...</div>}>
          <AtmosphericGlobe
            onLocationSelect={handleLocationSelect}
            userLocation={state.userLocation}
            targetLocation={state.selectedLocation}
            layerIntensities={state.layerIntensities}
            liveFlights={state.liveFlights}
            criticalEvents={state.criticalEvents}
          />
        </Suspense>
      </div>

      <NavigationHUD
        location={state.userLocation}
        weather={state.weather}
        selectedCoord={state.selectedLocation}
        flightCount={state.liveFlights.length}
        eventCount={state.criticalEvents.length}
        mobileOpen={mobilePanel === 'status'}
        onMobileClose={() => setMobilePanel(null)}
        onGeolocate={requestGeolocation}
        onCoordinateSubmit={handleLocationSelect}
        onToggleSurface={toggleSurfaceMap}
      />

      {state.surfaceViewActive && state.selectedLocation && (
        <Suspense fallback={null}>
          <TacticalMap
            lat={state.selectedLocation.lat}
            lng={state.selectedLocation.lng}
            onClose={() => setState((previous) => ({ ...previous, surfaceViewActive: false }))}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <IntelligenceCenter
          report={state.intelligenceReport}
          isLoading={state.isLoading}
          layerIntensities={state.layerIntensities}
          mobileOpen={mobilePanel === 'intelligence'}
          onMobileClose={() => setMobilePanel(null)}
          onIntensityChange={handleIntensityChange}
          onAsk={(prompt, useDeepThinking) => {
            if (state.selectedLocation) {
              void handleIntelligenceRequest(
                state.selectedLocation.lat,
                state.selectedLocation.lng,
                prompt,
                useDeepThinking,
              );
            }
          }}
        />
      </Suspense>

      {uiMode === 'vision' && state.selectedLocation && (
        <VisionProHUD
          data={{
            altitude: primaryFlight?.altitude ?? 0,
            speed: primaryFlight?.velocity ?? 0,
            heading: primaryFlight?.track ?? 0,
            timestamp: Date.now(),
          }}
        />
      )}

      {uiMode === 'tactical' && (
        <TacticalHUD
          data={{
            threats: state.criticalEvents.length,
            targets: state.liveFlights.length,
            contacts: state.liveFlights.length + state.criticalEvents.length,
            scanRadius: 250,
          }}
        />
      )}

      {uiMode === 'gta6' && state.selectedLocation && (
        <GTA6Interface
          data={{
            radar: state.liveFlights.slice(0, 5).map((_, index) => ({
              x: Math.sin(index) * 0.5,
              y: Math.cos(index) * 0.5,
              type: index === 0 ? 'threat' : 'npc',
            })),
            health: 100,
            armor: 100,
            wanted: Math.min(5, state.criticalEvents.length),
            location: `${state.selectedLocation.lat.toFixed(2)}, ${state.selectedLocation.lng.toFixed(2)}`,
          }}
        />
      )}

      <div className="fixed left-1/2 top-[4.5rem] z-[55] flex -translate-x-1/2 gap-1 rounded-xl border border-white/10 bg-black/65 p-1.5 backdrop-blur-xl lg:absolute lg:top-4">
        {(['vision', 'tactical', 'gta6'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            onClick={() => setUiMode(mode)}
            aria-pressed={uiMode === mode}
            className={`min-h-9 rounded-lg px-2.5 text-[0.65rem] font-semibold uppercase tracking-wide transition sm:px-3 sm:text-xs ${
              uiMode === mode ? 'bg-accent text-black' : 'bg-white/5 text-white/60 hover:bg-white/15'
            }`}
          >
            {mode === 'vision' ? 'Vision' : mode === 'tactical' ? 'Tactical' : 'Cinematic'}
          </button>
        ))}
      </div>

      <nav className="fixed bottom-3 left-3 right-3 z-[75] grid grid-cols-3 gap-2 rounded-2xl border border-accent/20 bg-black/80 p-2 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePanel((current) => current === 'intelligence' ? null : 'intelligence')}
          aria-pressed={mobilePanel === 'intelligence'}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-[0.68rem] font-bold uppercase ${mobilePanel === 'intelligence' ? 'bg-accent text-black' : 'bg-white/5 text-accent'}`}
        >
          <BrainCircuit size={16} /> Intel
        </button>
        <button
          type="button"
          onClick={() => setMobilePanel((current) => current === 'status' ? null : 'status')}
          aria-pressed={mobilePanel === 'status'}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-[0.68rem] font-bold uppercase ${mobilePanel === 'status' ? 'bg-accent text-black' : 'bg-white/5 text-accent'}`}
        >
          <PanelRightOpen size={16} /> Status
        </button>
        <button
          type="button"
          onClick={toggleSurfaceMap}
          aria-pressed={state.surfaceViewActive}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-[0.68rem] font-bold uppercase ${state.surfaceViewActive ? 'bg-accent text-black' : 'bg-white/5 text-accent'}`}
        >
          <MapIcon size={16} /> Map
        </button>
      </nav>

      <div className="absolute inset-0 pointer-events-none scanline opacity-20 z-50" />
    </div>
  );
}
