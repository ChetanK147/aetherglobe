import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;

export const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

export const MODELS = {
  flash: "gemini-3-flash-preview",
  pro: "gemini-3.1-pro-preview",
  lite: "gemini-3.1-flash-lite-preview",
};

export async function getGlobalIntelligence(lat: number, lng: number, context: string, useDeepThinking = false) {
  if (!ai) return "AI services offline. Configure GEMINI_API_KEY.";

  try {
    const config: any = {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng
          }
        }
      }
    };

    let modelToUse = MODELS.flash;
    
    // Explicitly handle "ThinkingLevel.HIGH" if complex analysis is needed
    // Pro/Thinking mode might not support Map Grounding effectively, so switch to Google Search Grounding for Deep Mode if needed,
    // though the blueprint asked for googleMaps with flash.
    if (useDeepThinking) {
      modelToUse = MODELS.pro;
      config.tools = [{ googleSearch: {} }];
      delete config.toolConfig; // googleSearch doesn't need latLng mapping
      config.thinkingConfig = { thinkingLevel: "HIGH" }; // Per official docs
    }

    const response = await (ai.models as any).generateContent({
      model: modelToUse,
      contents: [{ role: 'user', parts: [{ text: `You are AetherAI, a sci-fi global monitoring intelligence. 
      Analyze the location at coordinates (${lat}, ${lng}). 
      Context requested: ${context}. 
      Include information about real-time traffic, public transport, and local weather patterns.
      Format your response as a concise, high-tech report with technical jargon mixed with useful facts.
      Use bullet points for different sectors (Traffic, Weather, Logistics).` }] }],
      config: config
    });

    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Error synchronizing with Global Intelligence nexus.";
  }
}

export async function getHistoricalAnalysis(location: string, type: 'weather' | 'traffic') {
  if (!ai) return null;

  try {
    const response = await (ai.models as any).generateContent({
      model: MODELS.pro,
      contents: [{ role: 'user', parts: [{ text: `Provide a historical analysis of ${type} patterns for ${location} over the last decade. 
      Synthesize data into a few key takeaways. 
      Keep it brief and tech-focused.` }] }],
      config: {
        tools: [{ googleSearch: {} }] // Use search instead of maps for text history, without requiring coordinates
      }
    });

    return response.text;
  } catch (error) {
    return "Historical archives unreachable.";
  }
}
