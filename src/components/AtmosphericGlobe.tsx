import React, { useEffect, useRef, useState, useMemo } from 'react';
import Globe, { GlobeMethods } from 'react-globe.gl';
import * as THREE from 'three';
import { TransportRoute } from '../types';

interface AtmosphericGlobeProps {
  onLocationSelect?: (lat: number, lng: number) => void;
  userLocation: { lat: number, lng: number } | null;
  targetLocation?: { lat: number, lng: number } | null;
  layerIntensities: Record<string, number>;
  transportRoutes: TransportRoute[];
  liveFlights?: any[];
  criticalEvents?: any[];
}

const AtmosphericGlobe: React.FC<AtmosphericGlobeProps> = ({ 
  onLocationSelect, 
  userLocation,
  targetLocation,
  layerIntensities,
  transportRoutes,
  liveFlights = [],
  criticalEvents = []
}) => {
  const globeRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Handle resize
  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Generate some "real-time traffic" points
  const gData = useMemo(() => [...Array(40).keys()].map(() => ({
    lat: (Math.random() - 0.5) * 180,
    lng: (Math.random() - 0.5) * 360,
    size: Math.random() / 3,
    color: ['#00f3ff', '#ff00ea', '#00f3ff'][Math.round(Math.random() * 2)]
  })), []);

  // "Ocean currents" paths
  const arcsData = useMemo(() => [...Array(20).keys()].map(() => ({
    startLat: (Math.random() - 0.5) * 180,
    startLng: (Math.random() - 0.5) * 360,
    endLat: (Math.random() - 0.5) * 180,
    endLng: (Math.random() - 0.5) * 360,
    color: '#0066ff',
  })), []);

  useEffect(() => {
    if (globeRef.current) {
      // Configure controls
      const controls = globeRef.current.controls();
      if (controls) {
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.minDistance = 150; // Prevent zooming too close
        controls.maxDistance = 500; // Prevent zooming too far
      }
    }
  }, []);

  // Point of view synchronization
  useEffect(() => {
    const target = targetLocation || userLocation;
    if (target && globeRef.current) {
      globeRef.current.pointOfView({ 
        lat: target.lat, 
        lng: target.lng, 
        altitude: 1.5 
      }, 1500); // 1.5s smooth transition
    }
  }, [userLocation, targetLocation]);

  const handleZoom = (direction: 'in' | 'out') => {
    if (globeRef.current) {
      const currentPov = globeRef.current.pointOfView();
      const zoomFactor = direction === 'in' ? 0.7 : 1.4;
      globeRef.current.pointOfView({
        ...currentPov,
        altitude: Math.max(0.2, Math.min(3, currentPov.altitude * zoomFactor))
      }, 500);
    }
  };

  const handlePan = (dLat: number, dLng: number) => {
    if (globeRef.current) {
      const currentPov = globeRef.current.pointOfView();
      globeRef.current.pointOfView({
        lat: currentPov.lat + dLat,
        lng: currentPov.lng + dLng,
        altitude: currentPov.altitude
      }, 300);
    }
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const PAN_STEP = 5;

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
          handlePan(PAN_STEP, 0);
          break;
        case 'ArrowDown':
        case 's':
          handlePan(-PAN_STEP, 0);
          break;
        case 'ArrowLeft':
        case 'a':
          handlePan(0, -PAN_STEP);
          break;
        case 'ArrowRight':
        case 'd':
          handlePan(0, PAN_STEP);
          break;
        case '+':
        case '=':
          handleZoom('in');
          break;
        case '-':
        case '_':
          handleZoom('out');
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Custom Layer for Clouds (Satellite imagery)
  useEffect(() => {
    let cloudsMesh: THREE.Mesh | null = null;
    let animationId: number | null = null;
    
    const cloudIntensity = layerIntensities['Satellite Cloud Cover'] ?? 0;

    if (globeRef.current && cloudIntensity > 0) {
      const CLOUD_IMG_URL = '//unpkg.com/three-globe/example/img/earth-clouds.png';
      const CLOUD_ALT = 0.005;
      const CLOUD_ROTATION_SPEED = -0.006; // deg/frame

      new THREE.TextureLoader().load(CLOUD_IMG_URL, cloudsTexture => {
        if (!globeRef.current) return;
        
        cloudsMesh = new THREE.Mesh(
          new THREE.SphereGeometry(globeRef.current.getGlobeRadius() * (1 + CLOUD_ALT), 75, 75),
          new THREE.MeshPhongMaterial({ map: cloudsTexture, transparent: true, opacity: 0.8 * cloudIntensity })
        );
        globeRef.current.scene().add(cloudsMesh);

        const animate = () => {
          if (cloudsMesh) {
            cloudsMesh.rotation.y += CLOUD_ROTATION_SPEED * Math.PI / 180;
            // Allow dynamic opacity updates
            (cloudsMesh.material as THREE.MeshPhongMaterial).opacity = 0.8 * (layerIntensities['Satellite Cloud Cover'] || 0);
            animationId = requestAnimationFrame(animate);
          }
        };
        animate();
      });
    }

    return () => {
      if (cloudsMesh && globeRef.current) {
        globeRef.current.scene().remove(cloudsMesh);
      }
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [layerIntensities]);

  const trafficIntensity = layerIntensities['Global Air Traffic'] ?? 0;
  const flowIntensity = layerIntensities['Atmospheric Flow'] ?? 0;
  const maritimeIntensity = layerIntensities['Maritime Logistics'] ?? 0;
  const oceanicIntensity = layerIntensities['Oceanic Currents'] ?? 0;
  const transportIntensity = layerIntensities['Public Transport'] ?? 0;

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
        
        pointsData={trafficIntensity > 0 ? gData : []}
        pointAltitude={0.1 * trafficIntensity}
        pointColor={(d: any) => {
          const r = parseInt(d.color.slice(1, 3), 16);
          const g = parseInt(d.color.slice(3, 5), 16);
          const b = parseInt(d.color.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${trafficIntensity})`;
        }}
        pointLabel={(d: any) => `Traffic Node: ${d.lat.toFixed(2)}, ${d.lng.toFixed(2)}`}
        
        arcsData={maritimeIntensity > 0 ? arcsData : []}
        arcColor={(d: any) => {
          const r = parseInt(d.color.slice(1, 3), 16);
          const g = parseInt(d.color.slice(3, 5), 16);
          const b = parseInt(d.color.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${maritimeIntensity})`;
        }}
        arcDashLength={0.4}
        arcDashGap={0.1}
        arcDashAnimateTime={2000}
        arcStroke={0.5 * maritimeIntensity}

        pathsData={transportIntensity > 0 ? transportRoutes : []}
        pathPoints="path"
        pathPointLat={(p: any) => p[0]}
        pathPointLng={(p: any) => p[1]}
        pathPointAlt={(p: any) => p[2]}
        pathColor={(d: any) => {
          const r = parseInt(d.color.slice(1, 3), 16);
          const g = parseInt(d.color.slice(3, 5), 16);
          const b = parseInt(d.color.slice(5, 7), 16);
          return `rgba(${r}, ${g}, ${b}, ${transportIntensity})`;
        }}
        pathDashLength={0.01}
        pathDashGap={0.005}
        pathDashAnimateTime={3000}
        pathStroke={1 * transportIntensity}

        ringsData={[...targetLocation ? [targetLocation] : [], ...criticalEvents.map(e => ({ lat: e.lat, lng: e.lng, maxR: Math.max(2, e.mag), color: '#ff0055' }))] }
        ringColor={(d: any) => d.color || '#ff00ea'}
        ringMaxRadius={(d: any) => d.maxR || 2}
        ringPropagationSpeed={1}
        ringRepeatPeriod={800}
        
        labelsData={[
          ...(trafficIntensity > 0 ? liveFlights : []).map(f => ({
            lat: f.lat, lng: f.lng, text: `✈ ${f.callsign}`, color: `rgba(0, 243, 255, ${trafficIntensity})`
          })),
          ...criticalEvents.map(e => ({
            lat: e.lat, lng: e.lng, text: `⚠ M${e.mag} ${e.title}`, color: '#ff0055'
          }))
        ]}
        labelLat="lat"
        labelLng="lng"
        labelText="text"
        labelSize={0.5}
        labelDotRadius={0.2}
        labelColor="color"
        labelResolution={2}

        onGlobeClick={({ lat, lng }) => onLocationSelect?.(lat, lng)}
        
        hexBinPointsData={trafficIntensity > 0 ? gData : []}
        hexBinPointWeight="size"
        hexAltitude={d => d.sumWeight * 0.1 * trafficIntensity}
        hexBinResolution={4}
        hexTopColor={() => `rgba(0, 243, 255, ${trafficIntensity})`}
        hexSideColor={() => `rgba(0, 243, 255, ${trafficIntensity * 0.4})`}
      />
      {/* Zoom Controls Overlay */}
      <div className="absolute right-8 bottom-32 flex flex-col gap-2 z-10 pointer-events-auto">
        <button 
          onClick={() => handleZoom('in')}
          className="w-10 h-10 glass-panel border border-accent/20 flex items-center justify-center text-accent hover:bg-accent/20 transition-colors rounded"
        >
          <span className="text-xl font-bold">+</span>
        </button>
        <button 
          onClick={() => handleZoom('out')}
          className="w-10 h-10 glass-panel border border-accent/20 flex items-center justify-center text-accent hover:bg-accent/20 transition-colors rounded"
        >
          <span className="text-xl font-bold">−</span>
        </button>
      </div>

      {/* HUD Scanline Overlay */}
      <div className="absolute inset-0 scanline opacity-30 pointer-events-none" />
    </div>
  );
};

export default AtmosphericGlobe;
