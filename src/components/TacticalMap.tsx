import React from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Plane, X } from 'lucide-react';
import { motion } from 'motion/react';
import type { FlightData } from '../types';

interface TacticalMapProps {
  lat: number;
  lng: number;
  flights?: FlightData[];
  flightIntensity?: number;
  onClose: () => void;
}

interface MappedFlight extends FlightData {
  distanceKm: number;
}

const targetIcon = L.divIcon({
  className: 'bg-transparent',
  html: '<div style="width:16px;height:16px;background:#00f3ff;border-radius:50%;border:2px solid white;box-shadow:0 0 14px #00f3ff"></div>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6_371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function createFlightIcon(track: number | null | undefined, intensity: number) {
  const heading = Number.isFinite(track) ? Number(track) : 0;
  const opacity = Math.max(0.25, Math.min(1, intensity));
  return L.divIcon({
    className: 'bg-transparent',
    html: `<div style="width:30px;height:30px;display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg);opacity:${opacity};filter:drop-shadow(0 0 5px rgba(0,243,255,.95));">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="#00f3ff" stroke="#ffffff" stroke-width="0.65" stroke-linejoin="round">
        <path d="M12 2.2 9.7 9H4.6L3 11.5l6.6 2.1L8.6 20l3.4-2 3.4 2-1-6.4 6.6-2.1L19.4 9h-5.1L12 2.2Z" />
      </svg>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -15],
  });
}

const FitMapView = ({ lat, lng, flights }: { lat: number; lng: number; flights: MappedFlight[] }) => {
  const map = useMap();

  React.useEffect(() => {
    if (flights.length === 0) {
      map.flyTo([lat, lng], 8, { animate: true });
      return;
    }

    const bounds = L.latLngBounds([
      [lat, lng],
      ...flights.map((flight) => [flight.lat, flight.lng] as [number, number]),
    ]);
    map.fitBounds(bounds.pad(0.12), { animate: true, maxZoom: 9, padding: [36, 36] });
  }, [lat, lng, flights, map]);

  return null;
};

const TacticalMap: React.FC<TacticalMapProps> = ({
  lat,
  lng,
  flights = [],
  flightIntensity = 1,
  onClose,
}) => {
  const mappedFlights = React.useMemo<MappedFlight[]>(() => {
    if (flightIntensity <= 0) return [];
    return flights
      .filter((flight) => Number.isFinite(flight.lat) && Number.isFinite(flight.lng))
      .map((flight) => ({
        ...flight,
        distanceKm: distanceKm(lat, lng, flight.lat, flight.lng),
      }))
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 150);
  }, [flightIntensity, flights, lat, lng]);

  return (
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
          <span className="flex items-center gap-1 rounded border border-accent/20 bg-accent/10 px-2 py-0.5 font-mono text-[10px] text-accent">
            <Plane size={11} /> {mappedFlights.length}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Close surface map" className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-accent/70 hover:text-danger">
          <X size={20} />
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-[#0a0a0a]">
        <MapContainer center={[lat, lng]} zoom={8} style={{ width: '100%', height: '100%', background: '#0a0a0a' }}>
          <FitMapView lat={lat} lng={lng} flights={mappedFlights} />
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          />
          {mappedFlights.map((flight) => (
            <Marker
              key={flight.id || `${flight.callsign}-${flight.lat}-${flight.lng}`}
              position={[flight.lat, flight.lng]}
              icon={createFlightIcon(flight.track, flightIntensity)}
              zIndexOffset={200}
            >
              <Popup className="font-mono text-xs">
                <strong>{flight.callsign || 'Unknown flight'}</strong><br />
                {flight.aircraft ? `${flight.aircraft} · ` : ''}{flight.registration || 'Registration unavailable'}<br />
                Altitude: {flight.altitude == null ? 'Unavailable' : `${Math.round(flight.altitude)} ft`}<br />
                Speed: {flight.velocity == null ? 'Unavailable' : `${Math.round(flight.velocity)} kt`}<br />
                Heading: {flight.track == null ? 'Unavailable' : `${Math.round(flight.track)}°`}<br />
                Distance: approximately {Math.round(flight.distanceKm)} km
              </Popup>
            </Marker>
          ))}
          <Marker position={[lat, lng]} icon={targetIcon} zIndexOffset={500}>
            <Popup className="font-mono text-xs">
              <strong>Selected coordinate</strong><br />
              {lat.toFixed(5)}, {lng.toFixed(5)}
            </Popup>
          </Marker>
        </MapContainer>

        <div className="absolute bottom-3 left-3 right-3 z-[400] rounded-lg border border-white/10 bg-black/85 p-2.5 font-mono text-[9px] leading-relaxed sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-sm sm:p-3 sm:text-[10px]">
          Aircraft icons use an unofficial public feed and may be delayed, incomplete or unavailable. This map is exploratory and must not be used for navigation or operational decisions.
        </div>
      </div>
    </motion.div>
  );
};

export default TacticalMap;
