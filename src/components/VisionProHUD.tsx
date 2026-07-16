import { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface VisionProHUDProps {
  data: {
    altitude?: number;
    speed?: number;
    heading?: number;
    timestamp: number;
  };
}

export default function VisionProHUD({ data }: VisionProHUDProps) {
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setPulse((current) => (current + 1) % 360);
    }, 50);
    return () => window.clearInterval(interval);
  }, []);

  const heading = data.heading ?? 0;
  const headingRadians = ((heading - 90) * Math.PI) / 180;

  return (
    <div className="fixed right-3 top-28 z-30 w-48 pointer-events-none sm:right-5 sm:w-64 lg:absolute lg:right-[300px] lg:top-20 lg:w-72">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-white/20 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 p-3 shadow-2xl backdrop-blur-2xl sm:rounded-3xl sm:p-5"
      >
        <div className="space-y-3 sm:space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-white/70 sm:text-sm">Aircraft status</h3>
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/50 sm:h-3 sm:w-3" />
          </div>

          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-2 sm:gap-3">
            <div className="rounded-xl border border-white/10 bg-white/5 p-2 sm:rounded-2xl sm:p-3">
              <div className="mb-1 text-[8px] text-white/50 sm:text-xs">ALT</div>
              <div className="text-sm font-light text-cyan-300 sm:text-xl">
                {data.altitude ? Math.floor(data.altitude).toLocaleString() : '---'}
              </div>
              <div className="text-[8px] text-white/40 sm:text-xs">ft</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-2 sm:rounded-2xl sm:p-3">
              <div className="mb-1 text-[8px] text-white/50 sm:text-xs">SPEED</div>
              <div className="text-sm font-light text-emerald-300 sm:text-xl">
                {data.speed ? Math.floor(data.speed) : '---'}
              </div>
              <div className="text-[8px] text-white/40 sm:text-xs">kt</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-2 sm:hidden">
              <div className="mb-1 text-[8px] text-white/50">HDG</div>
              <div className="text-sm font-light text-cyan-300">{data.heading !== undefined ? Math.floor(heading) : '---'}°</div>
            </div>
          </div>

          <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-3 sm:block">
            <div className="mb-2 text-xs text-white/50">HEADING</div>
            <div className="relative flex h-24 items-center justify-center">
              <svg className="h-full w-full" viewBox="0 0 200 200" aria-hidden="true">
                <circle cx="100" cy="100" r="95" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                {[0, 90, 180, 270].map((angle) => (
                  <text
                    key={angle}
                    x={100 + 85 * Math.cos(((angle - 90) * Math.PI) / 180)}
                    y={100 + 85 * Math.sin(((angle - 90) * Math.PI) / 180)}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.3)"
                    fontSize="12"
                  >
                    {angle === 0 ? 'N' : angle === 90 ? 'E' : angle === 180 ? 'S' : 'W'}
                  </text>
                ))}
                <line
                  x1="100"
                  y1="100"
                  x2={100 + 70 * Math.cos(headingRadians)}
                  y2={100 + 70 * Math.sin(headingRadians)}
                  stroke="#06b6d4"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-lg font-light text-cyan-300">{data.heading !== undefined ? Math.floor(heading) : '---'}°</div>
              </div>
            </div>
          </div>

          <div className="h-1 overflow-hidden rounded-full bg-gradient-to-r from-blue-500/20 to-cyan-500/20">
            <motion.div className="h-full bg-gradient-to-r from-blue-400 to-cyan-400" animate={{ width: `${(pulse / 360) * 100}%` }} />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
