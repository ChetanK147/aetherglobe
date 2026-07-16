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
    initial={{ opacity: 0, scale: 0.97 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.97 }}
    className="fixed inset-x-3 bottom-20 top-20 z-[100] flex flex-col overflow-hidden rounded-xl border border-accent glass-panel lg:absolute lg:bottom-[120px] lg:left-[300px] lg:right-[300px] lg:top-[80px] lg:rounded-none"
    style={{ boxShadow: '0 0 30px rgba(0, 243, 255, 0.15)' }}
  >
    <div className="flex min-h-14 items-center justify-between border-b border-accent/30 bg-black/75 px-3 py-2 sm:p-3">
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        <MapPin className="shrink-0 text-accent" size={18} />
        <h2 className="truncate font-mono text-xs font-bold uppercase tracking-widest text-accent sm:text-sm">Surface Map</h2>
        <span className="hidden rounded border border-accent/20 bg-white/5 px-2 py-0.5 font-mono text-[10px] text-text-muted sm:inline">OSM + CARTO</span>
      </div>
      <button type="button" onClick={onClose} aria-label="Close surface map" className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-accent/70 hover:text-danger">
        <X size={20} />
      </button>
    </div>

    <div className="relative min-h-0 flex-1 bg-[#0a0a0a]">
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

      <div className="absolute bottom-3 left-3 right-3 z-[400] rounded-lg border border-white/10 bg-black/85 p-2.5 font-mono text-[9px] leading-relaxed sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-xs sm:p-3 sm:text-[10px]">
        This view shows a public basemap and the selected coordinate only. Traffic, police, incidents and routing are not connected.
      </div>
    </div>
  </motion.div>
);

export default TacticalMap;
