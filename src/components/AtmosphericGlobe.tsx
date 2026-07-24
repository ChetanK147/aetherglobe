import React, { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import type { CriticalEvent, FlightData, Location, VesselData } from '../types';

interface AtmosphericGlobeProps {
  onLocationSelect?: (lat: number, lng: number) => void;
  userLocation: Location | null;
  targetLocation?: Location | null;
  layerIntensities: Record<string, number>;
  liveFlights?: FlightData[];
  liveVessels?: VesselData[];
  criticalEvents?: CriticalEvent[];
}

type TrafficPoint =
  | (FlightData & { kind: 'flight' })
  | (VesselData & { kind: 'vessel' });

const AtmosphericGlobe: React.FC<AtmosphericGlobeProps> = ({
  onLocationSelect,
  userLocation,
  targetLocation,
  layerIntensities,
  liveFlights = [],
  liveVessels = [],
  criticalEvents = [],
}) => {
  const globeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotateSpeed = 0.35;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 150;
    controls.maxDistance = 500;
  }, []);

  useEffect(() => {
    const controls = globeRef.current?.controls();
    if (!controls) return;
    controls.autoRotate = !(targetLocation || userLocation);
  }, [targetLocation, userLocation]);

  useEffect(() => {
    const target = targetLocation || userLocation;
    if (target && globeRef.current) {
      const controls = globeRef.current.controls?.();
      if (controls) controls.autoRotate = false;
      globeRef.current.pointOfView({ lat: target.lat, lng: target.lng, altitude: 1.5 }, 1500);
    }
  }, [targetLocation, userLocation]);

  const cloudIntensity = layerIntensities['Satellite Cloud Cover'] ?? 0;
  useEffect(() => {
    if (!globeRef.current || cloudIntensity <= 0) return;

    let disposed = false;
    let cloudMesh: THREE.Mesh | null = null;
    let animationId = 0;
    const textureLoader = new THREE.TextureLoader();

    textureLoader.load('//unpkg.com/three-globe/example/img/earth-clouds.png', (cloudTexture) => {
      if (disposed || !globeRef.current) {
        cloudTexture.dispose();
        return;
      }
      const geometry = new THREE.SphereGeometry(globeRef.current.getGlobeRadius() * 1.005, 64, 64);
      const material = new THREE.MeshPhongMaterial({
        map: cloudTexture,
        transparent: true,
        opacity: 0.7 * cloudIntensity,
        depthWrite: false,
      });
      cloudMesh = new THREE.Mesh(geometry, material);
      globeRef.current.scene().add(cloudMesh);

      const animate = () => {
        if (!cloudMesh) return;
        cloudMesh.rotation.y -= 0.0001;
        animationId = requestAnimationFrame(animate);
      };
      animate();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(animationId);
      if (cloudMesh && globeRef.current) {
        globeRef.current.scene().remove(cloudMesh);
        const material = cloudMesh.material as THREE.MeshPhongMaterial;
        material.map?.dispose();
        material.dispose();
        cloudMesh.geometry.dispose();
      }
    };
  }, [cloudIntensity]);

  const handleZoom = (direction: 'in' | 'out') => {
    if (!globeRef.current) return;
    const current = globeRef.current.pointOfView();
    const zoomFactor = direction === 'in' ? 0.7 : 1.4;
    globeRef.current.pointOfView({
      ...current,
      altitude: Math.max(0.25, Math.min(3, current.altitude * zoomFactor)),
    }, 500);
  };

  const flightIntensity = layerIntensities['Global Air Traffic'] ?? 0;
  const vesselIntensity = layerIntensities['Maritime Traffic'] ?? 0;
  const seismicIntensity = layerIntensities['Seismic Activity'] ?? 0;
  const flights = flightIntensity > 0 ? liveFlights : [];
  const vessels = vesselIntensity > 0 ? liveVessels : [];
  const events = seismicIntensity > 0 ? criticalEvents : [];
  const trafficPoints: TrafficPoint[] = [
    ...flights.map((flight) => ({ ...flight, kind: 'flight' as const })),
    ...vessels.map((vessel) => ({ ...vessel, kind: 'vessel' as const })),
  ];
  const labels = [
    ...flights.map((flight) => ({
      lat: flight.lat,
      lng: flight.lng,
      text: `✈ ${flight.callsign}`,
      color: `rgba(0, 243, 255, ${flightIntensity})`,
    })),
    ...vessels.map((vessel) => ({
      lat: vessel.lat,
      lng: vessel.lng,
      text: `◆ ${vessel.name}`,
      color: `rgba(45, 212, 191, ${vesselIntensity})`,
    })),
    ...events.map((event) => ({
      lat: event.lat,
      lng: event.lng,
      text: `M${event.magnitude.toFixed(1)} ${event.place}`,
      color: `rgba(255, 77, 77, ${seismicIntensity})`,
    })),
  ];

  return (
    <div className="relative w-full h-full">
      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        backgroundImageUrl="//unpkg.com/three-globe/example/img/night-sky.png"
        pointsData={trafficPoints}
        pointLat="lat"
        pointLng="lng"
        pointAltitude={(point: object) => {
          const item = point as TrafficPoint;
          if (item.kind === 'vessel') return 0.012;
          const altitude = Number(item.altitude || 0);
          return 0.02 + Math.min(0.15, altitude / 300_000);
        }}
        pointRadius={(point: object) => (point as TrafficPoint).kind === 'vessel' ? 0.14 : 0.18}
        pointColor={(point: object) => {
          const item = point as TrafficPoint;
          return item.kind === 'vessel'
            ? `rgba(45, 212, 191, ${vesselIntensity})`
            : `rgba(0, 243, 255, ${flightIntensity})`;
        }}
        pointLabel={(point: object) => {
          const item = point as TrafficPoint;
          if (item.kind === 'vessel') {
            const speed = item.speedKnots === null ? '' : ` · ${item.speedKnots.toFixed(1)} kn`;
            return `${item.name} · MMSI ${item.mmsi}${speed}`;
          }
          return `${item.callsign}${item.altitude ? ` · ${Math.round(item.altitude)} ft` : ''}`;
        }}
        ringsData={[
          ...(targetLocation ? [{ ...targetLocation, maxR: 2, color: '#ff00ea' }] : []),
          ...events.map((event) => ({
            lat: event.lat,
            lng: event.lng,
            maxR: Math.max(2, event.magnitude),
            color: `rgba(255, 77, 77, ${seismicIntensity})`,
          })),
        ]}
        ringColor="color"
        ringMaxRadius="maxR"
        ringPropagationSpeed={1}
        ringRepeatPeriod={900}
        labelsData={labels}
        labelLat="lat"
        labelLng="lng"
        labelText="text"
        labelSize={0.45}
        labelDotRadius={0.16}
        labelColor="color"
        labelResolution={2}
        onGlobeClick={({ lat, lng }) => onLocationSelect?.(lat, lng)}
      />

      <div className="absolute right-8 bottom-32 flex flex-col gap-2 z-10 pointer-events-auto">
        <button type="button" aria-label="Zoom in" onClick={() => handleZoom('in')} className="w-10 h-10 glass-panel border border-accent/20 flex items-center justify-center text-accent hover:bg-accent/20 rounded">
          <span className="text-xl font-bold">+</span>
        </button>
        <button type="button" aria-label="Zoom out" onClick={() => handleZoom('out')} className="w-10 h-10 glass-panel border border-accent/20 flex items-center justify-center text-accent hover:bg-accent/20 rounded">
          <span className="text-xl font-bold">−</span>
        </button>
      </div>
      <div className="absolute inset-0 scanline opacity-30 pointer-events-none" />
    </div>
  );
};

export default AtmosphericGlobe;
