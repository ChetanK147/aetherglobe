import React, { useState } from 'react';
import { AlertTriangle, ChevronRight, MapPin, Sparkles, Terminal } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Markdown from 'react-markdown';

interface IntelligenceCenterProps {
  report: string | null;
  onAsk: (prompt: string, useDeepThinking?: boolean) => void;
  isLoading: boolean;
  layerIntensities: Record<string, number>;
  onIntensityChange: (layer: string, value: number) => void;
}

const VERIFIED_LAYERS = ['Global Air Traffic', 'Seismic Activity', 'Satellite Cloud Cover'];

const IntelligenceCenter: React.FC<IntelligenceCenterProps> = ({
  report,
  onAsk,
  isLoading,
  layerIntensities,
  onIntensityChange,
}) => {
  const [query, setQuery] = useState('');
  const [deepThinking, setDeepThinking] = useState(false);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = query.trim();
    if (!prompt) return;
    onAsk(prompt, deepThinking);
    setQuery('');
  };

  return (
    <motion.div initial={{ x: -400 }} animate={{ x: 0 }} className="col-start-1 row-start-2 flex flex-col glass-panel z-30 pointer-events-auto overflow-hidden">
      <div className="p-4 border-b border-accent-dim bg-accent/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="text-accent" size={18} />
          <h2 className="uppercase text-xs font-black tracking-[0.2em] text-accent">Intelligence Nexus</h2>
        </div>
        <Terminal size={14} className="opacity-40" />
      </div>

      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center h-full gap-4 text-accent">
              <div className="relative">
                <div className="w-12 h-12 border-2 border-accent/20 rounded-full" />
                <div className="absolute inset-0 w-12 h-12 border-2 border-t-accent rounded-full animate-spin" />
              </div>
              <span className="text-[10px] uppercase font-bold tracking-[0.25em] animate-pulse">Compiling verified feeds...</span>
            </motion.div>
          ) : (
            <motion.div key="content" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="prose prose-invert prose-xs max-w-none text-text-muted leading-relaxed font-mono text-[11px]">
              <div className="panel-title">Verified Visualization Layers</div>
              <div className="space-y-3 mb-6">
                {VERIFIED_LAYERS.map((layer) => {
                  const intensity = layerIntensities[layer] ?? 0;
                  return (
                    <div key={layer} className="flex flex-col gap-1 border-b border-white/5 pb-2">
                      <div className="flex justify-between items-center w-full">
                        <span className={intensity > 0 ? 'text-accent' : 'opacity-60'}>{layer}</span>
                        <span className="text-[0.65rem] opacity-50">{Math.round(intensity * 100)}%</span>
                      </div>
                      <input type="range" min="0" max="1" step="0.05" value={intensity} onChange={(event) => onIntensityChange(layer, Number(event.target.value))} className="w-full h-1 bg-white/10 appearance-none cursor-pointer rounded-full accent-accent outline-none" />
                    </div>
                  );
                })}
              </div>

              <div className="panel-title">AI Analysis</div>
              <div className="mb-3 flex gap-2 border border-warning/20 bg-warning/5 p-2 text-[0.6rem] text-warning">
                <AlertTriangle size={13} className="shrink-0" />
                AI output may contain errors. Verify important claims against the named sources.
              </div>
              {report ? (
                <Markdown>{report}</Markdown>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 opacity-30 text-center px-8 border border-dashed border-accent-dim rounded mt-4">
                  <MapPin size={32} className="mb-4" />
                  <p className="text-[10px] uppercase font-bold tracking-widest leading-tight">Select a location to generate a sourced overview</p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-accent-dim bg-black/40">
        <div className="relative">
          <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ASK ABOUT THIS LOCATION..." className="w-full bg-black/60 border border-accent/30 p-2 pl-3 pr-10 text-[10px] text-accent font-mono focus:outline-none focus:border-accent glow-border placeholder:opacity-30 uppercase" />
          <button type="submit" disabled={isLoading || !query.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 text-accent hover:text-white disabled:opacity-30">
            <ChevronRight size={18} />
          </button>
        </div>
        <label className="mt-3 text-[9px] uppercase text-accent/80 flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={deepThinking} onChange={(event) => setDeepThinking(event.target.checked)} className="accent-accent bg-black" />
          Deeper web-grounded analysis
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onAsk('Summarize recent natural hazards near this location and identify the source for each claim.', deepThinking)} className="p-1.5 border border-accent/10 hover:bg-accent/10 text-[8px] uppercase font-bold">Hazards</button>
          <button type="button" onClick={() => onAsk('Summarize transport and mobility context for this location, separating current facts from general background.', deepThinking)} className="p-1.5 border border-accent/10 hover:bg-accent/10 text-[8px] uppercase font-bold">Mobility</button>
        </div>
      </form>
    </motion.div>
  );
};

export default IntelligenceCenter;
