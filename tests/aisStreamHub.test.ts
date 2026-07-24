import assert from 'node:assert/strict';
import test from 'node:test';
import { getAisStreamSnapshot } from '../lib/aisStreamHub';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static latest: MockWebSocket | null = null;

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners = new Map<string, Array<(event: any) => void>>();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.latest = this;
    queueMicrotask(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open', {});
    });
  }

  addEventListener(type: string, listener: (event: any) => void) {
    const existing = this.listeners.get(type) || [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit('close', {});
  }

  emit(type: string, event: any) {
    for (const listener of this.listeners.get(type) || []) listener(event);
  }
}

test('persistent AISstream hub subscribes server-side and normalizes vessel positions', async () => {
  const originalWebSocket = globalThis.WebSocket;
  Object.defineProperty(globalThis, 'WebSocket', {
    configurable: true,
    writable: true,
    value: MockWebSocket,
  });

  try {
    const bounds = { lamin: 18, lamax: 22, lomin: 72, lomax: 76 };
    const env = {
      AISSTREAM_API_KEY: 'test-ais-key',
      AISSTREAM_URL: 'wss://stream.aisstream.io/v0/stream',
      AISSTREAM_RUNTIME: 'persistent',
      AISSTREAM_MAX_POSITION_AGE_SECONDS: '300',
    };

    const connecting = getAisStreamSnapshot(bounds, env);
    assert.equal(connecting.configured, true);
    assert.equal(connecting.connection, 'connecting');

    await new Promise((resolve) => setTimeout(resolve, 0));
    const socket = MockWebSocket.latest;
    assert.ok(socket);
    assert.equal(socket.url, 'wss://stream.aisstream.io/v0/stream');
    assert.equal(socket.sent.length, 1);

    const subscription = JSON.parse(socket.sent[0]) as {
      APIKey?: string;
      BoundingBoxes?: number[][][];
      FilterMessageTypes?: string[];
    };
    assert.equal(subscription.APIKey, 'test-ais-key');
    assert.deepEqual(subscription.BoundingBoxes, [[[18, 72], [22, 76]]]);
    assert.ok(subscription.FilterMessageTypes?.includes('PositionReport'));

    socket.emit('message', {
      data: JSON.stringify({
        MessageType: 'PositionReport',
        Metadata: {
          MMSI: 419000001,
          ShipName: 'TEST VESSEL',
          latitude: 20.1,
          longitude: 74.2,
          time_utc: new Date().toISOString(),
        },
        Message: {
          PositionReport: {
            UserID: 419000001,
            Latitude: 20.1,
            Longitude: 74.2,
            Sog: 12.4,
            Cog: 182.5,
            TrueHeading: 181,
            NavigationalStatus: 0,
            Valid: true,
          },
        },
      }),
    });

    const snapshot = getAisStreamSnapshot(bounds, env);
    assert.equal(snapshot.connection, 'open');
    assert.equal(snapshot.vessels.length, 1);
    assert.equal(snapshot.vessels[0].mmsi, '419000001');
    assert.equal(snapshot.vessels[0].name, 'TEST VESSEL');
    assert.equal(snapshot.vessels[0].speedKnots, 12.4);
    assert.equal(snapshot.vessels[0].courseDegrees, 182.5);
    assert.equal(snapshot.vessels[0].headingDegrees, 181);
    assert.equal(snapshot.vessels[0].source, 'aisstream');
  } finally {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: originalWebSocket,
    });
  }
});
