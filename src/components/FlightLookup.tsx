import React from 'react';
import { ChevronDown, LoaderCircle, Plane, Search } from 'lucide-react';

interface AirportDetails {
  airport?: string | null;
  iata?: string | null;
  icao?: string | null;
  terminal?: string | null;
  gate?: string | null;
  scheduled?: string | null;
  estimated?: string | null;
  actual?: string | null;
}

interface FlightMatch {
  flightDate?: string | null;
  status?: string | null;
  airline?: {
    name?: string | null;
    iata?: string | null;
    icao?: string | null;
  };
  flight?: {
    number?: string | null;
    iata?: string | null;
    icao?: string | null;
  };
  departure?: AirportDetails | null;
  arrival?: AirportDetails | null;
  aircraft?: {
    registration?: string | null;
    iata?: string | null;
    icao?: string | null;
    icao24?: string | null;
  } | null;
  live?: {
    updated?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    altitude?: number | null;
    direction?: number | null;
    speed_horizontal?: number | null;
    speed_vertical?: number | null;
    is_ground?: boolean | null;
  } | null;
}

interface FlightLookupResponse {
  query?: string;
  matches?: FlightMatch[];
  error?: string;
}

function formatTime(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function airportLabel(airport: AirportDetails | null | undefined) {
  return airport?.iata || airport?.icao || airport?.airport || '—';
}

const FlightLookup: React.FC = () => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');
  const [result, setResult] = React.useState<FlightLookupResponse | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = query.replace(/[\s-]+/g, '').toUpperCase();
    if (!/^(?:[A-Z]{2,3}\d{1,4}[A-Z]?|\d{1,4})$/.test(normalized)) {
      setError('Use a flight code such as AI123 or AIC123.');
      setResult(null);
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    try {
      const params = new URLSearchParams({ flight: normalized });
      const response = await fetch(`/api/flight-lookup?${params}`);
      const payload = await response.json() as FlightLookupResponse;
      if (!response.ok) throw new Error(payload.error || `Lookup failed with ${response.status}`);
      setResult(payload);
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : 'Flight lookup failed.');
    } finally {
      setLoading(false);
    }
  };

  const match = result?.matches?.[0];
  const flightCode = match?.flight?.iata || match?.flight?.icao || result?.query || '—';

  return (
    <section className="border-t border-white/5 pt-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="aviationstack-flight-lookup"
        className="panel-title mb-0 flex w-full items-center justify-between rounded px-1 py-2 text-left transition hover:bg-white/5"
      >
        <span className="flex items-center gap-2"><Plane size={13} />Flight Lookup</span>
        <ChevronDown size={15} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <div id="aviationstack-flight-lookup" className={`space-y-3 pt-2 ${open ? '' : 'hidden'}`}>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value.toUpperCase())}
            maxLength={10}
            autoComplete="off"
            spellCheck={false}
            placeholder="AI123 or AIC123"
            aria-label="Flight number or callsign"
            className="min-h-10 min-w-0 flex-1 border border-accent/20 bg-black/60 px-2 font-mono text-[0.75rem] uppercase text-accent outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            aria-label="Look up flight"
            className="flex min-h-10 min-w-10 items-center justify-center border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20 disabled:opacity-35"
          >
            {loading ? <LoaderCircle size={15} className="animate-spin" /> : <Search size={15} />}
          </button>
        </form>

        <div className="text-[0.56rem] leading-relaxed opacity-45">
          On-demand Aviationstack lookup. Add the server-only key in <code>.env.local</code>; results are cached to conserve quota.
        </div>

        {error && (
          <div role="alert" className="border border-danger/25 bg-danger/5 p-2 text-[0.62rem] leading-relaxed text-danger">
            {error}
          </div>
        )}

        {result && !match && (
          <div className="border border-white/10 bg-black/30 p-2 text-[0.65rem] opacity-60">
            No current flight matched {result.query || query}.
          </div>
        )}

        {match && (
          <div className="space-y-2 border border-accent/15 bg-black/35 p-2.5 text-[0.65rem]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-mono text-sm font-bold text-accent">{flightCode}</div>
                <div className="opacity-70">{match.airline?.name || 'Airline unavailable'}</div>
              </div>
              <span className="rounded border border-accent/20 bg-accent/10 px-2 py-1 text-[0.52rem] uppercase text-accent">
                {match.status || 'unknown'}
              </span>
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-black/35 p-2 text-center">
              <div>
                <div className="font-mono text-accent">{airportLabel(match.departure)}</div>
                <div className="truncate text-[0.52rem] opacity-45">{match.departure?.airport || 'Departure'}</div>
              </div>
              <span className="opacity-40">→</span>
              <div>
                <div className="font-mono text-accent">{airportLabel(match.arrival)}</div>
                <div className="truncate text-[0.52rem] opacity-45">{match.arrival?.airport || 'Arrival'}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-black/30 p-2">
                <div className="text-[0.5rem] uppercase opacity-45">Departure</div>
                <div>{formatTime(match.departure?.actual || match.departure?.estimated || match.departure?.scheduled)}</div>
                <div className="text-[0.52rem] opacity-45">T {match.departure?.terminal || '—'} · G {match.departure?.gate || '—'}</div>
              </div>
              <div className="bg-black/30 p-2">
                <div className="text-[0.5rem] uppercase opacity-45">Arrival</div>
                <div>{formatTime(match.arrival?.actual || match.arrival?.estimated || match.arrival?.scheduled)}</div>
                <div className="text-[0.52rem] opacity-45">T {match.arrival?.terminal || '—'} · G {match.arrival?.gate || '—'}</div>
              </div>
            </div>

            {(match.aircraft?.registration || match.aircraft?.icao24 || match.live) && (
              <div className="space-y-1 border-t border-white/5 pt-2 font-mono text-[0.56rem] opacity-65">
                {match.aircraft?.registration && <div>REG {match.aircraft.registration}</div>}
                {match.aircraft?.icao24 && <div>ICAO24 {match.aircraft.icao24.toUpperCase()}</div>}
                {match.live?.latitude !== null && match.live?.latitude !== undefined && match.live?.longitude !== null && match.live?.longitude !== undefined && (
                  <div>LIVE {match.live.latitude.toFixed(3)}, {match.live.longitude.toFixed(3)} · updated {formatTime(match.live.updated)}</div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default FlightLookup;
