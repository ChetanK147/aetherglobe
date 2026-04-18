import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Navigation, AlertTriangle, MapPin, ShieldAlert, Car, Construction } from 'lucide-react';
import { motion } from 'motion/react';
import ReactDOMServer from 'react-dom/server';

interface TacticalMapProps {
  lat: number;
  lng: number;
  onClose: () => void;
}

const RecenterMap = ({ lat, lng }: { lat: number, lng: number }) => {
  const map = useMap();
  React.useEffect(() => {
    map.setView([lat, lng], 14, { animate: true, duration: 1.5 });
  }, [lat, lng, map]);
  return null;
};

const createNeonIcon = (color: string) => L.divIcon({
  className: 'bg-transparent',
  html: `<div style="
    width: 14px; 
    height: 14px; 
    background-color: ${color}; 
    border-radius: 50%; 
    border: 2px solid #fff;
    box-shadow: 0 0 12px 2px ${color};
  "></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const createEventIcon = (icon: React.ReactNode, color: string) => L.divIcon({
  className: 'bg-transparent',
  html: ReactDOMServer.renderToString(
    <div style={{
      width: '24px',
      height: '24px',
      backgroundColor: 'rgba(0,0,0,0.8)',
      borderRadius: '4px',
      border: `1px solid ${color}`,
      boxShadow: `0 0 10px ${color}`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: color
    }}>
      {icon}
    </div>
  ),
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const TacticalMap: React.FC<TacticalMapProps> = ({ lat, lng, onClose }) => {
  // Generate mock traffic routes (Polylines) around the center
  const routes = useMemo(() => {
    const lines = [];
    const conditionColors = ['#00ffaa', '#ffaa00', '#ff0055']; // Clear, Moderate, Heavy

    for (let i = 0; i < 5; i++) {
      const path: [number, number][] = [];
      let currentLat = lat + (Math.random() - 0.5) * 0.05;
      let currentLng = lng + (Math.random() - 0.5) * 0.05;
      
      for (let j = 0; j < Math.floor(Math.random() * 10) + 5; j++) {
        path.push([currentLat, currentLng]);
        currentLat += (Math.random() - 0.5) * 0.01;
        currentLng += (Math.random() - 0.5) * 0.01;
      }
      
      lines.push({
        id: `route-${i}`,
        path,
        condition: conditionColors[Math.floor(Math.random() * conditionColors.length)],
        weight: Math.floor(Math.random() * 3) + 3
      });
    }

    // Directional Route (Simulated Nav)
    const navPath: [number, number][] = [];
    let nLat = lat;
    let nLng = lng;
    for(let k=0; k<8; k++){
      navPath.push([nLat, nLng]);
      nLat += (Math.random() - 0.2) * 0.01;
      nLng += (Math.random() - 0.2) * 0.01;
    }

    return { traffic: lines, navigation: navPath };
  }, [lat, lng]);

  // Generate Waze/Google Events
  const events = useMemo(() => {
    const types = [
      { type: 'ACCIDENT', icon: <AlertTriangle size={14} />, color: '#ff0055', label: 'Waze: Accident Reporting' },
      { type: 'POLICE', icon: <ShieldAlert size={14} />, color: '#0066ff', label: 'Waze: Police Presence' },
      { type: 'CONSTRUCTION', icon: <Construction size={14} />, color: '#ffaa00', label: 'Google: Roadworks' },
      { type: 'STALLED_VEHICLE', icon: <Car size={14} />, color: '#ffffff', label: 'Waze: Hazard on Road' }
    ];

    return Array.from({ length: 4 }).map((_, i) => {
      const t = types[Math.floor(Math.random() * types.length)];
      return {
        id: `event-${i}`,
        lat: lat + (Math.random() - 0.5) * 0.04,
        lng: lng + (Math.random() - 0.5) * 0.04,
        ...t
      };
    });
  }, [lat, lng]);

  // Generate mock Points of Interest
  const pois = useMemo(() => {
    return Array.from({ length: 6 }).map((_, i) => ({
      id: `poi-${i}`,
      lat: lat + (Math.random() - 0.5) * 0.06,
      lng: lng + (Math.random() - 0.5) * 0.06,
      type: ['INFRASTRUCTURE', 'TRANSIT HUB', 'COMMERCIAL', 'RESTRICTED'][Math.floor(Math.random() * 4)],
      color: ['#00f3ff', '#ffff00', '#ff00ea', '#ff0055'][Math.floor(Math.random() * 4)]
    }));
  }, [lat, lng]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3 }}
      className="absolute top-[80px] bottom-[120px] left-[300px] right-[300px] z-[100] glass-panel border border-accent flex flex-col overflow-hidden"
      style={{ boxShadow: '0 0 30px rgba(0, 243, 255, 0.15)' }}
    >
      <div className="flex justify-between items-center bg-black/60 border-b border-accent/30 p-3">
        <div className="flex items-center gap-3">
          <MapPin className="text-accent" size={18} />
          <h2 className="text-accent font-mono uppercase tracking-widest font-bold text-sm">
            Surface Intelligence Feed
          </h2>
          <span className="text-[10px] text-text-muted font-mono bg-white/5 px-2 py-0.5 rounded border border-accent/20">
            PROVIDER: GOOGLE_MAPS + WAZE_LIVE
          </span>
        </div>
        <button 
          onClick={onClose}
          className="text-accent/60 hover:text-[#ff0055] transition-colors"
        >
          <X size={20} />
        </button>
      </div>
      
      <div className="flex-1 relative bg-[#0a0a0a]">
        <MapContainer 
          center={[lat, lng]} 
          zoom={14} 
          style={{ width: '100%', height: '100%', background: '#0a0a0a' }}
          zoomControl={false}
        >
          <RecenterMap lat={lat} lng={lng} />
          {/* CartoDB Dark Matter Base Map */}
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
          />

          {/* User / Anchor Point */}
          <Marker position={[lat, lng]} icon={createNeonIcon('#fff')}>
            <Popup className="font-mono text-xs">
              <div className="font-bold text-black border-b border-gray-300 pb-1 mb-1">TARGET LOCK</div>
              COORD: {lat.toFixed(4)}, {lng.toFixed(4)}
            </Popup>
          </Marker>

          {/* Traffic Events (Waze Style) */}
          {events.map(ev => (
            <Marker 
              key={ev.id} 
              position={[ev.lat, ev.lng]} 
              icon={createEventIcon(ev.icon, ev.color)}
            >
              <Popup className="font-mono text-xs">
                <div className="font-bold border-b border-gray-200 pb-1 mb-1" style={{ color: ev.color }}>{ev.type}</div>
                <div className="text-[10px] text-gray-600">{ev.label}</div>
                <div className="text-[9px] mt-1 opacity-60">Reported: 2m ago</div>
              </Popup>
            </Marker>
          ))}

          {/* Active Navigation Route */}
          <Polyline 
            positions={routes.navigation} 
            color="#ff00ea" 
            weight={4} 
            dashArray="10, 10" 
            className="animate-pulse"
          />

          {/* Traffic Lines (Google Style) */}
          {routes.traffic.map(route => (
            <Polyline 
              key={route.id} 
              positions={route.path} 
              color={route.condition} 
              weight={route.weight} 
              opacity={0.8}
            />
          ))}

          {/* POIs */}
          {pois.map(poi => (
            <Marker key={poi.id} position={[poi.lat, poi.lng]} icon={createNeonIcon(poi.color)}>
              <Popup className="font-mono text-xs">
                <div className="font-bold" style={{ color: poi.color }}>{poi.type}</div>
                <div>ID: {poi.id.toUpperCase()}</div>
                <div className="text-[10px] mt-1 text-gray-500">Live Status: NOMINAL</div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
        
        {/* Map UI Overlay */}
        <div className="absolute bottom-4 left-4 z-[400] flex flex-col gap-2">
           <div className="glass-panel bg-black/80 border border-white/10 p-2 text-[10px] font-mono flex items-center gap-2">
              <span className="text-text-muted mr-1">FLOW:</span>
              <div className="w-2 h-2 rounded-full bg-[#00ffaa]"></div> Clear
              <div className="w-2 h-2 rounded-full bg-[#ffaa00] ml-2"></div> Moderate
              <div className="w-2 h-2 rounded-full bg-[#ff0055] ml-2"></div> Heavy
           </div>
           <div className="glass-panel bg-black/80 border border-white/10 p-2 text-[10px] font-mono flex items-center gap-2">
              <span className="text-text-muted mr-1">EVENTS:</span>
              <ShieldAlert size={12} className="text-[#0066ff]" /> Police
              <AlertTriangle size={12} className="text-[#ff0055] ml-2" /> Accident
              <Construction size={12} className="text-[#ffaa00] ml-2" /> Google Traffic Incidents
           </div>
        </div>
      </div>
    </motion.div>
  );
};

export default TacticalMap;
