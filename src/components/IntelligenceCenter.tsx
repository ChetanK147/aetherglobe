import React, { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, MapPin, Sparkles, Terminal, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import Markdown from 'react-markdown';

interface IntelligenceCenterProps {
  report: string | null;
  onAsk: (prompt: string, useDeepThinking?: boolean) => void;
  isLoading: boolean;
  layerIntensities: Record<string, number>;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  desktopOpen?: boolean;
  onDesktopToggle?: () => void;
  onIntensityChange: (layer: string, value: number) => void;
}

interface SectionHeadingProps {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
}

const VERIFIED_LAYERS = ['Global Air Traffic', 'Seismic Activity', 'Satellite Cloud Cover'];

const SectionHeading: React.FC<SectionHeadingProps> = ({ id, title, open, onToggle }) => (
  <>
    <div className="panel-title lg:hidden">{title}</div>
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={id}
      className="panel-title mb-0 hidden w-full items-center justify-between rounded px-1 py-2 text-left transition hover:bg-white/5 lg:flex"
    >
      <span>{title}</span>
      <ChevronDown size={15} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
    </button>
  </>
);

const IntelligenceCenter: React.FC<IntelligenceCenterProps> = ({
  report,
  onAsk,
  isLoading,
  layerIntensities,
  mobileOpen = false,
  onMobileClose,
  desktopOpen = true,
  onDesktopToggle,
  onIntensityChange,
}) => {
  const [query, setQuery] = useState('');
  const [deepThinking, setDeepThinking] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);
  const [analysisOpen, setAnalysisOpen] = useState(true);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = query.trim();
    if (!prompt) return;
    onAsk(prompt, deepThinking);
    setQuery('');
  };

  return (
    <motion.div
      initial={{ x: -400 }}
      animate={{ x: 0 }}
      className={`${mobileOpen ? 'flex' : 'hidden'} fixed inset-x-3 bottom-20 top-28 z-[70] flex-col overflow-hidden rounded-xl glass-panel pointer-events-auto lg:static lg:col-start-1 lg:row-start-2 lg:flex lg:rounded-none`}
    >
      <button
        type="button"
        onClick={onDesktopToggle}
        aria-label="Expand intelligence panel"
        className={`hidden h-full w-full flex-col items-center justify-center gap-4 border border-accent/20 bg-black/45 text-accent transition hover:bg-accent/10 ${desktopOpen ? 'lg:hidden' : 'lg:flex'}`}
      >
        <ChevronRight size={18} />
        <span className="rotate-180 text-[0.58rem] font-black uppercase tracking-[0.22em] [writing-mode:vertical-rl]">Intelligence</span>
      </button>

      <div className={`min-h-0 flex-1 flex-col ${desktopOpen ? 'flex' : 'flex lg:hidden'}`}>
        <div className="flex items-center justify-between border-b border-accent-dim bg-accent/5 p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="text-accent" size={18} />
            <h2 className="text-xs font-black uppercase tracking-[0.18em] text-accent sm:tracking-[0.2em]">Intelligence Nexus</h2>
          </div>
          <div className="flex items-center gap-2">
            <Terminal size={14} className="hidden opacity-40 sm:block" />
            {onDesktopToggle && (
              <button
                type="button"
                onClick={onDesktopToggle}
                aria-label="Collapse intelligence panel"
                className="hidden min-h-9 min-w-9 items-center justify-center rounded border border-accent/20 bg-black/35 text-accent transition hover:bg-accent/10 lg:flex"
              >
                <ChevronLeft size={17} />
              </button>
            )}
            <button type="button" onClick={onMobileClose} aria-label="Close intelligence panel" className="flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-accent lg:hidden">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar sm:p-4">
          <AnimatePresence mode="wait">
            {isLoading ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-full flex-col items-center justify-center gap-4 text-accent">
                <div className="relative">
                  <div className="h-12 w-12 rounded-full border-2 border-accent/20" />
                  <div className="absolute inset-0 h-12 w-12 animate-spin rounded-full border-2 border-t-accent" />
                </div>
                <span className="text-center text-[10px] font-bold uppercase tracking-[0.2em] animate-pulse sm:tracking-[0.25em]">Compiling verified feeds...</span>
              </motion.div>
            ) : (
              <motion.div key="content" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="prose prose-invert prose-xs max-w-none font-mono text-[11px] leading-relaxed text-text-muted">
                <SectionHeading id="verified-visualization-layers" title="Verified Visualization Layers" open={layersOpen} onToggle={() => setLayersOpen((current) => !current)} />
                <div id="verified-visualization-layers" className={`mb-5 grid gap-3 sm:mb-6 ${layersOpen ? '' : 'lg:hidden'}`}>
                  {VERIFIED_LAYERS.map((layer) => {
                    const intensity = layerIntensities[layer] ?? 0;
                    return (
                      <div key={layer} className="flex flex-col gap-2 border-b border-white/5 pb-3">
                        <div className="flex w-full items-center justify-between">
                          <span className={intensity > 0 ? 'text-accent' : 'opacity-60'}>{layer}</span>
                          <span className="text-[0.65rem] opacity-50">{Math.round(intensity * 100)}%</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.05" value={intensity} onChange={(event) => onIntensityChange(layer, Number(event.target.value))} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-accent outline-none" />
                      </div>
                    );
                  })}
                </div>

                <SectionHeading id="ai-analysis-content" title="AI Analysis" open={analysisOpen} onToggle={() => setAnalysisOpen((current) => !current)} />
                <div id="ai-analysis-content" className={analysisOpen ? '' : 'lg:hidden'}>
                  <div className="mb-3 flex gap-2 border border-warning/20 bg-warning/5 p-2 text-[0.62rem] text-warning">
                    <AlertTriangle size={13} className="shrink-0" />
                    AI output may contain errors. Verify important claims against the named sources.
                  </div>
                  {report ? (
                    <Markdown>{report}</Markdown>
                  ) : (
                    <div className="mt-4 flex flex-col items-center justify-center rounded border border-dashed border-accent-dim px-6 py-10 text-center opacity-30 sm:px-8 sm:py-12">
                      <MapPin size={32} className="mb-4" />
                      <p className="text-[10px] font-bold uppercase leading-tight tracking-widest">Select a location to generate a sourced overview</p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <form onSubmit={handleSubmit} className="border-t border-accent-dim bg-black/55 p-3 sm:p-4">
          <div className="relative">
            <input type="text" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ASK ABOUT THIS LOCATION..." className="min-h-11 w-full border border-accent/30 bg-black/60 py-2 pl-3 pr-11 font-mono text-[10px] uppercase text-accent outline-none glow-border placeholder:opacity-30 focus:border-accent" />
            <button type="submit" disabled={isLoading || !query.trim()} aria-label="Submit intelligence request" className="absolute right-1 top-1/2 flex min-h-10 min-w-10 -translate-y-1/2 items-center justify-center text-accent hover:text-white disabled:opacity-30">
              <ChevronRight size={19} />
            </button>
          </div>
          <label className="mt-3 flex min-h-8 cursor-pointer items-center gap-2 text-[9px] uppercase text-accent/80">
            <input type="checkbox" checked={deepThinking} onChange={(event) => setDeepThinking(event.target.checked)} className="h-4 w-4 accent-accent bg-black" />
            Deeper web-grounded analysis
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:mt-3">
            <button type="button" onClick={() => onAsk('Summarize recent natural hazards near this location and identify the source for each claim.', deepThinking)} className="min-h-10 border border-accent/10 text-[8px] font-bold uppercase hover:bg-accent/10">Hazards</button>
            <button type="button" onClick={() => onAsk('Summarize transport and mobility context for this location, separating current facts from general background.', deepThinking)} className="min-h-10 border border-accent/10 text-[8px] font-bold uppercase hover:bg-accent/10">Mobility</button>
          </div>
        </form>
      </div>
    </motion.div>
  );
};

export default IntelligenceCenter;
