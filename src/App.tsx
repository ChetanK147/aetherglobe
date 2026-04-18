/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, lazy, Suspense } from 'react';
import NavigationHUD from './components/NavigationHUD';
import { AppState, Location } from './types';
import { getGlobalIntelligence } from './services/geminiService';
import { getLiveFlights, getCriticalEvents } from './services/liveDataService';

const AtmosphericGlobe = lazy(() => import('./components/AtmosphericGlobe'));
const TacticalMap = lazy(() => import('./components/TacticalMap'));
const IntelligenceCenter = lazy(() => import('./components/IntelligenceCenter'));

export default function App() {
  const [state, setState] = useState<AppState & { 
    surfaceViewActive?: boolean;
    liveFlights?: any[];
    criticalEvents?: any[];
  }>({
    userLocation: null,
    selectedLocation: null,
    intelligenceReport: null,
    isLoading: false,
    weather: null,
    traffic: null,
    transportRoutes: [],
    layerIntensities: {
      'Global Air Traffic': 1,
      'Maritime Logistics': 1,
      'Atmospheric Flow': 0,
      'Oceanic Currents': 0,
      'Satellite Cloud Cover': 1,
      'Public Transport': 1
    },
    surfaceViewActive: false,
    liveFlights: [],
    criticalEvents: []
  });

  // Background fetchers for real global data
  useEffect(() => {
    let active = true;
    
    const fetchGlobalData = async () => {
      const selected = state.selectedLocation;
      if (!selected) return;

      // Fetch flights within a 10 degree box of selected region
      const d = 10;
      const [flights, events] = await Promise.all([
        getLiveFlights(selected.lat - d, selected.lng - d, selected.lat + d, selected.lng + d),
        getCriticalEvents()
      ]);

      if (active) {
        setState(prev => ({
          ...prev,
          liveFlights: flights,
          criticalEvents: events
        }));
      }
    };

    fetchGlobalData();
    const inv = setInterval(fetchGlobalData, 15000); // Poll every 15s
    return () => {
       active = false;
       clearInterval(inv);
    };
  }, [state.selectedLocation]);

  const handleIntensityChange = (layerName: string, value: number) => {
    setState(prev => ({
      ...prev,
      layerIntensities: {
        ...prev.layerIntensities,
        [layerName]: value
      }
    }));
  };

  const requestGeolocation = () => {
    setState(prev => ({ ...prev, isLoading: true }));
    const fallbackToDefault = () => {
      console.warn("Geolocation unavailable or denied. Defaulting to Peshawar, Pakistan.");
      const loc = { lat: 34.0151, lng: 71.5249 };
      setState(prev => ({ 
        ...prev, 
        selectedLocation: loc, 
        userLocation: loc,
        isLoading: false
      }));
      handleIntelligenceRequest(loc.lat, loc.lng, "Baseline analysis for regional hub.");
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setState(prev => ({ 
            ...prev, 
            userLocation: loc,
            selectedLocation: loc,
            isLoading: false
          }));
          handleIntelligenceRequest(loc.lat, loc.lng, "Provide initial baseline data for current coordinates.");
        },
        (err) => {
          console.error("Geolocation Error:", err);
          fallbackToDefault();
        },
        { 
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0 
        }
      );
    } else {
      fallbackToDefault();
    }
  };

  // Initial load without auto-geolocation
  useEffect(() => {
    // Just default to a cool global view or default location (Peshawar was requested)
    // Wait for the user to explicitly request geolocation via button click.
    // For now, load default data immediately.
    const loc = { lat: 34.0151, lng: 71.5249 }; // Peshawar
    setState(prev => ({ 
      ...prev, 
      selectedLocation: loc, 
      // Do not set userLocation to indicate auth/geolocation isn't active yet
    }));
    handleIntelligenceRequest(loc.lat, loc.lng, "Baseline analysis for regional hub.");
  }, []);

  // Real-time ticking updates for local data
  useEffect(() => {
    if (!state.selectedLocation) return;
    
    const interval = setInterval(() => {
      setState(prev => {
        if (!prev.selectedLocation) return prev;
        
        // Randomly update delay and status of routes slightly to simulate live tracking
        const updatedRoutes = prev.transportRoutes.map(route => {
          const isDelayed = Math.random() > 0.85;
          return {
            ...route,
            status: isDelayed ? 'DELAYED' : 'ON TIME',
            delay: isDelayed ? Math.floor(Math.random() * 20) : 0,
          };
        });

        const activeStatusOptions = ['NOMINAL', 'CONGESTED', 'REROUTING', 'ACCIDENT_AHEAD'];

        return {
          ...prev,
          transportRoutes: updatedRoutes,
          traffic: {
            level: (prev.selectedLocation.lat + prev.selectedLocation.lng) % 2 === 0 ? 'moderate' : 'heavy',
            incidents: Math.floor(Math.random() * 8),
            activeStatus: activeStatusOptions[Math.floor(Math.random() * activeStatusOptions.length)]
          }
        };
      });
    }, 4000); // Poll every 4 seconds

    return () => clearInterval(interval);
  }, [state.selectedLocation]);

  // Generate mock public transport routes around a location
  const generateTransportRoutes = (lat: number, lng: number) => {
    const routes = [];
    const colors = ['#00ffaa', '#ff0055', '#ffff00'];
    const names = ['Transit Arc Alpha', 'Metro Line Beta', 'Orbital Rail Gamma'];
    
    for (let i = 0; i < 3; i++) {
        const path: [number, number, number][] = [];
        let currLat = lat + (Math.random() - 0.5) * 5; // Wide spread for visibility on globe
        let currLng = lng + (Math.random() - 0.5) * 5;
        
        for (let j = 0; j < 15; j++) {
            path.push([currLat, currLng, 0.005]); // Slightly above ground
            currLat += (Math.random() - 0.5) * 2;
            currLng += (Math.random() - 0.5) * 2;
        }
        
        routes.push({
            id: `trk-${i}`,
            name: names[i],
            color: colors[i],
            status: Math.random() > 0.8 ? 'DELAYED' : 'ON TIME',
            delay: Math.random() > 0.8 ? Math.floor(Math.random() * 15) : 0,
            path
        });
    }
    return routes;
  };

  const handleIntelligenceRequest = async (lat: number, lng: number, context: string, useDeepThinking = false) => {
    setState(prev => ({ ...prev, isLoading: true }));
    try {
      // Fetch METAR from our server
      // Calculate proximity to Peshawar to fetch proper METAR
      const distToPeshawar = Math.abs(lat - 34.0151) + Math.abs(lng - 71.5249);
      const isPeshawar = distToPeshawar < 5;
      const targetIcao = isPeshawar ? 'OPPS' : 'EGLL'; // OPPS is Peshawar International Airport

      const metarResp = await fetch(`/api/metar/${targetIcao}`); 
      const metarData = await metarResp.json();
      
      const report = await getGlobalIntelligence(lat, lng, context, useDeepThinking);
      const routes = generateTransportRoutes(lat, lng);
      
      setState(prev => ({ 
        ...prev, 
        intelligenceReport: report,
        isLoading: false,
        transportRoutes: routes,
        weather: {
          temp: metarData.data?.[0]?.temperature?.celsius ?? (isPeshawar ? 30 : 18),
          condition: "Clear",
          windSpeed: metarData.data?.[0]?.wind?.speed_kts ?? 10,
          humidity: metarData.data?.[0]?.humidity?.percent ?? (isPeshawar ? 45 : 60),
          metar: metarData.data?.[0]?.raw_text ?? `WAITING_FOR_${targetIcao}_UPLINK...`
        },
        traffic: {
          level: (lat + lng) % 2 === 0 ? 'moderate' : 'heavy',
          incidents: Math.floor(Math.random() * 5),
          activeStatus: 'NOMINAL'
        }
      }));
    } catch (error) {
      console.error(error);
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const handleLocationSelect = (lat: number, lng: number) => {
    setState(prev => ({ ...prev, selectedLocation: { lat, lng } }));
    handleIntelligenceRequest(lat, lng, "Analyze point of interest and infrastructure.");
  };

  return (
    <div className="w-screen h-screen bg-bg overflow-hidden relative selection:bg-accent/30 grid grid-rows-[60px_1fr_100px] grid-cols-[280px_1fr_280px] gap-2.5 p-5">
      {/* Background World - Stays in center-region primarily but spans background */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <Suspense fallback={<div className="text-accent flex h-full w-full items-center justify-center font-mono animate-pulse">Establishing orbital link...</div>}>
          <AtmosphericGlobe 
            onLocationSelect={handleLocationSelect}
            userLocation={state.userLocation} 
            targetLocation={state.selectedLocation}
            layerIntensities={state.layerIntensities}
            transportRoutes={state.transportRoutes}
            liveFlights={state.liveFlights}
            criticalEvents={state.criticalEvents}
          />
        </Suspense>
      </div>

      {/* Interface Layers */}
      <NavigationHUD 
        location={state.userLocation}
        weather={state.weather}
        traffic={state.traffic}
        transportRoutes={state.transportRoutes}
        selectedCoord={state.selectedLocation}
        onGeolocate={requestGeolocation}
        onCoordinateSubmit={handleLocationSelect}
        onToggleSurface={() => setState(prev => ({ ...prev, surfaceViewActive: !prev.surfaceViewActive }))}
      />

      {state.surfaceViewActive && state.selectedLocation && (
        <Suspense fallback={null}>
          <TacticalMap 
            lat={state.selectedLocation.lat} 
            lng={state.selectedLocation.lng} 
            onClose={() => setState(prev => ({ ...prev, surfaceViewActive: false }))} 
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <IntelligenceCenter 
          report={state.intelligenceReport}
          isLoading={state.isLoading}
          layerIntensities={state.layerIntensities}
          onIntensityChange={handleIntensityChange}
          onAsk={(prompt, useDeepThinking) => {
            if (state.selectedLocation) {
              handleIntelligenceRequest(state.selectedLocation.lat, state.selectedLocation.lng, prompt, useDeepThinking);
            }
          }}
        />
      </Suspense>
      
      <div className="absolute inset-0 pointer-events-none scanline opacity-30 z-50" />
    </div>
  );
}

