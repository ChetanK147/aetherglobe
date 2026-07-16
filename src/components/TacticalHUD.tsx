import { useEffect, useState } from 'react';
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
    const interval = window.setInterval(() => {
      setScanAngle((angle) => (angle + 3) % 360);
    }, 50);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="fixed left-3 right-3 top-28 z-30 pointer-events-none sm:right-auto sm:w-80 lg:absolute lg:bottom-8 lg:left-[300px] lg:right-auto lg:top-auto lg:w-80">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-lg border border-red-500/50 bg-black/65 p-3 font-mono backdrop-blur sm:border-2 sm:p-5"
      >
        <div className="mb-3 text-[9px] uppercase tracking-widest text-red-500 sm:mb-4 sm:text-xs">
          [TACTICAL DATA VIEW]
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2 sm:mb-5 sm:gap-3">
          <div className="rounded border border-red-500/30 bg-red-950/20 p-2 sm:p-3">
            <div className="mb-1 text-[8px] text-red-400 sm:text-xs">EVENTS</div>
            <div className="text-lg font-bold text-red-500 sm:text-2xl">{data.threats}</div>
          </div>
          <div className="rounded border border-yellow-500/30 bg-yellow-950/20 p-2 sm:p-3">
            <div className="mb-1 text-[8px] text-yellow-400 sm:text-xs">AIRCRAFT</div>
            <div className="text-lg font-bold text-yellow-500 sm:text-2xl">{data.targets}</div>
          </div>
          <div className="rounded border border-cyan-500/30 bg-cyan-950/20 p-2 sm:p-3">
            <div className="mb-1 text-[8px] text-cyan-400 sm:text-xs">TOTAL</div>
            <div className="text-lg font-bold text-cyan-500 sm:text-2xl">{data.contacts}</div>
          </div>
        </div>

        <div className="relative hidden h-36 overflow-hidden rounded border border-cyan-500/30 bg-black sm:block">
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {[1, 2, 3].map((ring) => (
              <circle key={`ring-${ring}`} cx="50%" cy="50%" r={`${ring * 25}%`} fill="none" stroke="rgba(0, 255, 136, 0.1)" strokeWidth="1" />
            ))}
            {[0, 90, 180, 270].map((angle) => (
              <line
                key={`line-${angle}`}
                x1="50%"
                y1="50%"
                x2={`${50 + 40 * Math.cos(((angle - 90) * Math.PI) / 180)}%`}
                y2={`${50 + 40 * Math.sin(((angle - 90) * Math.PI) / 180)}%`}
                stroke="rgba(0, 255, 136, 0.1)"
                strokeWidth="1"
              />
            ))}
            <g transform={`rotate(${scanAngle} 50 50)`}>
              <line x1="50%" y1="50%" x2="50%" y2="10%" stroke="rgba(0, 255, 136, 0.6)" strokeWidth="2" />
            </g>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <div className="mb-1 text-xs text-cyan-500">DISPLAY SWEEP</div>
              <div className="font-bold text-cyan-400">{scanAngle.toFixed(0)}°</div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-between text-[9px] text-cyan-500/70 sm:mt-4 sm:text-xs">
          <span>SECTOR: ±10°</span>
          <span>DISPLAY RANGE: {data.scanRadius} NM</span>
        </div>
      </motion.div>
    </div>
  );
}
