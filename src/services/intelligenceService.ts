interface IntelligenceResponse {
  report?: string;
  error?: string;
}

async function requestSourceBrief(lat: number, lng: number): Promise<string> {
  const response = await fetch('/api/intelligence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng }),
  });

  const data = await response.json() as IntelligenceResponse;
  if (!response.ok) {
    throw new Error(data.error || 'Source brief unavailable');
  }
  return data.report || 'No source brief returned.';
}

export async function getGlobalIntelligence(lat: number, lng: number) {
  try {
    return await requestSourceBrief(lat, lng);
  } catch (error) {
    console.error('Source brief request failed:', error);
    return error instanceof Error
      ? `Source brief unavailable: ${error.message}`
      : 'Source brief unavailable.';
  }
}
