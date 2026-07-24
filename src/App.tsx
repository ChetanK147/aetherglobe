import { lazy, Suspense, useEffect, useState } from 'react';
import { BrainCircuit, Map as MapIcon, PanelRightOpen } from 'lucide-react';
import NavigationHUD from './components/NavigationHUD';
import type { AppState, WeatherData } from './types';
import { getGlobalIntelligence } from './services/intelligenceService';
import { getCriticalEvents, getLiveFlights, getLiveVessels } from './services/liveDataService';

const AtmosphericGlobe = lazy(() => import('./components/AtmosphericGlobe'));
const TacticalMap = lazy(() => import('./components/TacticalMap'));
const IntelligenceCenter = lazy(() => import('./components/IntelligenceCenter'));

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
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>(null);
  const [desktopPanels, setDesktopPanels] = useState({ intelligence: true, status: true });
  const [state, setState] = useState<AppState>({
    userLocation: null,
    selectedLocation: null,
    intelligenceReport: null,
    isLoading: false,
    weather: null,
    layerIntensities: {
      'Global Air Traffic': 1,
      'Maritime Traffic': 1,
      'Seismic Activity': 1,
      'Satellite Cloud Cover': 1,
    },
    surfaceViewActive: false,
    liveFlights: [],
    liveVessels: [],
    criticalEvents: [],
  });

  useEffect(() => {
    const selected = state.selectedLocation;
    if (!selected) return;

    let active = true;
    const fetchGlobalData = async () => {
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
    const selected = state.selectedLocation;
    if (!selected) return;

    let active = true;
    const fetchMaritimeData = async () => {
      const radius = 3;
      const vessels = await getLiveVessels(
        Math.max(-90, selected.lat - radius),
        Math.max(-180, selected.lng - radius),
        Math.min(90, selected.lat + radius),
        Math.min(180, selected.lng + radius),
      );
      if (active) {
        setState((previous) => ({ ...previous, liveVessels: vessels }));
      }
    };

    void fetchMaritimeData();
    const interval = window.setInterval(fetchMaritimeData, 5_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [state.selectedLocation]);

  const handleIntensityChange = (layerName: string, value: number) => {
    setState((previous) => ({
      ...previous,
      layerIntensities: { ...previous.layerIntensities, [layerName]: value },
    }));
  };

  const refreshSourceBrief = async (lat: number, lng: number) => {
    setState((previous) => ({ ...previous, isLoading: true }));
    const [report, weather] = await Promise.all([
      getGlobalIntelligence(lat, lng),
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
    setState((previous) => ({
      ...previous,
      selectedLocation,
      intelligenceReport: null,
      weather: null,
      liveFlights: [],
      liveVessels: [],
      criticalEvents: [],
    }));
    void refreshSourceBrief(lat, lng);
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
          intelligenceReport: null,
          weather: null,
          liveFlights: [],
          liveVessels: [],
          criticalEvents: [],
        }));
        void refreshSourceBrief(location.lat, location.lng);
      },
      (error) => {
        console.warn('Geolocation unavailable:', error);
        setState((previous) => ({ ...previous, isLoading: false }));
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const toggleSurfaceMap = () => {
    if (!state.selectedLocation) return;
    setMobilePanel(null);
    setState((previous) => ({ ...previous, surfaceViewActive: !previous.surfaceViewActive }));
  };

  const desktopGridColumns = desktopPanels.intelligence
    ? desktopPanels.status
      ? 'lg:grid-cols-[280px_minmax(0,1fr)_280px]'
      : 'lg:grid-cols-[280px_minmax(0,1fr)_52px]'
    : desktopPanels.status
      ? 'lg:grid-cols-[52px_minmax(0,1fr)_280px]'
      : 'lg:grid-cols-[52px_minmax(0,1fr)_52px]';

  return (
    <div className={`relative h-[100dvh] min-h-[100dvh] w-full overflow-hidden bg-bg selection:bg-accent/30 lg:grid ${desktopGridColumns} lg:grid-rows-[60px_minmax(0,1fr)_100px] lg:gap-2.5 lg:p-5 lg:transition-[grid-template-columns] lg:duration-300`}>
      <div className="absolute inset-0 pointer-events-none z-0">
        <Suspense fallback={<div className="text-accent flex h-full w-full items-center justify-center px-6 text-center font-mono animate-pulse">Establishing orbital link...</div>}>
          <AtmosphericGlobe
            onLocationSelect={handleLocationSelect}
            userLocation={state.userLocation}
            targetLocation={state.selectedLocation}
            layerIntensities={state.layerIntensities}
            liveFlights={state.liveFlights}
            liveVessels={state.liveVessels}
            criticalEvents={state.criticalEvents}
          />
        </Suspense>
      </div>

      <NavigationHUD
        location={state.userLocation}
        weather={state.weather}
        selectedCoord={state.selectedLocation}
        flightCount={state.liveFlights.length}
        vesselCount={state.liveVessels.length}
        eventCount={state.criticalEvents.length}
        mobileOpen={mobilePanel === 'status'}
        onMobileClose={() => setMobilePanel(null)}
        desktopOpen={desktopPanels.status}
        onDesktopToggle={() => setDesktopPanels((previous) => ({ ...previous, status: !previous.status }))}
        onGeolocate={requestGeolocation}
        onCoordinateSubmit={handleLocationSelect}
        onToggleSurface={state.selectedLocation ? toggleSurfaceMap : undefined}
      />

      {state.surfaceViewActive && state.selectedLocation && (
        <Suspense fallback={null}>
          <TacticalMap
            lat={state.selectedLocation.lat}
            lng={state.selectedLocation.lng}
            flights={state.liveFlights}
            flightIntensity={state.layerIntensities['Global Air Traffic'] ?? 0}
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
          desktopOpen={desktopPanels.intelligence}
          onDesktopToggle={() => setDesktopPanels((previous) => ({ ...previous, intelligence: !previous.intelligence }))}
          onIntensityChange={handleIntensityChange}
          onRefresh={() => {
            if (state.selectedLocation) {
              void refreshSourceBrief(state.selectedLocation.lat, state.selectedLocation.lng);
            }
          }}
        />
      </Suspense>

      <nav className="fixed bottom-3 left-3 right-3 z-[75] grid grid-cols-3 gap-2 rounded-2xl border border-accent/20 bg-black/80 p-2 backdrop-blur-xl lg:hidden">
        <button
          type="button"
          onClick={() => setMobilePanel((current) => current === 'intelligence' ? null : 'intelligence')}
          aria-pressed={mobilePanel === 'intelligence'}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-[0.68rem] font-bold uppercase ${mobilePanel === 'intelligence' ? 'bg-accent text-black' : 'bg-white/5 text-accent'}`}
        >
          <BrainCircuit size={16} /> Sources
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
          disabled={!state.selectedLocation}
          aria-pressed={state.surfaceViewActive}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-[0.68rem] font-bold uppercase disabled:cursor-not-allowed disabled:opacity-30 ${state.surfaceViewActive ? 'bg-accent text-black' : 'bg-white/5 text-accent'}`}
        >
          <MapIcon size={16} /> Map
        </button>
      </nav>

      <div className="absolute inset-0 pointer-events-none scanline opacity-20 z-50" />
    </div>
  );
}
