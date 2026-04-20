import LRU from 'lru-cache';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class LiveDataAggregator {
  private cache: LRU<string, any>;
  private wsConnections: Map<string, WebSocket> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;

  constructor() {
    this.cache = new LRU({
      max: 1000,
      maxSize: 50_000_000,
      sizeCalculation: () => 1,
      ttl: 1000 * 60 * 5
    });
  }

  private getCacheKey(source: string, params: Record<string, any>): string {
    return `${source}:${JSON.stringify(params)}`;
  }

  private isCacheValid(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp < entry.ttl;
  }

  async fetchADSB(bounds: { lamax: number; lamin: number; lomin: number; lomax: number }) {
    const cacheKey = this.getCacheKey('adsb', bounds);
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    try {
      const response = await fetch(
        `/api/live/adsb?lamax=${bounds.lamax}&lamin=${bounds.lamin}&lomin=${bounds.lomin}&lomax=${bounds.lomax}`
      );
      const data = await response.json();

      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl: 10000
      });

      return data;
    } catch (error) {
      console.error('ADSB fetch failed:', error);
      return { aircraft: [] };
    }
  }

  async fetchMarineTraffic(bounds: { lamax: number; lamin: number; lomin: number; lomax: number }) {
    const cacheKey = this.getCacheKey('marine', bounds);
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    try {
      const response = await fetch(
        `/api/live/marine?lamax=${bounds.lamax}&lamin=${bounds.lamin}&lomin=${bounds.lomin}&lomax=${bounds.lomax}`
      );
      const data = await response.json();

      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl: 30000
      });

      return data;
    } catch (error) {
      console.error('Marine traffic fetch failed:', error);
      return { vessels: [] };
    }
  }

  async fetchUSGS() {
    const cacheKey = 'usgs:global';
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    try {
      const response = await fetch('/api/live/usgs');
      const data = await response.json();

      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl: 60000
      });

      return data;
    } catch (error) {
      console.error('USGS fetch failed:', error);
      return { earthquakes: [] };
    }
  }

  async fetchNASAFIRMS() {
    const cacheKey = 'nasa-firms:global';
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    try {
      const response = await fetch('/api/live/nasa-firms');
      const data = await response.json();

      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl: 60000
      });

      return data;
    } catch (error) {
      console.error('NASA FIRMS fetch failed:', error);
      return { fires: [] };
    }
  }

  async fetchGTFS(city: string) {
    const cacheKey = this.getCacheKey('gtfs', { city });
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    try {
      const response = await fetch(`/api/live/gtfs/${city}`);
      const data = await response.json();

      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl: 45000
      });

      return data;
    } catch (error) {
      console.error('GTFS fetch failed:', error);
      return { routes: [], stops: [] };
    }
  }

  async fetchTomTomTraffic(bounds: { lamax: number; lamin: number; lomin: number; lomax: number }) {
    const cacheKey = this.getCacheKey('tomtom-traffic', bounds);
    const cached = this.cache.get(cacheKey);

    if (cached && this.isCacheValid(cached)) {
      return cached.data;
    }

    try {
      const response = await fetch(
        `/api/live/tomtom-traffic?lamax=${bounds.lamax}&lamin=${bounds.lamin}&lomin=${bounds.lomin}&lomax=${bounds.lomax}`
      );
      const data = await response.json();

      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now(),
        ttl: 20000
      });

      return data;
    } catch (error) {
      console.error('TomTom traffic fetch failed:', error);
      return { incidents: [], flows: [] };
    }
  }

  subscribeToStream(source: string, onData: (data: any) => void) {
    const wsUrl = `/ws/live/${source}`;

    if (this.wsConnections.has(source)) {
      return;
    }

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log(`Connected to ${source} stream`);
      this.reconnectAttempts.set(source, 0);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onData(data);
      } catch (error) {
        console.error(`Failed to parse ${source} data:`, error);
      }
    };

    ws.onerror = (error) => {
      console.error(`WebSocket error for ${source}:`, error);
    };

    ws.onclose = () => {
      console.log(`Disconnected from ${source} stream`);
      this.wsConnections.delete(source);

      const attempts = this.reconnectAttempts.get(source) || 0;
      if (attempts < this.maxReconnectAttempts) {
        const delay = Math.pow(2, attempts) * 1000;
        setTimeout(() => {
          this.reconnectAttempts.set(source, attempts + 1);
          this.subscribeToStream(source, onData);
        }, delay);
      }
    };

    this.wsConnections.set(source, ws);
  }

  unsubscribeFromStream(source: string) {
    const ws = this.wsConnections.get(source);
    if (ws) {
      ws.close();
      this.wsConnections.delete(source);
    }
  }

  clearCache() {
    this.cache.clear();
  }

  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.maxSize
    };
  }
}

export const liveDataAggregator = new LiveDataAggregator();
