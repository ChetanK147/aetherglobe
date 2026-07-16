import { useEffect, useState } from 'react';
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
    const interval = window.setInterval(() => {
      setRadarRotation((rotation) => (rotation + 2) % 360);
    }, 50);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="fixed left-3 top-28 z-30 w-52 pointer-events-none font-sans sm:left-5 sm:w-72 lg:absolute lg:bottom-8 lg:left-[300px] lg:top-auto">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
        <div className="rounded border border-red-600 bg-black/80 p-2.5 text-red-500 sm:p-3">
          <div className="mb-2 truncate text-[10px] font-bold sm:text-xs">{data.location}</div>
          <div className="flex justify-between text-[9px] sm:text-xs">
            <span>EVENT LEVEL: {'★'.repeat(Math.max(0, data.wanted)) || 'CLEAR'}</span>
            <span>{data.wanted}/5</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded border border-red-500 bg-red-950/60 p-2">
            <div className="mb-1 text-[8px] text-red-400 sm:text-xs">FEED HEALTH</div>
            <div className="h-2 w-full overflow-hidden rounded border border-red-500/30 bg-black sm:h-3">
              <motion.div className="h-full bg-gradient-to-r from-red-600 to-red-400" animate={{ width: `${data.health}%` }} />
            </div>
          </div>
          <div className="rounded border border-blue-500 bg-blue-950/60 p-2">
            <div className="mb-1 text-[8px] text-blue-400 sm:text-xs">DATA QUALITY</div>
            <div className="h-2 w-full overflow-hidden rounded border border-blue-500/30 bg-black sm:h-3">
              <motion.div className="h-full bg-gradient-to-r from-blue-600 to-blue-400" animate={{ width: `${data.armor}%` }} />
            </div>
          </div>
        </div>

        <div className="hidden rounded border border-yellow-600 bg-black p-3 sm:block">
          <div className="mb-3 text-xs font-bold text-yellow-500">AIRCRAFT RADAR STYLE</div>
          <div className="relative aspect-square w-full overflow-hidden rounded border border-yellow-600/50 bg-black/50">
            <svg className="h-full w-full" style={{ transform: `rotate(${radarRotation}deg)` }} aria-hidden="true">
              <circle cx="50%" cy="50%" r="45%" fill="none" stroke="rgba(234, 179, 8, 0.2)" />
              <circle cx="50%" cy="50%" r="30%" fill="none" stroke="rgba(234, 179, 8, 0.15)" />
              <line x1="50%" y1="10%" x2="50%" y2="50%" stroke="rgba(234, 179, 8, 0.3)" strokeWidth="1" />
              <line x1="50%" y1="50%" x2="50%" y2="90%" stroke="rgba(234, 179, 8, 0.2)" strokeWidth="1" />
            </svg>

            {data.radar.map((dot, index) => {
              const color = dot.type === 'threat' ? '#ef4444' : dot.type === 'player' ? '#fbbf24' : '#60a5fa';
              return (
                <div
                  key={`${dot.type}-${index}`}
                  className="absolute h-2 w-2 rounded-full"
                  style={{
                    left: `${50 + dot.x * 35}%`,
                    top: `${50 + dot.y * 35}%`,
                    backgroundColor: color,
                    boxShadow: `0 0 8px ${color}`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              );
            })}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
