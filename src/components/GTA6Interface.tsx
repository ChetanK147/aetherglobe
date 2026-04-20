import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface GTAMetrics {
  radar: Array<{ x: number; y: number; type: 'player' | 'npc' | 'threat' }>;
  health: number;
  armor: number;
  wanted: number;
  location: string;
}

export default function GTA6Interface({ data }: { data: GTAMetrics }) {
  const [radarRotation, setRadarRotation] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setRadarRotation(r => (r + 2) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed bottom-4 left-4 w-80 pointer-events-auto font-sans">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="space-y-2"
      >
        <div className="bg-black/80 border border-red-600 p-3 rounded text-red-500">
          <div className="text-xs font-bold mb-2">{data.location}</div>
          <div className="flex justify-between text-xs">
            <span>WANTED: {'★'.repeat(Math.max(0, data.wanted))}</span>
            <span>LVL {data.wanted}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-red-950/60 border border-red-500 p-2 rounded">
            <div className="text-xs text-red-400 mb-1">HEALTH</div>
            <div className="w-full h-3 bg-black border border-red-500/30 rounded overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-red-600 to-red-400"
                animate={{ width: `${data.health}%` }}
              />
            </div>
          </div>
          <div className="bg-blue-950/60 border border-blue-500 p-2 rounded">
            <div className="text-xs text-blue-400 mb-1">ARMOR</div>
            <div className="w-full h-3 bg-black border border-blue-500/30 rounded overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-600 to-blue-400"
                animate={{ width: `${data.armor}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-black border border-yellow-600 p-3 rounded">
          <div className="text-xs text-yellow-500 font-bold mb-3">RADAR</div>
          <div className="relative w-full aspect-square bg-black/50 border border-yellow-600/50 rounded overflow-hidden">
            <svg
              className="w-full h-full"
              style={{ transform: `rotate(${radarRotation}deg)` }}
            >
              <circle cx="50%" cy="50%" r="45%" fill="none" stroke="rgba(234, 179, 8, 0.2)" />
              <circle cx="50%" cy="50%" r="30%" fill="none" stroke="rgba(234, 179, 8, 0.15)" />
              <line x1="50%" y1="10%" x2="50%" y2="50%" stroke="rgba(234, 179, 8, 0.3)" strokeWidth="1" />
              <line x1="50%" y1="50%" x2="50%" y2="90%" stroke="rgba(234, 179, 8, 0.2)" strokeWidth="1" />
            </svg>

            {data.radar.map((dot, i) => {
              const color =
                dot.type === 'threat' ? '#ef4444' : dot.type === 'player' ? '#fbbf24' : '#60a5fa';
              return (
                <div
                  key={i}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    left: `${50 + dot.x * 35}%`,
                    top: `${50 + dot.y * 35}%`,
                    backgroundColor: color,
                    boxShadow: `0 0 8px ${color}`,
                    transform: 'translate(-50%, -50%)'
                  }}
                />
              );
            })}

            <div className="absolute inset-0 flex items-center justify-center text-xs text-yellow-600/50 font-mono">
              {Math.floor(Date.now() / 100) % 100}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
