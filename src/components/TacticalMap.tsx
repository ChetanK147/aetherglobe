import React from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, X } from 'lucide-react';
import { motion } from 'motion/react';

interface TacticalMapProps {
  lat: number;
  lng: number;
  onClose: () => void;
}

const targetIcon = L.divIcon({
  className: 'bg-transparent',
  html: '<div style="width:16px;height:16px;background:#00f3ff;border-radius:50%;border:2px solid white;box-shadow:0 0 14px #00f3ff"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const RecenterMap = ({ lat, lng }: { lat: number; lng: number }) => {
  const map = useMap();
  React.useEffect(() => {
    map.setView([lat, lng], 13, { animate: true, duration: 1 });
  }, [lat, lng, map]);
  return null;
};

const TacticalMap: React.FC<TacticalMapProps> = ({ lat, lng, onClose }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="absolute top-[80px] bottom-[120px] left-[300px] right-[300px] z-[100] glass-panel border border-accent flex flex-col overflow-hidden"
    style={{ boxShadow: '0 0 30px rgba(0, 243, 255, 0.15)' }}
  >
    <div className="flex justify-between items-center bg-black/70 border-b border-accent/30 p-3">
      <div className="flex items-center gap-3">
        <MapPin className="text-accent" size={18} />
        <h2 className="text-accent font-mono uppercase tracking-widest font-bold text-sm">Surface Map</h2>
        <span className="text-[10px] text-text-muted font-mono bg-white/5 px-2 py-0.5 rounded border border-accent/20">OSM + CARTO</span>
      </div>
      <button type="button" onClick={onClose} aria-label="Close surface map" className="text-accent/60 hover:text-danger">
        <X size={20} />
      </button>
    </div>

    <div className="flex-1 relative bg-[#0a0a0a]">
      <MapContainer center={[lat, lng]} zoom={13} style={{ width: '100%', height: '100%', background: '#0a0a0a' }}>
        <RecenterMap lat={lat} lng={lng} />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        />
        <Marker position={[lat, lng]} icon={targetIcon}>
          <Popup className="font-mono text-xs">
            <strong>Selected coordinate</strong><br />
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </Popup>
        </Marker>
      </MapContainer>

      <div className="absolute bottom-4 left-4 z-[400] glass-panel bg-black/85 border border-white/10 p-3 text-[10px] font-mono max-w-xs">
        This view shows a public basemap and the selected coordinate only. Traffic, police, incidents and routing are not connected.
      </div>
    </div>
  </motion.div>
);

export default TacticalMap;
