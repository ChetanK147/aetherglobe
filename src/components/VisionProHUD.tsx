import React, { useEffect, useState } from 'react';
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
    const interval = setInterval(() => {
      setPulse(p => (p + 1) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute top-8 right-8 w-80 pointer-events-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 backdrop-blur-2xl rounded-3xl p-8 border border-white/20 shadow-2xl"
      >
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/70 uppercase tracking-wider">Status</h3>
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-400/50" />
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="text-xs text-white/50 mb-2">ALTITUDE</div>
                <div className="text-2xl font-light text-cyan-300">
                  {data.altitude ? Math.floor(data.altitude).toLocaleString() : '---'}
                </div>
                <div className="text-xs text-white/40 mt-1">ft</div>
              </div>

              <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
                <div className="text-xs text-white/50 mb-2">SPEED</div>
                <div className="text-2xl font-light text-emerald-300">
                  {data.speed ? Math.floor(data.speed) : '---'}
                </div>
                <div className="text-xs text-white/40 mt-1">kt</div>
              </div>
            </div>

            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="text-xs text-white/50 mb-3">HEADING</div>
              <div className="relative h-32 flex items-center justify-center">
                <svg className="w-full h-full" viewBox="0 0 200 200">
                  <circle cx="100" cy="100" r="95" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <g opacity="0.5">
                    {[0, 90, 180, 270].map((angle) => (
                      <text
                        key={angle}
                        x={100 + 85 * Math.cos((angle - 90) * Math.PI / 180)}
                        y={100 + 85 * Math.sin((angle - 90) * Math.PI / 180)}
                        textAnchor="middle"
                        fill="rgba(255,255,255,0.3)"
                        fontSize="12"
                      >
                        {angle === 0 ? 'N' : angle === 90 ? 'E' : angle === 180 ? 'S' : 'W'}
                      </text>
                    ))}
                  </g>

                  <line
                    x1="100"
                    y1="100"
                    x2={100 + 70 * Math.cos((data.heading || 0 - 90) * Math.PI / 180)}
                    y2={100 + 70 * Math.sin((data.heading || 0 - 90) * Math.PI / 180)}
                    stroke="#06b6d4"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-xl font-light text-cyan-300">
                    {data.heading ? Math.floor(data.heading) : '---'}°
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4 border-t border-white/10">
            <div className="flex-1 h-1 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-400 to-cyan-400"
                animate={{ width: `${(pulse / 360) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
