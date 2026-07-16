import React from 'react';
import { Activity, Cloud, LogIn, LogOut, Map as MapIcon, MapPin, Navigation, Plane, Radio, Waves } from 'lucide-react';
import { motion } from 'motion/react';
import type { Location, WeatherData } from '../types';
import { useAuth } from './FirebaseProvider';

interface NavigationHUDProps {
  location: Location | null;
  weather: WeatherData | null;
  selectedCoord: Location | null;
  flightCount: number;
  eventCount: number;
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
      <header className="col-start-1 col-end-4 row-start-1 flex justify-between items-center border-b border-accent-dim px-2.5 z-20">
        <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex items-center gap-4">
          <div className="w-8 h-8 border-2 border-accent rounded-full shadow-[0_0_10px_var(--color-accent-dim)]" />
          <h1 className="text-lg tracking-[3px] font-light uppercase">
            AetherGlobe <span className="opacity-50 text-[0.8rem]">v4.2</span>
          </h1>
        </motion.div>

        <div className="flex items-center gap-4">
          <div className="font-mono text-[0.8rem] text-accent font-bold text-right">
            <div>{utcDate}</div>
            <div>{utcTime} UTC</div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => void (user ? logout() : login())}
            className="text-[0.65rem] bg-accent/10 px-3 py-2 rounded text-accent uppercase tracking-widest border border-accent/40 hover:bg-accent/20 disabled:opacity-40 flex items-center gap-2"
          >
            {user ? <LogOut size={12} /> : <LogIn size={12} />}
            {user ? 'Sign out' : 'Sign in'}
          </button>
        </div>
      </header>

      <aside className="col-start-3 row-start-2 flex flex-col gap-2.5 z-20">
        <motion.div initial={{ x: 50, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="glass-panel p-4 flex flex-col gap-4 flex-1 overflow-y-auto custom-scrollbar">
          <div className="panel-title">Selected Location</div>
          <div className="text-[0.75rem] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2"><MapPin size={13} className="text-accent" />{location ? 'Current position' : 'Manual target'}</span>
              {onGeolocate && (
                <button type="button" onClick={onGeolocate} className="bg-accent/10 hover:bg-accent/20 text-accent text-[0.6rem] px-2 py-1 rounded border border-accent/40">
                  <Navigation size={10} className="inline mr-1" />Locate
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-black/30 border border-white/5 p-2">
                <div className="text-[0.55rem] uppercase opacity-50">Latitude</div>
                <div className="font-mono text-accent">{selectedCoord?.lat.toFixed(4) ?? '—'}</div>
              </div>
              <div className="bg-black/30 border border-white/5 p-2">
                <div className="text-[0.55rem] uppercase opacity-50">Longitude</div>
                <div className="font-mono text-accent">{selectedCoord?.lng.toFixed(4) ?? '—'}</div>
              </div>
            </div>

            <div className="panel-title mt-4">Current Weather</div>
            {weather ? (
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-black/30 p-2"><Cloud size={12} className="text-accent mb-1" /><strong>{weather.condition}</strong></div>
                <div className="bg-black/30 p-2"><span className="opacity-50">Temp</span><div>{formatValue(weather.temp, '°C')}</div></div>
                <div className="bg-black/30 p-2"><Waves size={12} className="text-accent mb-1" /><div>{formatValue(weather.windSpeed, ' km/h')}</div></div>
                <div className="bg-black/30 p-2"><span className="opacity-50">Humidity</span><div>{formatValue(weather.humidity, '%')}</div></div>
                <div className="col-span-2 text-[0.6rem] opacity-50 font-mono">
                  Source: {weather.source || 'Open-Meteo'}{weather.observed ? ` · observed ${weather.observed}` : ''}
                </div>
              </div>
            ) : (
              <div className="text-[0.65rem] opacity-50">Weather is currently unavailable.</div>
            )}

            <div className="panel-title mt-4">Verified Feeds</div>
            <div className="space-y-2">
              <div className="flex justify-between bg-black/30 p-2 border-l-2 border-accent">
                <span className="flex items-center gap-2"><Plane size={12} />Aircraft in sector</span><strong>{flightCount}</strong>
              </div>
              <div className="flex justify-between bg-black/30 p-2 border-l-2 border-danger">
                <span className="flex items-center gap-2"><Activity size={12} />USGS M4.5+ events</span><strong>{eventCount}</strong>
              </div>
              <div className="text-[0.58rem] opacity-45 leading-relaxed">
                Flight data uses an unofficial public feed and can be delayed or unavailable. Do not use AetherGlobe for operational decisions.
              </div>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass-panel p-4 border-r-2 border-r-accent">
          <div className="panel-title">Coordinate Search</div>
          <form onSubmit={handleCoordinateSubmit} className="flex flex-col gap-2 mt-2">
            <input type="number" min="-90" max="90" step="any" value={manualLat} onChange={(event) => setManualLat(event.target.value)} className="bg-black/60 border border-accent/20 text-accent font-mono text-[0.8rem] px-2 py-1 outline-none focus:border-accent" placeholder="Latitude" />
            <input type="number" min="-180" max="180" step="any" value={manualLng} onChange={(event) => setManualLng(event.target.value)} className="bg-black/60 border border-accent/20 text-accent font-mono text-[0.8rem] px-2 py-1 outline-none focus:border-accent" placeholder="Longitude" />
            {coordinateError && <div className="text-danger text-[0.6rem]">{coordinateError}</div>}
            <button type="submit" className="bg-accent/10 hover:bg-accent/20 border border-accent/30 text-[0.7rem] py-1 text-accent uppercase font-bold">Sync coordinates</button>
            {onToggleSurface && (
              <button type="button" onClick={onToggleSurface} className="bg-white/5 hover:bg-white/10 border border-white/10 text-[0.7rem] py-1 uppercase font-bold flex items-center justify-center gap-1">
                <MapIcon size={12} /> Open surface map
              </button>
            )}
          </form>
        </motion.div>
      </aside>

      <footer className="col-start-1 col-end-4 row-start-3 glass-panel border-t border-accent-dim grid grid-cols-[220px_1fr_220px] items-center px-5 z-20 text-[0.65rem] font-mono">
        <div className="flex items-center gap-3 text-accent"><Radio size={16} /><div><strong>LIVE DATA</strong><div className="opacity-50">30-second refresh</div></div></div>
        <div className="text-center opacity-55">OPEN-METEO · USGS · PUBLIC FLIGHT FEED · GEMINI SERVER PROXY</div>
        <div className="text-right"><div>AI GENERATED ANALYSIS</div><div className="opacity-50">Verify important claims</div></div>
      </footer>
    </>
  );
};

export default NavigationHUD;
