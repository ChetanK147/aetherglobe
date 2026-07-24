export interface AisStreamEnv {
  AISSTREAM_API_KEY?: string;
  AISSTREAM_URL?: string;
  AISSTREAM_RUNTIME?: string;
  AISSTREAM_MAX_POSITION_AGE_SECONDS?: string;
}

export interface AisBounds {
  lamin: number;
  lamax: number;
  lomin: number;
  lomax: number;
}

export interface NormalizedVessel {
  id: string;
  mmsi: string;
  name: string;
  lat: number;
  lng: number;
  speedKnots: number | null;
  courseDegrees: number | null;
  headingDegrees: number | null;
  navigationalStatus: number | null;
  vesselType: number | null;
  destination: string | null;
  observedAt: number;
  positionAgeSeconds: number;
  source: 'aisstream';
}

interface AisEnvelope {
  MessageType?: unknown;
  Metadata?: Record<string, unknown>;
  MetaData?: Record<string, unknown>;
  Message?: Record<string, unknown>;
  error?: unknown;
}

interface StoredVessel extends NormalizedVessel {
  updatedAt: number;
}

const DEFAULT_URL = 'wss://stream.aisstream.io/v0/stream';
const POSITION_TYPES = new Set([
  'PositionReport',
  'StandardClassBPositionReport',
  'ExtendedClassBPositionReport',
  'LongRangeAisBroadcastMessage',
]);
const STATIC_TYPES = new Set(['ShipStaticData', 'StaticDataReport']);
const SUBSCRIPTION_TYPES = [...POSITION_TYPES, ...STATIC_TYPES];
const MIN_SUBSCRIPTION_INTERVAL_MS = 1_100;
const RECONNECT_DELAY_MS = 5_000;
const MAX_VESSELS = 10_000;

function configuredSecret(value: string | undefined) {
  const secret = value?.trim();
  if (!secret || /^(paste|your)[-_ ]/i.test(secret)) return null;
  return secret;
}

function parsePositiveNumber(value: string | undefined, fallback: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/@+$/g, '').trim() : null;
}

function timestampFromMetadata(metadata: Record<string, unknown>, fallback: number) {
  const raw = metadata.time_utc ?? metadata.TimeUtc ?? metadata.timestamp;
  if (typeof raw !== 'string') return fallback;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function insideBounds(lat: number, lng: number, bounds: AisBounds) {
  return lat >= bounds.lamin && lat <= bounds.lamax && lng >= bounds.lomin && lng <= bounds.lomax;
}

function sameBounds(left: AisBounds | null, right: AisBounds) {
  return Boolean(left)
    && left!.lamin === right.lamin
    && left!.lamax === right.lamax
    && left!.lomin === right.lomin
    && left!.lomax === right.lomax;
}

function normalizeBounds(bounds: AisBounds): AisBounds {
  return {
    lamin: Math.max(-90, Math.min(90, Number(bounds.lamin.toFixed(4)))),
    lamax: Math.max(-90, Math.min(90, Number(bounds.lamax.toFixed(4)))),
    lomin: Math.max(-180, Math.min(180, Number(bounds.lomin.toFixed(4)))),
    lomax: Math.max(-180, Math.min(180, Number(bounds.lomax.toFixed(4)))),
  };
}

class AisStreamHub {
  private socket: WebSocket | null = null;
  private apiKey = '';
  private streamUrl = DEFAULT_URL;
  private desiredBounds: AisBounds | null = null;
  private subscribedBounds: AisBounds | null = null;
  private lastSubscriptionAt = 0;
  private subscriptionTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private vessels = new Map<string, StoredVessel>();
  private status: 'idle' | 'connecting' | 'open' | 'closed' | 'error' = 'idle';
  private lastError: string | null = null;
  private lastMessageAt: number | null = null;

  configure(apiKey: string, streamUrl: string, bounds: AisBounds) {
    const normalized = normalizeBounds(bounds);
    const connectionChanged = this.apiKey !== apiKey || this.streamUrl !== streamUrl;
    this.apiKey = apiKey;
    this.streamUrl = streamUrl;
    this.desiredBounds = normalized;

    if (connectionChanged) {
      this.closeSocket();
      this.subscribedBounds = null;
    }

    this.ensureConnected();
    if (!sameBounds(this.subscribedBounds, normalized)) this.scheduleSubscription();
  }

  snapshot(bounds: AisBounds, maxPositionAgeSeconds: number) {
    const now = Date.now();
    const vessels: NormalizedVessel[] = [];

    for (const [mmsi, vessel] of this.vessels) {
      const ageSeconds = Math.max(0, Math.round((now - vessel.observedAt) / 1_000));
      if (ageSeconds > maxPositionAgeSeconds * 4) {
        this.vessels.delete(mmsi);
        continue;
      }
      if (ageSeconds > maxPositionAgeSeconds || !insideBounds(vessel.lat, vessel.lng, bounds)) continue;
      vessels.push({ ...vessel, positionAgeSeconds: ageSeconds });
    }

    return {
      vessels: vessels.sort((a, b) => a.positionAgeSeconds - b.positionAgeSeconds),
      source: 'aisstream',
      timestamp: now,
      connection: this.status,
      lastMessageAt: this.lastMessageAt,
      warning: this.lastError,
    };
  }

  private ensureConnected() {
    if (!this.apiKey || !this.desiredBounds) return;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;

    this.clearReconnectTimer();
    this.status = 'connecting';
    this.lastError = null;

    try {
      const socket = new WebSocket(this.streamUrl);
      this.socket = socket;

      socket.addEventListener('open', () => {
        if (this.socket !== socket) return;
        this.status = 'open';
        this.lastError = null;
        this.sendSubscription(true);
      });

      socket.addEventListener('message', (event) => {
        if (this.socket !== socket) return;
        this.handleMessage(event.data);
      });

      socket.addEventListener('error', () => {
        if (this.socket !== socket) return;
        this.status = 'error';
        this.lastError = 'AISstream connection error';
      });

      socket.addEventListener('close', () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.status = 'closed';
        this.subscribedBounds = null;
        this.scheduleReconnect();
      });
    } catch (error) {
      this.status = 'error';
      this.lastError = error instanceof Error ? error.message : String(error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || !this.apiKey || !this.desiredBounds) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected();
    }, RECONNECT_DELAY_MS);
    this.reconnectTimer.unref?.();
  }

  private scheduleSubscription() {
    if (!this.desiredBounds || !this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    const waitMs = Math.max(0, MIN_SUBSCRIPTION_INTERVAL_MS - (Date.now() - this.lastSubscriptionAt));
    if (waitMs === 0) {
      this.sendSubscription(false);
      return;
    }
    if (this.subscriptionTimer) return;
    this.subscriptionTimer = setTimeout(() => {
      this.subscriptionTimer = null;
      this.sendSubscription(false);
    }, waitMs);
    this.subscriptionTimer.unref?.();
  }

  private sendSubscription(force: boolean) {
    const socket = this.socket;
    const bounds = this.desiredBounds;
    if (!socket || socket.readyState !== WebSocket.OPEN || !bounds || !this.apiKey) return;
    if (!force && sameBounds(this.subscribedBounds, bounds)) return;

    socket.send(JSON.stringify({
      APIKey: this.apiKey,
      BoundingBoxes: [[[bounds.lamin, bounds.lomin], [bounds.lamax, bounds.lomax]]],
      FilterMessageTypes: SUBSCRIPTION_TYPES,
    }));
    this.lastSubscriptionAt = Date.now();
    this.subscribedBounds = { ...bounds };
  }

  private handleMessage(data: unknown) {
    let text: string;
    if (typeof data === 'string') text = data;
    else if (data instanceof ArrayBuffer) text = new TextDecoder().decode(data);
    else return;

    let envelope: AisEnvelope;
    try {
      envelope = JSON.parse(text) as AisEnvelope;
    } catch {
      return;
    }

    if (typeof envelope.error === 'string') {
      this.status = 'error';
      this.lastError = envelope.error;
      return;
    }

    const messageType = stringOrNull(envelope.MessageType);
    if (!messageType) return;
    const metadata = envelope.Metadata ?? envelope.MetaData ?? {};
    const messageContainer = envelope.Message ?? {};
    const payload = messageContainer[messageType];
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    const body = payload as Record<string, unknown>;

    const mmsiNumber = numberOrNull(metadata.MMSI ?? body.UserID);
    if (mmsiNumber === null) return;
    const mmsi = String(Math.trunc(mmsiNumber));
    const existing = this.vessels.get(mmsi);
    const now = Date.now();
    const shipName = stringOrNull(metadata.ShipName)
      ?? stringOrNull(body.Name)
      ?? existing?.name
      ?? `MMSI ${mmsi}`;

    if (STATIC_TYPES.has(messageType)) {
      if (!existing) return;
      this.vessels.set(mmsi, {
        ...existing,
        name: shipName,
        vesselType: numberOrNull(body.Type) ?? existing.vesselType,
        destination: stringOrNull(body.Destination) ?? existing.destination,
        updatedAt: now,
      });
      return;
    }

    if (!POSITION_TYPES.has(messageType)) return;
    const lat = numberOrNull(body.Latitude ?? metadata.Latitude ?? metadata.latitude);
    const lng = numberOrNull(body.Longitude ?? metadata.Longitude ?? metadata.longitude);
    if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

    const observedAt = timestampFromMetadata(metadata, now);
    const vessel: StoredVessel = {
      id: mmsi,
      mmsi,
      name: shipName,
      lat,
      lng,
      speedKnots: numberOrNull(body.Sog),
      courseDegrees: numberOrNull(body.Cog),
      headingDegrees: numberOrNull(body.TrueHeading),
      navigationalStatus: numberOrNull(body.NavigationalStatus),
      vesselType: numberOrNull(body.Type) ?? existing?.vesselType ?? null,
      destination: existing?.destination ?? null,
      observedAt,
      positionAgeSeconds: Math.max(0, Math.round((now - observedAt) / 1_000)),
      source: 'aisstream',
      updatedAt: now,
    };
    this.vessels.set(mmsi, vessel);
    this.lastMessageAt = now;
    this.lastError = null;

    if (this.vessels.size > MAX_VESSELS) {
      const oldest = [...this.vessels.entries()]
        .sort((left, right) => left[1].updatedAt - right[1].updatedAt)
        .slice(0, this.vessels.size - MAX_VESSELS);
      for (const [id] of oldest) this.vessels.delete(id);
    }
  }

  private closeSocket() {
    if (this.subscriptionTimer) clearTimeout(this.subscriptionTimer);
    this.subscriptionTimer = null;
    this.clearReconnectTimer();
    const socket = this.socket;
    this.socket = null;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      socket.close(1000, 'Reconfiguring AISstream');
    }
    this.status = 'idle';
  }

  private clearReconnectTimer() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

const hub = new AisStreamHub();

export function getAisStreamStatus(env: AisStreamEnv) {
  const configured = Boolean(configuredSecret(env.AISSTREAM_API_KEY));
  const persistentRuntime = env.AISSTREAM_RUNTIME === 'persistent';
  return {
    configured,
    persistentRuntime,
    mode: configured
      ? persistentRuntime
        ? 'persistent-websocket'
        : 'relay-required'
      : 'disabled',
  };
}

export function getAisStreamSnapshot(bounds: AisBounds, env: AisStreamEnv) {
  const apiKey = configuredSecret(env.AISSTREAM_API_KEY);
  const persistentRuntime = env.AISSTREAM_RUNTIME === 'persistent';
  if (!apiKey) {
    return {
      vessels: [],
      source: 'aisstream',
      timestamp: Date.now(),
      connection: 'disabled',
      configured: false,
      warning: 'AISstream is not configured.',
    };
  }

  if (!persistentRuntime) {
    return {
      vessels: [],
      source: 'aisstream',
      timestamp: Date.now(),
      connection: 'relay-required',
      configured: true,
      warning: 'AISstream requires a persistent backend WebSocket or relay; this serverless runtime does not keep the stream open.',
    };
  }

  const streamUrl = env.AISSTREAM_URL?.trim() || DEFAULT_URL;
  if (!streamUrl.startsWith('wss://')) {
    throw Object.assign(new Error('AISSTREAM_URL must use wss://'), { status: 500 });
  }
  const maxPositionAgeSeconds = parsePositiveNumber(
    env.AISSTREAM_MAX_POSITION_AGE_SECONDS,
    300,
    3_600,
  );
  hub.configure(apiKey, streamUrl, bounds);
  return {
    ...hub.snapshot(bounds, maxPositionAgeSeconds),
    configured: true,
  };
}
