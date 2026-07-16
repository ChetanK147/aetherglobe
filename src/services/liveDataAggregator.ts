import { LRUCache } from 'lru-cache';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class LiveDataAggregator {
  private cache = new LRUCache<string, CacheEntry<unknown>>({
    max: 1000,
    ttl: 5 * 60 * 1000,
  });

  private wsConnections = new Map<string, WebSocket>();
  private reconnectAttempts = new Map<string, number>();
  private reconnectTimers = new Map<string, number>();
  private readonly maxReconnectAttempts = 5;

  private getCacheKey(source: string, params: Record<string, unknown>) {
    return `${source}:${JSON.stringify(params)}`;
  }

  private readCache<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry || Date.now() - entry.timestamp >= entry.ttl) return undefined;
    return entry.data as T;
  }

  private writeCache<T>(key: string, data: T, ttl: number) {
    this.cache.set(key, { data, timestamp: Date.now(), ttl }, { ttl });
  }

  private async fetchJson<T>(url: string, fallback: T): Promise<T> {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Request failed with ${response.status}`);
      return await response.json() as T;
    } catch (error) {
      console.error(`Live data request failed for ${url}:`, error);
      return fallback;
    }
  }

  async fetchADSB(bounds: { lamax: number; lamin: number; lomin: number; lomax: number }) {
    const key = this.getCacheKey('adsb', bounds);
    const cached = this.readCache<{ aircraft: unknown[] }>(key);
    if (cached) return cached;
    const data = await this.fetchJson(`/api/live/adsb?${new URLSearchParams(Object.entries(bounds).map(([k, v]) => [k, String(v)]))}`, { aircraft: [] });
    this.writeCache(key, data, 10_000);
    return data;
  }

  async fetchMarineTraffic(bounds: { lamax: number; lamin: number; lomin: number; lomax: number }) {
    const key = this.getCacheKey('marine', bounds);
    const cached = this.readCache<{ vessels: unknown[]; simulated?: boolean }>(key);
    if (cached) return cached;
    const data = await this.fetchJson(`/api/live/marine?${new URLSearchParams(Object.entries(bounds).map(([k, v]) => [k, String(v)]))}`, { vessels: [], simulated: true });
    this.writeCache(key, data, 30_000);
    return data;
  }

  async fetchUSGS() {
    const key = 'usgs:global';
    const cached = this.readCache<{ earthquakes: unknown[] }>(key);
    if (cached) return cached;
    const data = await this.fetchJson('/api/live/usgs', { earthquakes: [] });
    this.writeCache(key, data, 60_000);
    return data;
  }

  async fetchNASAFIRMS() {
    const key = 'nasa-firms:global';
    const cached = this.readCache<{ fires: unknown[] }>(key);
    if (cached) return cached;
    const data = await this.fetchJson('/api/live/nasa-firms', { fires: [] });
    this.writeCache(key, data, 60_000);
    return data;
  }

  async fetchGTFS(city: string) {
    const safeCity = encodeURIComponent(city.slice(0, 80));
    const key = this.getCacheKey('gtfs', { city: safeCity });
    const cached = this.readCache<{ routes: unknown[]; stops: unknown[]; simulated?: boolean }>(key);
    if (cached) return cached;
    const data = await this.fetchJson(`/api/live/gtfs/${safeCity}`, { routes: [], stops: [], simulated: true });
    this.writeCache(key, data, 45_000);
    return data;
  }

  async fetchTomTomTraffic(bounds: { lamax: number; lamin: number; lomin: number; lomax: number }) {
    const key = this.getCacheKey('tomtom', bounds);
    const cached = this.readCache<{ incidents: unknown[]; flows: unknown[]; simulated?: boolean }>(key);
    if (cached) return cached;
    const data = await this.fetchJson(`/api/live/tomtom-traffic?${new URLSearchParams(Object.entries(bounds).map(([k, v]) => [k, String(v)]))}`, { incidents: [], flows: [], simulated: true });
    this.writeCache(key, data, 20_000);
    return data;
  }

  subscribeToStream(source: string, onData: (data: unknown) => void) {
    if (this.wsConnections.has(source)) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/live/${encodeURIComponent(source)}`);

    ws.onopen = () => this.reconnectAttempts.set(source, 0);
    ws.onmessage = (event) => {
      try {
        onData(JSON.parse(event.data));
      } catch (error) {
        console.error(`Failed to parse ${source} stream data:`, error);
      }
    };
    ws.onerror = (error) => console.error(`WebSocket error for ${source}:`, error);
    ws.onclose = () => {
      this.wsConnections.delete(source);
      const attempts = this.reconnectAttempts.get(source) || 0;
      if (attempts >= this.maxReconnectAttempts) return;
      const timer = window.setTimeout(() => {
        this.reconnectAttempts.set(source, attempts + 1);
        this.subscribeToStream(source, onData);
      }, 2 ** attempts * 1000);
      this.reconnectTimers.set(source, timer);
    };

    this.wsConnections.set(source, ws);
  }

  unsubscribeFromStream(source: string) {
    const timer = this.reconnectTimers.get(source);
    if (timer) window.clearTimeout(timer);
    this.reconnectTimers.delete(source);
    this.reconnectAttempts.delete(source);

    const ws = this.wsConnections.get(source);
    if (ws) ws.close();
    this.wsConnections.delete(source);
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheStats() {
    return { size: this.cache.size, maxSize: this.cache.max };
  }
}

export const liveDataAggregator = new LiveDataAggregator();
