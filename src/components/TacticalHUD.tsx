import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface TacticalData {
  threats: number;
  targets: number;
  contacts: number;
  scanRadius: number;
}

export default function TacticalHUD({ data }: { data: TacticalData }) {
  const [scanAngle, setScanAngle] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setScanAngle(a => (a + 3) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute bottom-8 left-8 w-96 pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-black/60 border-2 border-red-500/50 backdrop-blur rounded-lg p-6 font-mono"
      >
        <div className="mb-4 text-red-500 text-xs uppercase tracking-widest">
          [TACTICAL OPERATIONS CENTER]
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="border border-red-500/30 p-3 rounded bg-red-950/20">
            <div className="text-red-400 text-xs mb-1">THREATS</div>
            <div className="text-red-500 text-2xl font-bold">{data.threats}</div>
          </div>
          <div className="border border-yellow-500/30 p-3 rounded bg-yellow-950/20">
            <div className="text-yellow-400 text-xs mb-1">TARGETS</div>
            <div className="text-yellow-500 text-2xl font-bold">{data.targets}</div>
          </div>
          <div className="border border-cyan-500/30 p-3 rounded bg-cyan-950/20">
            <div className="text-cyan-400 text-xs mb-1">CONTACTS</div>
            <div className="text-cyan-500 text-2xl font-bold">{data.contacts}</div>
          </div>
        </div>

        <div className="relative h-48 bg-black border border-cyan-500/30 rounded overflow-hidden">
          <div className="absolute inset-0 bg-gradient-radial from-cyan-500/5 to-transparent" />

          <svg className="absolute inset-0 w-full h-full">
            {[1, 2, 3].map((ring) => (
              <circle
                key={`ring-${ring}`}
                cx="50%"
                cy="50%"
                r={`${ring * 25}%`}
                fill="none"
                stroke="rgba(0, 255, 136, 0.1)"
                strokeWidth="1"
              />
            ))}

            {[0, 90, 180, 270].map((angle) => (
              <line
                key={`line-${angle}`}
                x1="50%"
                y1="50%"
                x2={`${50 + 40 * Math.cos((angle - 90) * Math.PI / 180)}%`}
                y2={`${50 + 40 * Math.sin((angle - 90) * Math.PI / 180)}%`}
                stroke="rgba(0, 255, 136, 0.1)"
                strokeWidth="1"
              />
            ))}

            <g transform={`rotate(${scanAngle} 50% 50%)`}>
              <line
                x1="50%"
                y1="50%"
                x2="50%"
                y2="10%"
                stroke="rgba(0, 255, 136, 0.6)"
                strokeWidth="2"
              />
              <polygon
                points="50%,50% 48%,20% 50%,15% 52%,20%"
                fill="rgba(0, 255, 136, 0.3)"
              />
            </g>
          </svg>

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="text-cyan-500 text-xs mb-1">SCAN ACTIVE</div>
              <div className="text-cyan-400 font-bold">{scanAngle.toFixed(0)}°</div>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-xs">
          <div className="flex justify-between text-cyan-500/70">
            <span>RANGE: 250 NM</span>
            <span>ALT: 35000 FT</span>
          </div>
          <div className="flex justify-between text-green-500/70">
            <span>SYS: NOMINAL</span>
            <span>UPTIME: {Math.floor(Date.now() / 1000)}s</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
