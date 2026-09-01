interface IntelligenceResponse {
  report?: string;
  error?: string;
}

async function requestOsintBrief(lat: number, lng: number): Promise<string> {
  const response = await fetch('/api/osint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng }),
  });

  const data = await response.json() as IntelligenceResponse;
  if (!response.ok) {
    throw new Error(data.error || 'OSINT brief unavailable');
  }
  return data.report || 'No OSINT brief returned.';
}

export async function getGlobalIntelligence(lat: number, lng: number) {
  try {
    return await requestOsintBrief(lat, lng);
  } catch (error) {
    console.error('OSINT brief request failed:', error);
    return error instanceof Error
      ? `OSINT brief unavailable: ${error.message}`
      : 'OSINT brief unavailable.';
  }
}
