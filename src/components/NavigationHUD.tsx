import React from 'react';
import { 
  Activity, 
  Wind, 
  Map as MapIcon, 
  Cpu, 
  Clock, 
  Navigation,
  Train,
  CloudRain,
  Satellite
} from 'lucide-react';
import { motion } from 'motion/react';
import { WeatherData, TrafficData, Location, TransportRoute } from '../types';
import { useAuth } from './FirebaseProvider';

interface NavigationHUDProps {
  location: Location | null;
  weather: WeatherData | null;
  traffic: TrafficData | null;
  transportRoutes: TransportRoute[];
  selectedCoord: Location | null;
  onGeolocate?: () => void;
  onCoordinateSubmit?: (lat: number, lng: number) => void;
  onToggleSurface?: () => void;
}

const NavigationHUD: React.FC<NavigationHUDProps> = ({ 
  location, 
  weather, 
  traffic, 
  transportRoutes,
  selectedCoord,
  onGeolocate,
  onCoordinateSubmit,
  onToggleSurface
}) => {
  const [manualLat, setManualLat] = React.useState(selectedCoord?.lat.toFixed(4) || '');
  const [manualLng, setManualLng] = React.useState(selectedCoord?.lng.toFixed(4) || '');

  React.useEffect(() => {
    if (selectedCoord) {
      setManualLat(selectedCoord.lat.toFixed(4));
      setManualLng(selectedCoord.lng.toFixed(4));
    }
  }, [selectedCoord]);

  const handleCoordinateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onCoordinateSubmit && manualLat !== '' && manualLng !== '') {
      const lat = parseFloat(manualLat);
      const lng = parseFloat(manualLng);
      if (!isNaN(lat) && !isNaN(lng)) {
        onCoordinateSubmit(lat, lng);
      }
    }
  };

  const { user, login, logout } = useAuth();

  return (
    <>
      {/* Top Header */}
      <header className="col-start-1 col-end-4 row-start-1 flex justify-between items-center border-b border-accent-dim px-2.5 z-20">
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex items-center gap-4"
        >
          <div className="w-8 h-8 border-2 border-accent rounded-full shadow-[0_0_10px_var(--color-accent-dim)]" />
          <h1 className="text-lg tracking-[3px] font-light uppercase flex items-center gap-4">
            AetherGlobe <span className="opacity-50 text-[0.8rem]">v4.0.2</span>
            {user ? (
               <button onClick={logout} className="text-[0.6rem] bg-accent/20 px-2 py-1 rounded text-accent uppercase tracking-widest border border-accent/50 hover:bg-accent/40 hidden md:block">
                 DISCONNECT {user.displayName}
               </button>
            ) : (
               <button onClick={login} className="text-[0.6rem] bg-[#00ffea]/20 px-2 py-1 rounded text-[#00ffea] uppercase tracking-widest border border-[#00ffea]/50 hover:bg-[#00ffea]/40 flex items-center gap-2">
                 <img src="https://www.gstatic.com/mobilesdk/250721_mobilesdk/mono_firebase_dark.svg" alt="Firebase" className="w-3 h-3" />
                 AUTH SECURE LINK
               </button>
            )}
          </h1>
        </motion.div>

        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="font-mono text-[0.9rem] text-accent font-bold"
        >
          {new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })} // {new Date().toLocaleTimeString()} UTC
        </motion.div>
      </header>

      {/* Right Sidebar Components */}
      <aside className="col-start-3 row-start-2 flex flex-col gap-2.5 z-20">
        {/* Local Intel / Weather */}
        <motion.div 
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          className="glass-panel p-4 flex flex-col gap-4 flex-1 overflow-hidden"
        >
          <div className="panel-title">Local Intel: {selectedCoord ? `Sector ${selectedCoord.lat.toFixed(0)}:${selectedCoord.lng.toFixed(0)}` : 'Scanning...'}</div>
          
          <div className="text-[0.8rem] space-y-2">
            <div>
              <strong>Location:</strong> {location ? 'Primary User Node' : 'Satellite Hub'}
              {onGeolocate && (
                <button 
                  onClick={onGeolocate} 
                  className="ml-2 bg-accent/20 hover:bg-accent/40 text-accent text-[0.6rem] px-2 py-1 rounded border border-accent/50 transition-colors"
                >
                  <Navigation size={10} className="inline mr-1" />
                  LOCATE ME
                </button>
              )}
            </div>
            <div className="text-text-muted text-[0.7rem]">Signal Strength: Nominal</div>
            
            <div className="font-mono text-[0.7rem] bg-black/30 p-2 border-l-2 border-accent mt-2 line-height-1.4 text-[#a0c4ff]">
              {weather?.metar ?? 'WAITING_FOR_METAR_UPLINK...'}
            </div>

            <div className="panel-title mt-4">Public Transport</div>
            <ul className="space-y-1.5 mt-2">
              {transportRoutes.length > 0 ? transportRoutes.map(route => (
                <li key={route.id} className="flex justify-between items-center p-1.25 bg-white/5 border-l-2" style={{ borderLeftColor: route.color }}>
                  <span className="font-bold w-12 text-[0.7rem] truncate" style={{ color: route.color }}>{route.name.split(' ')[0]}</span>
                  <span className="text-[0.6rem] truncate flex-1 px-2">{route.name}</span>
                  <span className={`text-[0.6rem] whitespace-nowrap ${route.status === 'ON TIME' ? 'text-[#00ff00]' : 'text-warning'}`}>
                    {route.status === 'ON TIME' ? 'ON TIME' : `+${route.delay} MIN`}
                  </span>
                </li>
              )) : (
                <li className="text-[0.6rem] opacity-50 p-2">Wait for local sector scan...</li>
              )}
            </ul>

            <div className="panel-title mt-4">Satellite Feed</div>
            <div className="w-full h-24 bg-black border border-accent-dim relative overflow-hidden">
               <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.1)_0%,transparent_60%)] -top-1/2 -left-1/2 blur-sm" />
               <div className="p-2.5 text-[0.6rem] text-accent font-bold">HIMAWARI-9 RAW_DATA</div>
               {/* Simulating imagery with CSS */}
               <div className="absolute bottom-2 right-2 flex gap-1">
                 <div className="w-1 h-1 bg-accent rounded-full animate-ping" />
                 <span className="text-[8px] opacity-40">LIVE</span>
               </div>
            </div>
          </div>
        </motion.div>

        {/* Selected Coordinates Readout (Middle region) */}
        <motion.div 
           initial={{ scale: 0.8, opacity: 0 }}
           animate={{ scale: 1, opacity: 1 }}
           className="glass-panel p-4 border-r-2 border-r-accent"
        >
           <div className="panel-title">Target Lock</div>
           <form onSubmit={handleCoordinateSubmit} className="flex flex-col gap-2 mt-2">
             <div className="flex items-center gap-2">
               <span className="text-[0.7rem] text-accent w-8">LAT:</span>
               <input 
                 type="text" 
                 value={manualLat}
                 onChange={(e) => setManualLat(e.target.value)}
                 className="flex-1 bg-black/60 border border-accent/20 text-accent font-mono text-[0.8rem] px-2 py-1 outline-none focus:border-accent transition-colors"
                 placeholder="0.0000"
               />
             </div>
             <div className="flex items-center gap-2">
               <span className="text-[0.7rem] text-accent w-8">LNG:</span>
               <input 
                 type="text" 
                 value={manualLng}
                 onChange={(e) => setManualLng(e.target.value)}
                 className="flex-1 bg-black/60 border border-accent/20 text-accent font-mono text-[0.8rem] px-2 py-1 outline-none focus:border-accent transition-colors"
                 placeholder="0.0000"
               />
             </div>
             <button type="submit" className="mt-2 bg-accent/10 hover:bg-accent/20 border border-accent/30 text-[0.7rem] py-1 text-accent uppercase font-bold transition-colors">
               Sync Coordinates
             </button>
             {onToggleSurface && (
               <button 
                type="button" 
                onClick={onToggleSurface}
                className="mt-1 bg-[#ff00ea]/10 hover:bg-[#ff00ea]/20 border border-[#ff00ea]/30 text-[0.7rem] py-1 text-[#ff00ea] uppercase font-bold transition-colors flex items-center justify-center gap-1"
               >
                 <MapIcon size={12} /> Init Surface Scan
               </button>
             )}
           </form>
        </motion.div>
      </aside>

      {/* Bottom Footer / Timeline */}
      <footer className="col-start-1 col-end-4 row-start-3 glass-panel border-t border-accent-dim grid grid-cols-[200px_1fr_200px] items-center px-5 z-20">
        <div className="flex gap-5 items-center">
          <div className="w-10 h-10 border border-accent rounded-full flex justify-center items-center text-accent cursor-pointer hover:bg-accent/10 transition-colors">
            ▶
          </div>
          <div>
            <div className="text-[0.7rem] mb-1 font-bold">TIMELINE: LIVE</div>
            <div className="text-[0.6rem] opacity-50 uppercase">Synced to Atomic Clock</div>
          </div>
        </div>

        <div className="h-1 bg-accent-dim w-full relative mx-4">
           <div className="absolute left-[65%] -top-1.5 w-4 h-4 bg-accent rounded-full shadow-[0_0_10px_var(--color-accent)]" />
        </div>

        <div className="text-[0.7rem] text-text-muted text-right">
          <div>T - 24 HOURS</div>
          <div className="text-[0.6rem] uppercase">Archive Buffer: 98%</div>
        </div>
      </footer>
    </>
  );
};

export default NavigationHUD;
