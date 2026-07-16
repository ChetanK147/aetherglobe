interface IntelligenceResponse {
  report?: string;
  error?: string;
}

async function requestIntelligence(payload: Record<string, unknown>): Promise<string> {
  const response = await fetch('/api/intelligence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json() as IntelligenceResponse;
  if (!response.ok) {
    throw new Error(data.error || 'Intelligence service unavailable');
  }
  return data.report || 'No intelligence report returned.';
}

export async function getGlobalIntelligence(
  lat: number,
  lng: number,
  context: string,
  useDeepThinking = false,
) {
  try {
    return await requestIntelligence({ lat, lng, context, useDeepThinking });
  } catch (error) {
    console.error('Intelligence request failed:', error);
    return error instanceof Error
      ? `Intelligence service unavailable: ${error.message}`
      : 'Intelligence service unavailable.';
  }
}

export async function getHistoricalAnalysis(location: string, type: 'weather' | 'traffic') {
  try {
    return await requestIntelligence({
      lat: 0,
      lng: 0,
      context: `Provide a concise historical analysis of ${type} patterns for ${location} over the last decade. Clearly identify estimates and cite sources when available.`,
      useDeepThinking: true,
    });
  } catch (error) {
    console.error('Historical analysis failed:', error);
    return 'Historical archives unreachable.';
  }
}
