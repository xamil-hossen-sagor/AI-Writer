import React, { useEffect, useRef, useState } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, Activity, Settings2 } from 'lucide-react';

const LiveVoice: React.FC = () => {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<string>('Ready to connect');
  const [transcription, setTranscription] = useState<string>('');
  const [instruction, setInstruction] = useState("You are an expert SEO consultant and Content Strategist. Help the user plan their content strategy verbally. Keep responses concise.");
  
  // Refs for audio handling
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef<number>(0);
  const outputNodeRef = useRef<GainNode | null>(null);

  const connect = async () => {
    setStatus('Connecting...');
    try {
      // Vite exposes env vars under `import.meta.env`. Use VITE_ prefix for client-side use.
      const apiKey = (import.meta as any)?.env?.VITE_API_KEY || (window as any)?.API_KEY || '';
      if (!apiKey) {
        console.error('Missing API key. Set VITE_API_KEY in your environment.');
        setStatus('Missing API key');
        setActive(false);
        return;
      }

      const ai = new GoogleGenAI({ apiKey });
      
      // Setup Audio Contexts
      const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = outputAudioContext;
      
      outputNodeRef.current = outputAudioContext.createGain();
      outputNodeRef.current.connect(outputAudioContext.destination);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks: {
          onopen: () => {
            setStatus('Connected - Listening...');
            setActive(true);

            // Input Processing
            const source = inputAudioContext.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
            
            scriptProcessor.onaudioprocess = (e) => {
               const inputData = e.inputBuffer.getChannelData(0);
               const pcmBlob = createBlob(inputData);
               sessionPromise.then(session => {
                 session.sendRealtimeInput({ media: pcmBlob });
               });
            };
            
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContext.destination);
          },
          onmessage: async (msg: LiveServerMessage) => {
             // Handle Text Transcription
             if (msg.serverContent?.outputTranscription) {
                setTranscription(prev => msg.serverContent?.outputTranscription?.text ? prev + msg.serverContent.outputTranscription.text : prev);
             }

             // Handle Audio Output
             const base64Audio = msg.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
             if (base64Audio) {
                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputAudioContext.currentTime);
                const audioBuffer = await decodeAudioData(decode(base64Audio), outputAudioContext, 24000, 1);
                
                const source = outputAudioContext.createBufferSource();
                source.buffer = audioBuffer;
                source.connect(outputNodeRef.current!);
                source.start(nextStartTimeRef.current);
                nextStartTimeRef.current += audioBuffer.duration;
             }
          },
          onclose: () => {
             setStatus('Disconnected');
             setActive(false);
          },
          onerror: (e) => {
            console.error(e);
            setStatus('Error occurred');
            setActive(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
             voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' }}
          },
          outputAudioTranscription: {}, // Enable text back
          systemInstruction: instruction,
        }
      });
      sessionRef.current = sessionPromise;

    } catch (err) {
      console.error("Connection failed", err);
      setStatus('Failed to connect');
      setActive(false);
    }
  };

  const disconnect = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
    }
    setActive(false);
    setStatus('Disconnected');
    window.location.reload(); // Simple reset for demo stability
  };

  // Helpers
  function createBlob(data: Float32Array) {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    const binary = new Uint8Array(int16.buffer);
    let str = '';
    for (let i = 0; i< binary.length; i++) str += String.fromCharCode(binary[i]);
    
    return {
      data: btoa(str),
      mimeType: 'audio/pcm;rate=16000'
    };
  }

  function decode(base64: string) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) {
     const dataInt16 = new Int16Array(data.buffer);
     const frameCount = dataInt16.length / numChannels;
     const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
     for (let c = 0; c < numChannels; c++) {
       const chData = buffer.getChannelData(c);
       for (let i = 0; i < frameCount; i++) {
         chData[i] = dataInt16[i * numChannels + c] / 32768.0;
       }
     }
     return buffer;
  }

  return (
    <div className="p-8 bg-slate-800/50 rounded-2xl border border-slate-700 flex flex-col items-center justify-center min-h-[400px] space-y-8 shadow-xl">
       
       {/* Visualizer / Status */}
       <div className="relative mt-4">
         <div className={`absolute inset-0 bg-accent-500/30 rounded-full blur-2xl transition-all duration-700 ${active ? 'scale-150 opacity-100' : 'scale-50 opacity-0'}`}></div>
         <div className={`relative bg-slate-900 p-6 rounded-full border-2 transition-all duration-300 shadow-2xl ${active ? 'border-accent-500' : 'border-slate-600'}`}>
            <Activity className={`w-12 h-12 ${active ? 'text-accent-400 animate-pulse' : 'text-slate-500'}`} />
         </div>
       </div>
       
       <div className="text-center space-y-1">
         <h3 className="text-2xl font-bold text-white tracking-tight">Live Voice Agent</h3>
         <p className={`text-sm font-medium transition-colors ${active ? 'text-green-400' : 'text-slate-500'}`}>
           {status}
         </p>
       </div>

       {/* Transcription Area */}
       {active && transcription && (
           <div className="w-full max-w-lg p-5 bg-slate-950/80 rounded-xl border border-slate-800 text-sm text-slate-300 max-h-48 overflow-y-auto shadow-inner animate-in fade-in">
               <div className="flex items-center gap-2 mb-2 opacity-50">
                 <div className="w-1.5 h-1.5 bg-accent-500 rounded-full animate-pulse"></div>
                 <span className="text-xs font-bold uppercase tracking-wider text-accent-500">Live Transcript</span>
               </div>
               <p className="leading-relaxed whitespace-pre-wrap">{transcription.slice(-300)}...</p>
           </div>
       )}

       {/* Configuration Input (Visible only when inactive) */}
       {!active && (
         <div className="w-full max-w-md animate-in fade-in slide-in-from-bottom-2">
            <div className="flex items-center gap-2 mb-2 text-slate-400">
               <Settings2 className="w-3 h-3" />
               <label className="text-xs font-bold uppercase tracking-wider">Session Instructions</label>
            </div>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none transition-all shadow-inner placeholder:text-slate-600"
              rows={3}
              placeholder="Describe how the AI should behave (e.g., 'Be a helpful coding assistant', 'Speak like a pirate')..."
            />
         </div>
       )}

       <button
         onClick={active ? disconnect : connect}
         className={`flex items-center gap-3 px-8 py-4 rounded-xl font-bold text-sm transition-all transform hover:scale-105 active:scale-95 shadow-lg ${
           active 
             ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/50 shadow-red-900/20' 
             : 'bg-gradient-to-r from-primary-600 to-indigo-600 text-white hover:from-primary-500 hover:to-indigo-500 shadow-primary-900/30'
         }`}
       >
         {active ? <><MicOff className="w-5 h-5" /> End Session</> : <><Mic className="w-5 h-5" /> Start Conversation</>}
       </button>
    </div>
  );
};

export default LiveVoice;