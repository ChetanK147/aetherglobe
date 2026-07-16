import React from 'react';
import { Activity, Cloud, LogIn, LogOut, Map as MapIcon, MapPin, Navigation, Plane, Radio, Waves, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { Location, WeatherData } from '../types';
import { useAuth } from './FirebaseProvider';

interface NavigationHUDProps {
  location: Location | null;
  weather: WeatherData | null;
  selectedCoord: Location | null;
  flightCount: number;
  eventCount: number;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  onGeolocate?: () => void;
  onCoordinateSubmit?: (lat: number, lng: number) => void;
  onToggleSurface?: () => void;
}

const formatValue = (value: number | null, suffix: string) =>
  value === null ? 'Unavailable' : `${Math.round(value)}${suffix}`;

const NavigationHUD: React.FC<NavigationHUDProps> = ({
  location,
  weather,
  selectedCoord,
  flightCount,
  eventCount,
  mobileOpen = false,
  onMobileClose,
  onGeolocate,
  onCoordinateSubmit,
  onToggleSurface,
}) => {
  const [manualLat, setManualLat] = React.useState(selectedCoord?.lat.toFixed(4) || '');
  const [manualLng, setManualLng] = React.useState(selectedCoord?.lng.toFixed(4) || '');
  const [coordinateError, setCoordinateError] = React.useState('');
  const [clock, setClock] = React.useState(() => new Date());
  const { user, login, logout, loading } = useAuth();

  React.useEffect(() => {
    if (selectedCoord) {
      setManualLat(selectedCoord.lat.toFixed(4));
      setManualLng(selectedCoord.lng.toFixed(4));
      setCoordinateError('');
    }
  }, [selectedCoord]);

  React.useEffect(() => {
    const interval = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const handleCoordinateSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const lat = Number(manualLat);
    const lng = Number(manualLng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      setCoordinateError('Latitude must be -90–90 and longitude -180–180.');
      return;
    }
    setCoordinateError('');
    onCoordinateSubmit?.(lat, lng);
  };

  const utcDate = clock.toLocaleDateString('en-GB', {
    timeZone: 'UTC',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const utcTime = clock.toLocaleTimeString('en-GB', { timeZone: 'UTC', hour12: false });

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-[60] flex h-16 items-center justify-between border-b border-accent-dim bg-black/55 px-3 backdrop-blur-xl sm:px-5 lg:static lg:col-start-1 lg:col-end-4 lg:row-start-1 lg:h-auto lg:bg-transparent lg:px-2.5 lg:backdrop-blur-none">
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex min-w-0 items-center gap-2.5 sm:gap-4">
          <div className="h-7 w-7 shrink-0 rounded-full border-2 border-accent shadow-[0_0_10px_var(--color-accent-dim)] sm:h-8 sm:w-8" />
          <h1 className="truncate text-sm font-light uppercase tracking-[2px] sm:text-lg sm:tracking-[3px]">
            AetherGlobe <span className="hidden opacity-50 sm:inline sm:text-[0.8rem]">v4.3</span>
          </h1>
        </motion.div>

        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden text-right font-mono text-[0.72rem] font-bold text-accent sm:block sm:text-[0.8rem]">
            <div>{utcDate}</div>
            <div>{utcTime} UTC</div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void (user ? logout() : login())}
            aria-label={user ? 'Sign out' : 'Sign in with Google'}
            className="flex min-h-10 items-center gap-2 rounded border border-accent/40 bg-accent/10 px-3 text-[0.65rem] uppercase tracking-widest text-accent hover:bg-accent/20 disabled:opacity-40"
          >
            {user ? <LogOut size={14} /> : <LogIn size={14} />}
            <span className="hidden sm:inline">{user ? 'Sign out' : 'Sign in'}</span>
          </button>
        </div>
      </header>

      <aside className={`${mobileOpen ? 'flex' : 'hidden'} fixed inset-x-3 bottom-20 top-28 z-[70] flex-col gap-2.5 lg:static lg:col-start-3 lg:row-start-2 lg:flex`}>
        <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="glass-panel flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto rounded-xl p-4 custom-scrollbar lg:rounded-none">
          <div className="flex items-center justify-between lg:hidden">
            <div className="panel-title mb-0 flex-1">Status and sources</div>
            <button type="button" onClick={onMobileClose} aria-label="Close status panel" className="ml-3 flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-accent">
              <X size={18} />
            </button>
          </div>

          <div className="panel-title hidden lg:block">Selected Location</div>
          <div className="space-y-3 text-[0.75rem]">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><MapPin size={13} className="text-accent" />{location ? 'Current position' : 'Manual target'}</span>
              {onGeolocate && (
                <button type="button" onClick={onGeolocate} className="min-h-9 rounded border border-accent/40 bg-accent/10 px-3 text-[0.65rem] text-accent hover:bg-accent/20">
                  <Navigation size={11} className="mr-1 inline" />Locate
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="border border-white/5 bg-black/30 p-2.5">
                <div className="text-[0.55rem] uppercase opacity-50">Latitude</div>
                <div className="font-mono text-accent">{selectedCoord?.lat.toFixed(4) ?? '—'}</div>
              </div>
              <div className="border border-white/5 bg-black/30 p-2.5">
                <div className="text-[0.55rem] uppercase opacity-50">Longitude</div>
                <div className="font-mono text-accent">{selectedCoord?.lng.toFixed(4) ?? '—'}</div>
              </div>
            </div>

            <div className="panel-title mt-4">Current Weather</div>
            {weather ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/30 p-2.5"><Cloud size={12} className="mb-1 text-accent" /><strong>{weather.condition}</strong></div>
                <div className="bg-black/30 p-2.5"><span className="opacity-50">Temp</span><div>{formatValue(weather.temp, '°C')}</div></div>
                <div className="bg-black/30 p-2.5"><Waves size={12} className="mb-1 text-accent" /><div>{formatValue(weather.windSpeed, ' km/h')}</div></div>
                <div className="bg-black/30 p-2.5"><span className="opacity-50">Humidity</span><div>{formatValue(weather.humidity, '%')}</div></div>
                <div className="col-span-2 font-mono text-[0.6rem] opacity-50">
                  Source: {weather.source || 'Open-Meteo'}{weather.observed ? ` · observed ${weather.observed}` : ''}
                </div>
              </div>
            ) : (
              <div className="text-[0.65rem] opacity-50">Weather is currently unavailable.</div>
            )}

            <div className="panel-title mt-4">Verified Feeds</div>
            <div className="space-y-2">
              <div className="flex justify-between border-l-2 border-accent bg-black/30 p-2.5">
                <span className="flex items-center gap-2"><Plane size={12} />Aircraft in sector</span><strong>{flightCount}</strong>
              </div>
              <div className="flex justify-between border-l-2 border-danger bg-black/30 p-2.5">
                <span className="flex items-center gap-2"><Activity size={12} />USGS M4.5+ events</span><strong>{eventCount}</strong>
              </div>
              <div className="text-[0.58rem] leading-relaxed opacity-45">
                Flight data uses an unofficial public feed and can be delayed or unavailable. Do not use AetherGlobe for operational decisions.
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-panel rounded-xl border-r-2 border-r-accent p-4 lg:rounded-none">
          <div className="panel-title">Coordinate Search</div>
          <form onSubmit={handleCoordinateSubmit} className="mt-2 grid grid-cols-2 gap-2 lg:flex lg:flex-col">
            <input type="number" min="-90" max="90" step="any" value={manualLat} onChange={(event) => setManualLat(event.target.value)} className="min-h-10 bg-black/60 px-2 font-mono text-[0.8rem] text-accent outline-none border border-accent/20 focus:border-accent" placeholder="Latitude" />
            <input type="number" min="-180" max="180" step="any" value={manualLng} onChange={(event) => setManualLng(event.target.value)} className="min-h-10 bg-black/60 px-2 font-mono text-[0.8rem] text-accent outline-none border border-accent/20 focus:border-accent" placeholder="Longitude" />
            {coordinateError && <div className="col-span-2 text-[0.6rem] text-danger">{coordinateError}</div>}
            <button type="submit" className="min-h-10 border border-accent/30 bg-accent/10 text-[0.7rem] font-bold uppercase text-accent hover:bg-accent/20">Sync coordinates</button>
            {onToggleSurface && (
              <button type="button" onClick={onToggleSurface} className="flex min-h-10 items-center justify-center gap-1 border border-white/10 bg-white/5 text-[0.7rem] font-bold uppercase hover:bg-white/10">
                <MapIcon size={12} /> Open surface map
              </button>
            )}
          </form>
        </motion.div>
      </aside>

      <footer className="hidden lg:col-start-1 lg:col-end-4 lg:row-start-3 lg:grid lg:grid-cols-[220px_1fr_220px] lg:items-center lg:border-t lg:border-accent-dim lg:px-5 lg:text-[0.65rem] lg:font-mono glass-panel z-20">
        <div className="flex items-center gap-3 text-accent"><Radio size={16} /><div><strong>LIVE DATA</strong><div className="opacity-50">30-second refresh</div></div></div>
        <div className="text-center opacity-55">OPEN-METEO · USGS · PUBLIC FLIGHT FEED · OPENAI SERVER PROXY</div>
        <div className="text-right"><div>AI GENERATED ANALYSIS</div><div className="opacity-50">Verify important claims</div></div>
      </footer>
    </>
  );
};

export default NavigationHUD;
