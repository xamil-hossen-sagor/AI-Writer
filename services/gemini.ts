import { GoogleGenAI, Modality } from "@google/genai";

// Initialize GenAI
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Utility: Write string to DataView
 */
const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Utility: Retry Logic for API calls with Exponential Backoff
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const shouldRetry = error?.status === 503 || error?.status === 500 || error?.status === 429 || error?.message?.includes('unavailable');
    if (retries > 0 && shouldRetry) {
      console.warn(`Retrying API call... Attempts left: ${retries}. Error: ${error.message}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Utility: Convert Raw PCM Base64 to WAV Base64
 * Gemini returns raw PCM (24kHz, 1 channel, 16-bit). Browsers need a WAV header to play it.
 */
const pcmToWav = (pcmBase64: string, sampleRate: number = 24000): string => {
  const pcmBinary = atob(pcmBase64);
  const pcmLen = pcmBinary.length;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + pcmLen, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, 1, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, pcmLen, true);

  // Merge header and data
  const headerBytes = new Uint8Array(header);
  const pcmBytes = new Uint8Array(pcmLen);
  for (let i = 0; i < pcmLen; i++) {
    pcmBytes[i] = pcmBinary.charCodeAt(i);
  }

  const wavBytes = new Uint8Array(header.byteLength + pcmLen);
  wavBytes.set(headerBytes, 0);
  wavBytes.set(pcmBytes, header.byteLength);

  // Convert back to Base64
  let binary = '';
  const len = wavBytes.byteLength;
  // Process in chunks to avoid call stack size exceeded on large files
  const chunkSize = 0x8000; 
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = wavBytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
};

/**
 * Discovery Engine: Uses Search Grounding to find trends.
 */
export const discoverTrends = async (niche: string) => {
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Find current, viral "Google Trending News" and high-velocity stories related to "${niche}" from the last 24 hours. 
        
        Prioritize:
        1. Breaking Tech & AI News (Product launches, breakthroughs, ethical debates).
        2. Stock Market & Financial News (Market movers, earnings, crypto spikes).
        3. Global IT & Cybersecurity updates.
        
        If the niche is general, focus strictly on these high-impact sectors.
        Format the output as a clear list of top 5 trends with a brief explanation for each and why it matters for SEO.`,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });
      
      return {
        text: response.text || "No trends found.",
        sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
      };
    } catch (error) {
      console.error("Error discovering trends:", error);
      throw error;
    }
  });
};

/**
 * Discovery Engine: Uses Maps Grounding for local SEO.
 */
export const discoverLocalTrends = async (query: string, lat: number, lng: number) => {
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `What are the best ${query} near this location? Provide a list with ratings and what makes them popular.`,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: { latitude: lat, longitude: lng }
            }
          }
        },
      });
      return {
        text: response.text || "No local data found.",
        sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
      };
    } catch (error) {
      console.error("Error discovering local trends:", error);
      throw error;
    }
  });
}

/**
 * Writer Engine: Uses Thinking Mode (Gemini 3 Pro) for deep SEO strategy and writing.
 */
export const generateSEOArticle = async (topic: string) => {
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: `Act as a World-Class SEO Specialist and Content Writer. Write a comprehensive, high-ranking article about: "${topic}".

        Your Goal: Dominate Google Search Results (SERP), target Google Discover, and optimize for SGE (Generative Engine Optimization) and **Featured Snippets (Position Zero)**.

        --- ARTICLE CHECKLIST ---
        1.  **Structure**: Valid HTML5 inside a main <article> tag.
        2.  **Featured Snippet (CRITICAL)**: START the content body immediately with a "Quick Answer" block. This must be a 40-60 word direct definition or summary answering the "What is" or main intent of the topic. This is designed to be picked up by Google as a Featured Snippet.
        3.  **Key Takeaways**: Follow with a broader "Key Takeaways" table/box for SGE.
        4.  **Deep Content**: Minimum 1500 words. Authoritative tone.
        5.  **Visuals**: Include EXACTLY 3 Image Placeholders and 1 Video Placeholder.
        6.  **Commercial Intent**: Include a "Conclusion & Recommendation" section with a Call to Action (CTA) for products/services.
        7.  **Schema**: JSON-LD Article Schema at the end.
        8.  **Meta**: Provide a <meta name="description" content="..."> tag at the very start.
        
        --- HTML & STYLING (Tailwind CSS) ---
        Use these specific styles for a Premium Dark Mode look:
        *   **Container**: <article class="font-sans text-slate-200 leading-relaxed">
        *   **Meta**: <div id="meta-description" class="hidden">[Insert Optimised Meta Description Here]</div>
        *   **H1 (Title)**: class="text-4xl md:text-6xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary-400 to-indigo-400 mb-8 leading-tight"
        *   **Featured Snippet Box**: class="bg-slate-800/80 border-l-4 border-green-500 p-6 mb-8 rounded-r-xl shadow-xl" (Label as "Quick Answer").
        *   **Key Takeaways Box**: class="bg-slate-900/50 border border-primary-500/30 rounded-xl p-6 mb-10 shadow-lg" (Use a list inside with checkmarks).
        *   **H2**: class="text-3xl font-bold text-white mt-12 mb-6 pl-4 border-l-4 border-primary-500"
        *   **H3**: class="text-xl font-semibold text-primary-200 mt-8 mb-4"
        *   **P**: class="text-slate-300 text-lg mb-6 leading-7"
        *   **Lists**: class="list-disc pl-6 space-y-2 mb-6 text-slate-300 marker:text-primary-500"
        *   **Links**: class="text-primary-400 hover:text-primary-300 underline underline-offset-4 decoration-primary-500/30 transition-all"
        *   **CTA Box**: class="bg-gradient-to-br from-indigo-900/50 to-purple-900/50 border border-indigo-500/50 rounded-2xl p-8 my-12 text-center shadow-2xl"

        --- PLACEHOLDERS ---
        *   **Images**: Insert 3 distinct image placeholders: [IMAGE_PROMPT: detailed, safe, abstract/technical description]
        *   **Video**: Insert 1 video placeholder near the middle: [VIDEO_PROMPT: cinematic 4k drone shot or animation describing the main topic]

        --- EXECUTION ---
        Write the full article now. Ensure it beats all competitors in depth and utility.
        `,
        config: {
          thinkingConfig: { thinkingBudget: 32768 },
        },
      });
      return response.text;
    } catch (error) {
      console.error("Error generating article:", error);
      throw error;
    }
  });
};

/**
 * Image Engine: Imagen 4 with Robust Fallback
 */
export const generateImage = async (prompt: string, aspectRatio: '16:9' | '1:1' | '3:4' = '16:9') => {
  // Safety modifier
  const safePrompt = prompt + ", safe content, no text, cinematic lighting, abstract, 8k resolution";

  // Fallback Placeholder SVG
  const getPlaceholder = () => `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='450' viewBox='0 0 800 450'%3E%3Crect fill='%231e293b' width='800' height='450'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23475569' font-family='sans-serif' font-size='24'%3EAI Image Unavailable%3C/text%3E%3C/svg%3E`;

  return withRetry(async () => {
    try {
      // Attempt 1: Try Imagen 4
      try {
        const response = await ai.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: safePrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/jpeg',
            aspectRatio: aspectRatio,
          },
        });
        
        if (response.generatedImages && response.generatedImages.length > 0 && response.generatedImages[0].image?.imageBytes) {
           const base64 = response.generatedImages[0].image.imageBytes;
           return `data:image/jpeg;base64,${base64}`;
        }
      } catch (e) {
         console.warn("Imagen 4 generation failed or blocked, attempting fallback...", e);
      }

      // Fallback: Try Gemini 2.5 Flash Image
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-image',
          contents: {
            parts: [{ text: safePrompt }],
          },
          config: {
            responseModalities: [Modality.IMAGE],
          },
        });

        const parts = response.candidates?.[0]?.content?.parts;
        if (parts && parts[0]?.inlineData) {
          return `data:image/png;base64,${parts[0].inlineData.data}`;
        }
      } catch (e) {
        console.warn("Flash Image fallback failed", e);
      }

      // LAST RESORT: Return Placeholder
      console.warn("All AI image generation failed. Returning placeholder.");
      return getPlaceholder();

    } catch (error) {
      console.error("Error in generateImage wrapper:", error);
      return getPlaceholder();
    }
  });
};

/**
 * Image Editor: Gemini 2.5 Flash Image (Nano Banana)
 */
export const editImageWithPrompt = async (base64Image: string, prompt: string) => {
  return withRetry(async () => {
    try {
      // Strip prefix if present
      const cleanBase64 = base64Image.split(',')[1] || base64Image;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: cleanBase64,
                mimeType: 'image/jpeg', // Assuming jpeg for simplicity
              },
            },
            { text: prompt + ", high quality" },
          ],
        },
        config: {
          responseModalities: [Modality.IMAGE],
        },
      });

      const parts = response.candidates?.[0]?.content?.parts;
      if (parts && parts[0]?.inlineData) {
        return `data:image/png;base64,${parts[0].inlineData.data}`;
      }
      throw new Error("No image returned from edit");
    } catch (error) {
      console.error("Error editing image:", error);
      throw error;
    }
  });
}

/**
 * Video Engine: Veo 3.1
 */
export const generateVideo = async (prompt: string, aspectRatio: '16:9' | '9:16' = '16:9') => {
  try {
    // Veo requires user selected key
    // @ts-ignore
    if (window.aistudio && !await window.aistudio.hasSelectedApiKey()) {
      // @ts-ignore
      await window.aistudio.openSelectKey();
    }

    // Create a new instance to ensure we pick up the potentially newly selected key
    const veoAi = new GoogleGenAI({ apiKey: process.env.API_KEY });

    let operation = await veoAi.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: aspectRatio
      }
    });

    // Poll for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Check every 5s
      operation = await veoAi.operations.getVideosOperation({ operation: operation });
    }

    if (operation.response?.generatedVideos?.[0]?.video?.uri) {
      const downloadLink = operation.response.generatedVideos[0].video.uri;
      // Return URI with appended key
      return `${downloadLink}&key=${process.env.API_KEY}`;
    }
    throw new Error("Video generation failed");
  } catch (error: any) {
    // Special handling for "Requested entity was not found" which means key selection issues
    if (error.message && error.message.includes('Requested entity was not found')) {
       // @ts-ignore
       if (window.aistudio) {
         // @ts-ignore
         await window.aistudio.openSelectKey();
         // Retry once
         return generateVideo(prompt, aspectRatio); 
       }
    }
    console.error("Video Gen Error:", error);
    throw error;
  }
};

/**
 * Audio Engine: TTS
 */
export const generateSpeech = async (text: string) => {
  if (!text || text.trim().length === 0) return null;
  
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Fenrir' },
            },
          },
        },
      });
      
      const base64Pcm = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Pcm) {
          // Convert Raw PCM to WAV so browsers can play it via <audio> tag
          return pcmToWav(base64Pcm, 24000);
      }
      return null;
    } catch (error) {
      console.error("TTS Error:", error);
      throw error;
    }
  }).catch(err => {
    console.error("Final TTS Failure:", err);
    return null;
  });
}

/**
 * Transcription
 */
export const transcribeAudio = async (base64Audio: string) => {
  return withRetry(async () => {
    try {
      const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: {
              parts: [
                  { inlineData: { mimeType: "audio/wav", data: base64Audio } },
                  { text: "Transcribe this audio exactly." }
              ]
          }
      });
      return response.text;
    } catch (e) {
        console.error("Transcription failed", e);
        throw e;
    }
  });
}