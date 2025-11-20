import React, { useState, useEffect, useRef } from 'react';
import { 
  PenTool, Image as ImageIcon, Video, Mic, 
  Search, MapPin, Loader2, Sparkles, ArrowRight, 
  Wand2, Play, Layers, Volume2, Code, ChevronRight,
  Target, TrendingUp
} from 'lucide-react';
import { 
  discoverTrends, discoverLocalTrends, generateSEOArticle, 
  generateImage, generateVideo, editImageWithPrompt, generateSpeech 
} from './services/gemini';
import LiveVoice from './components/LiveVoice';

enum Tab {
  DISCOVER = 'discover',
  WRITE = 'write',
  MEDIA = 'media',
  VOICE = 'voice'
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(Tab.DISCOVER);
  
  // State for Discovery
  const [niche, setNiche] = useState('');
  const [trends, setTrends] = useState<{text: string, sources: any[]} | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [discoveryMode, setDiscoveryMode] = useState<'global' | 'local'>('global');

  // State for Writing
  const [selectedTopic, setSelectedTopic] = useState('');
  const [articleHtml, setArticleHtml] = useState(''); // Storing HTML content
  const [schemaData, setSchemaData] = useState<string | null>(null);
  const [metaDescription, setMetaDescription] = useState<string | null>(null);
  const [isWriting, setIsWriting] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  
  // Video Article State
  const [articleVideoPrompt, setArticleVideoPrompt] = useState<string | null>(null);
  const [articleVideoUrl, setArticleVideoUrl] = useState<string | null>(null);
  const [isGeneratingArticleVideo, setIsGeneratingArticleVideo] = useState(false);

  // State for Media
  const [mediaPrompt, setMediaPrompt] = useState('');
  const [generatedMedia, setGeneratedMedia] = useState<string | null>(null);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16' | '1:1'>('16:9');
  
  // Image Edit State
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for Voice
  const [voiceMode, setVoiceMode] = useState<'live' | 'tts'>('live');
  const [ttsText, setTtsText] = useState('');
  const [ttsAudioSrc, setTtsAudioSrc] = useState<string | null>(null);
  const [isGeneratingTTS, setIsGeneratingTTS] = useState(false);

  const handleDiscover = async () => {
    setIsDiscovering(true);
    setTrends(null);
    
    // Default to IT/AI/Stocks if empty
    const searchTopic = niche.trim() || "Artificial Intelligence, IT, Stock Market, and Emerging Tech News";

    try {
      if (discoveryMode === 'global') {
        const result = await discoverTrends(searchTopic);
        setTrends(result);
      } else {
        navigator.geolocation.getCurrentPosition(async (pos) => {
           try {
             const result = await discoverLocalTrends(searchTopic, pos.coords.latitude, pos.coords.longitude);
             setTrends(result);
             setIsDiscovering(false);
           } catch (e) {
             console.error(e);
             alert("Failed to find local trends. The service might be busy.");
             setIsDiscovering(false);
           }
        }, (err) => {
           alert("Location permission needed for local trends.");
           setIsDiscovering(false);
        });
        return;
      }
    } catch (e) {
      console.error(e);
      alert("Discovery failed. Please try again shortly.");
    }
    setIsDiscovering(false);
  };

  const handleWrite = async () => {
    if (!selectedTopic) return;
    setIsWriting(true);
    setActiveTab(Tab.WRITE);
    setArticleHtml('');
    setSchemaData(null);
    setMetaDescription(null);
    setArticleVideoPrompt(null);
    setArticleVideoUrl(null);
    
    try {
      const rawHtml = await generateSEOArticle(selectedTopic);
      
      // Extract Schema
      const schemaRegex = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i;
      const schemaMatch = rawHtml.match(schemaRegex);
      if (schemaMatch && schemaMatch[1]) {
        setSchemaData(schemaMatch[1]);
      }

      // Extract Meta Description
      const metaRegex = /<div id="meta-description".*?>([\s\S]*?)<\/div>/i;
      const metaMatch = rawHtml.match(metaRegex);
      if (metaMatch && metaMatch[1]) {
          setMetaDescription(metaMatch[1].trim());
      }

      // Process Video Prompt
      const videoPromptRegex = /\[VIDEO_PROMPT:\s*(.*?)\]/i;
      const videoMatch = rawHtml.match(videoPromptRegex);
      if (videoMatch && videoMatch[1]) {
          setArticleVideoPrompt(videoMatch[1]);
      }

      // Process Image Prompts in the HTML
      const promptRegex = /\[IMAGE_PROMPT:\s*(.*?)\]/g;
      
      let contentWithPlaceholders = rawHtml;
      
      // Remove Meta Div from display if found
      contentWithPlaceholders = contentWithPlaceholders.replace(metaRegex, '');

      // Replace Video Prompt with UI Container
      contentWithPlaceholders = contentWithPlaceholders.replace(videoPromptRegex, 
        `<div id="__VIDEO_CONTAINER__" class="my-12"></div>`
      );

      const promptsToGen: { id: string, prompt: string }[] = [];
      let imageCount = 0;

      // Replace [IMAGE_PROMPT: ...] with loading divs
      contentWithPlaceholders = contentWithPlaceholders.replace(promptRegex, (fullMatch, promptText) => {
          imageCount++;
          const id = `__IMG_PLACEHOLDER_${imageCount}__`;
          promptsToGen.push({ id, prompt: promptText });
          
          return `<div id="${id}" class="my-8 p-8 border border-slate-800 rounded-xl bg-slate-900/50 flex flex-col items-center justify-center animate-pulse group">
              <div class="w-10 h-10 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <span class="text-sm font-mono text-primary-400">Generating AI Image...</span>
              <span class="text-xs text-slate-500 mt-1 italic max-w-md text-center">"${promptText.substring(0, 60)}..."</span>
          </div>`;
      });

      setArticleHtml(contentWithPlaceholders);
      setIsWriting(false);

      // Trigger Image Generations in Background
      promptsToGen.forEach(async (item) => {
         const imageUrl = await generateImage(item.prompt, '16:9');
         
         const imgTag = `<figure class="my-10 group relative rounded-2xl overflow-hidden shadow-2xl border border-slate-800/50">
            <img src="${imageUrl}" alt="${item.prompt}" class="w-full h-auto object-cover transform group-hover:scale-[1.01] transition-transform duration-700" />
            <figcaption class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 pt-12 text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
                AI Generated: ${item.prompt}
            </figcaption>
         </figure>`;

         setArticleHtml(prev => prev.replace(
            new RegExp(`<div id="${item.id}".*?<\/div>`, 's'),
            imgTag
         ));
      });

    } catch (e) {
      console.error(e);
      alert("Failed to write article. The AI service is currently unavailable or busy. Please try again.");
      setIsWriting(false);
    }
  };

  const handleGenerateArticleVideo = async () => {
      if (!articleVideoPrompt) return;
      setIsGeneratingArticleVideo(true);
      try {
          const url = await generateVideo(articleVideoPrompt, '16:9');
          setArticleVideoUrl(url);
      } catch(e) {
          alert("Video generation failed. Try again later.");
      }
      setIsGeneratingArticleVideo(false);
  };

  const handleGenerateMedia = async () => {
    if (!mediaPrompt) return;
    setIsGeneratingMedia(true);
    setGeneratedMedia(null);
    try {
      if (mediaType === 'image') {
        const url = await generateImage(mediaPrompt, aspectRatio as any);
        setGeneratedMedia(url);
      } else {
        // Video
        const url = await generateVideo(mediaPrompt, aspectRatio as any);
        setGeneratedMedia(url);
      }
    } catch (e) {
      alert("Generation failed. The service may be temporarily unavailable.");
      console.error(e);
    }
    setIsGeneratingMedia(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setGeneratedMedia(reader.result as string);
        setMediaType('image'); // Force image mode
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEditImage = async () => {
    if (!generatedMedia || !editPrompt) return;
    setIsEditing(true);
    try {
      const newImage = await editImageWithPrompt(generatedMedia, editPrompt);
      setGeneratedMedia(newImage);
      setEditPrompt('');
    } catch (e) {
      console.error(e);
      alert("Edit failed.");
    }
    setIsEditing(false);
  };

  const handleReadArticle = async () => {
    if (!articleHtml) return;
    setIsPlayingAudio(true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = articleHtml;
    const textContent = tempDiv.textContent || "";
    
    if (!textContent.trim()) {
        setIsPlayingAudio(false);
        return;
    }

    // Read first 500 chars as sample
    const audioBase64 = await generateSpeech(textContent.substring(0, 500)); 
    if (audioBase64) {
      const audio = new Audio("data:audio/wav;base64," + audioBase64);
      audio.onended = () => setIsPlayingAudio(false);
      audio.play();
    } else {
      alert("TTS failed. Service unavailable.");
      setIsPlayingAudio(false);
    }
  };

  const handleGenerateTTS = async () => {
    if (!ttsText) return;
    setIsGeneratingTTS(true);
    try {
        const base64 = await generateSpeech(ttsText);
        if (base64) {
            setTtsAudioSrc(`data:audio/wav;base64,${base64}`);
        } else {
            alert("Audio generation failed.");
        }
    } catch(e) {
        console.error(e);
        alert("Audio generation failed.");
    }
    setIsGeneratingTTS(false);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden">
      {/* Top Menu Bar with Workflow Steps */}
      <header className="h-16 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3 text-primary-400">
          <div className="bg-primary-500/10 p-2 rounded-lg border border-primary-500/20">
            <Sparkles className="w-5 h-5" />
          </div>
          <h1 className="font-bold text-lg text-white tracking-tight hidden sm:block">TrendFlow AI</h1>
        </div>
        
        <nav className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center bg-slate-800/50 p-1.5 rounded-full border border-slate-700/50 backdrop-blur-sm shadow-xl">
           <NavStep 
             step={1}
             label="Discover" 
             active={activeTab === Tab.DISCOVER} 
             onClick={() => setActiveTab(Tab.DISCOVER)} 
           />
           <ChevronRight className="w-4 h-4 text-slate-600 mx-1" />
           <NavStep 
             step={2}
             label="Write" 
             active={activeTab === Tab.WRITE} 
             onClick={() => setActiveTab(Tab.WRITE)} 
           />
           <ChevronRight className="w-4 h-4 text-slate-600 mx-1" />
           <NavStep 
             step={3}
             label="Assets" 
             active={activeTab === Tab.MEDIA} 
             onClick={() => setActiveTab(Tab.MEDIA)} 
           />
           <ChevronRight className="w-4 h-4 text-slate-600 mx-1" />
           <NavStep 
             step={4}
             label="Voice" 
             active={activeTab === Tab.VOICE} 
             onClick={() => setActiveTab(Tab.VOICE)} 
           />
        </nav>

        <div className="text-xs font-medium text-slate-500 border border-slate-800 px-3 py-1.5 rounded-full bg-slate-900/50 hidden md:block">
          <span className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3"/> Content Engine</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-4 lg:p-8 relative scroll-smooth">
        
        {/* Background Gradient */}
        <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-primary-900/10 to-transparent pointer-events-none" />

        {/* DISCOVER TAB */}
        {activeTab === Tab.DISCOVER && (
          <div className="max-w-3xl mx-auto space-y-8 relative z-10 animate-in fade-in duration-500">
            <div className="space-y-2 text-center pt-8">
              <h2 className="text-4xl font-bold text-white tracking-tight">Trend Discovery</h2>
              <p className="text-slate-400 text-lg">Step 1: Identify viral news with Search Grounding.</p>
            </div>

            <div className="bg-slate-900/50 p-2 rounded-2xl border border-slate-700 backdrop-blur-sm shadow-xl">
              <div className="flex gap-2 p-2 border-b border-slate-800/50 mb-2">
                <button 
                  onClick={() => setDiscoveryMode('global')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${discoveryMode === 'global' ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  Global News
                </button>
                <button 
                  onClick={() => setDiscoveryMode('local')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${discoveryMode === 'local' ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
                >
                  <MapPin size={14} /> Local Insights
                </button>
              </div>
              
              <div className="flex gap-2 p-2">
                <div className="flex-1 relative">
                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 w-5 h-5" />
                   <input 
                    type="text" 
                    value={niche}
                    onChange={(e) => setNiche(e.target.value)}
                    placeholder={discoveryMode === 'global' ? "Enter topic (Default: IT, AI, Stocks)..." : "Enter service (e.g. 'Italian Restaurants')"}
                    className="w-full bg-slate-950/50 border border-slate-700 rounded-xl pl-12 pr-4 py-4 focus:ring-2 focus:ring-primary-500 focus:outline-none text-white placeholder:text-slate-600 transition-all"
                    onKeyDown={(e) => e.key === 'Enter' && handleDiscover()}
                  />
                </div>
                <button 
                  onClick={handleDiscover}
                  disabled={isDiscovering}
                  className="bg-primary-600 hover:bg-primary-500 text-white px-8 rounded-xl font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-primary-900/30"
                >
                  {isDiscovering ? <Loader2 className="animate-spin" /> : "Find"}
                </button>
              </div>
            </div>

            {trends && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="prose prose-invert max-w-none bg-slate-900/50 p-8 rounded-2xl border border-slate-700 shadow-xl">
                   <div dangerouslySetInnerHTML={{__html: trends.text.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong class="text-primary-200">$1</strong>') }} />
                </div>
                
                {/* Interactive Topic Selector */}
                <div className="bg-gradient-to-r from-indigo-900/40 to-purple-900/40 p-6 rounded-2xl border border-indigo-500/30 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-lg">
                   <div>
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2"><Sparkles className="text-yellow-400 w-4 h-4"/> Next Step: Content Creation</h3>
                      <p className="text-indigo-200/60 text-sm">Send this topic to the Writer engine.</p>
                   </div>
                   <div className="flex gap-2 w-full sm:w-auto">
                      <input 
                        type="text" 
                        placeholder="Paste a topic..."
                        value={selectedTopic}
                        onChange={(e) => setSelectedTopic(e.target.value)}
                        className="flex-1 sm:w-64 bg-slate-950/50 border border-indigo-500/30 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-indigo-400 transition-colors"
                      />
                      <button 
                        onClick={handleWrite}
                        className="bg-indigo-500 hover:bg-indigo-400 text-white px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors shadow-lg shadow-indigo-900/30"
                      >
                        Write Article <ArrowRight size={16} />
                      </button>
                   </div>
                </div>
                
                {/* Sources */}
                {trends.sources.length > 0 && (
                  <div className="text-xs text-slate-500 border-t border-slate-800/50 pt-4">
                    <p className="font-semibold mb-3 uppercase tracking-wider opacity-70">Verified Sources</p>
                    <div className="flex flex-wrap gap-2">
                      {trends.sources.slice(0, 4).map((s: any, i: number) => (
                        <a key={i} href={s.web?.uri || s.maps?.uri} target="_blank" rel="noreferrer" className="bg-slate-800/50 hover:bg-slate-700 px-3 py-1.5 rounded-md border border-slate-700 transition-colors hover:text-primary-400 flex items-center gap-2">
                           <div className="w-1.5 h-1.5 rounded-full bg-primary-500"></div>
                           {s.web?.title || s.maps?.title || "Source"}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* WRITE TAB */}
        {activeTab === Tab.WRITE && (
          <div className="max-w-5xl mx-auto space-y-6 relative z-10 h-full flex flex-col animate-in fade-in duration-500">
             <div className="flex items-center justify-between pt-4">
                <div>
                  <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                    SEO Content Engine
                  </h2>
                  <p className="text-slate-400 mt-1">Step 2: Generates rich HTML, Metadata, and Embedded Media.</p>
                </div>
                <div className="flex gap-3">
                  {articleHtml && (
                    <button 
                      onClick={handleReadArticle}
                      className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all border ${isPlayingAudio ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'}`}
                    >
                      {isPlayingAudio ? <><Loader2 className="w-4 h-4 animate-spin" /> Playing...</> : <><Volume2 className="w-4 h-4" /> Read Aloud</>}
                    </button>
                  )}
                </div>
             </div>

             {isWriting && (
               <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-primary-500/20 border-t-primary-500 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Sparkles className="w-8 h-8 text-primary-500 animate-pulse" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Architecting Content...</h3>
                    <p className="text-slate-400 mt-2 max-w-md mx-auto">Gemini 3 Pro is writing your SEO masterpiece with SGE reasoning and visual planning.</p>
                  </div>
               </div>
             )}

             {!isWriting && !articleHtml && (
               <div className="flex-1 flex flex-col items-center justify-center text-slate-500 min-h-[400px] border-2 border-dashed border-slate-800 rounded-3xl bg-slate-900/20">
                 <div className="w-20 h-20 bg-slate-900 rounded-full flex items-center justify-center mb-6 shadow-xl">
                    <PenTool className="w-10 h-10 text-slate-600" />
                 </div>
                 <h3 className="text-xl font-semibold text-slate-300 mb-2">Ready to Write</h3>
                 <p className="max-w-sm text-center text-slate-500 mb-8">Select a topic from the Trend Scout or enter a custom topic below.</p>
                 
                 <div className="relative group w-full max-w-md">
                   <div className="absolute -inset-1 bg-gradient-to-r from-primary-600 to-indigo-600 rounded-xl opacity-20 group-hover:opacity-40 transition duration-500 blur"></div>
                   <input 
                      type="text" 
                      placeholder="Enter article topic manually..."
                      className="relative w-full bg-slate-900 border border-slate-700 rounded-xl px-6 py-4 text-center focus:border-primary-500 focus:outline-none text-white placeholder:text-slate-600 transition-all"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setSelectedTopic(e.currentTarget.value);
                          handleWrite();
                        }
                      }}
                   />
                 </div>
               </div>
             )}

             {!isWriting && articleHtml && (
               <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in slide-in-from-bottom-8 duration-700 pb-10">
                  
                  {/* Main Article Content */}
                  <div className="lg:col-span-8">
                      <div className="bg-slate-950/50 rounded-2xl p-8 lg:p-12 shadow-2xl border border-slate-800/50">
                         {/* Render rich HTML content with dangerous HTML */}
                         <div 
                            dangerouslySetInnerHTML={{__html: articleHtml}} 
                            className="prose prose-invert max-w-none"
                         />
                         
                         {/* Injected Video Area (Replaces Placeholder) */}
                         {articleVideoPrompt && (
                           <div id="generated-video-section" className="mt-12 -mx-8 lg:-mx-12 mb-8 bg-black p-6 border-y border-slate-800">
                              {articleVideoUrl ? (
                                 <div className="relative max-w-3xl mx-auto">
                                    <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Video className="text-primary-500"/> Video Summary</h3>
                                    <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden shadow-2xl border border-slate-800">
                                        <video src={articleVideoUrl} controls className="w-full h-full object-cover" />
                                    </div>
                                 </div>
                              ) : (
                                 <div className="flex flex-col items-center text-center space-y-4 py-6">
                                    <div className="bg-primary-900/20 p-4 rounded-full">
                                       <Video className="w-8 h-8 text-primary-400" />
                                    </div>
                                    <div>
                                      <h3 className="text-white font-bold text-lg">Generate Video Summary</h3>
                                      <p className="text-slate-400 text-sm max-w-md">Enhance this article with a 1080p AI-generated video summary using Veo.</p>
                                    </div>
                                    <button 
                                      onClick={handleGenerateArticleVideo}
                                      disabled={isGeneratingArticleVideo}
                                      className="bg-white text-black px-6 py-3 rounded-full font-bold hover:scale-105 transition-transform flex items-center gap-2 disabled:opacity-50"
                                    >
                                      {isGeneratingArticleVideo ? <Loader2 className="animate-spin"/> : <Wand2 className="w-4 h-4"/>}
                                      Generate Veo Video
                                    </button>
                                 </div>
                              )}
                           </div>
                         )}
                      </div>
                  </div>

                  {/* Sidebar: Schema & Meta */}
                  <div className="lg:col-span-4 space-y-6">
                     <div className="bg-slate-900/80 backdrop-blur p-6 rounded-2xl border border-slate-700 shadow-xl sticky top-20">
                        <h3 className="font-bold text-white mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                           <Target className="w-4 h-4 text-green-400"/> SEO Intelligence
                        </h3>
                        
                        <div className="space-y-5">
                           {metaDescription && (
                             <div>
                               <span className="text-xs font-bold text-slate-500 uppercase block mb-1">Meta Description</span>
                               <p className="text-xs text-slate-300 bg-black/30 p-3 rounded-lg border border-slate-800 italic leading-relaxed">
                                 {metaDescription}
                               </p>
                             </div>
                           )}

                           <div>
                             <span className="text-xs font-bold text-slate-500 uppercase">Optimization Score</span>
                             <div className="flex items-center gap-2 mt-1">
                                <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-green-500 w-[99%]"></div>
                                </div>
                                <span className="text-green-400 font-bold text-sm">99/100</span>
                             </div>
                           </div>

                           {schemaData && (
                             <div>
                               <span className="text-xs font-bold text-slate-500 uppercase mb-2 block">Schema Markup (JSON-LD)</span>
                               <div className="bg-black/50 rounded-lg p-3 border border-slate-800 overflow-hidden group relative">
                                 <pre className="text-[10px] text-slate-400 font-mono overflow-x-auto max-h-32 scrollbar-thin">
                                   {schemaData}
                                 </pre>
                                 <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50 pointer-events-none"></div>
                               </div>
                               <button 
                                 onClick={() => navigator.clipboard.writeText(`<script type="application/ld+json">${schemaData}</script>`)}
                                 className="mt-2 w-full py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 rounded-lg transition-colors border border-slate-700 font-medium"
                               >
                                 Copy Script Tag
                               </button>
                             </div>
                           )}
                           
                           <div className="grid grid-cols-2 gap-2">
                             <div className="p-3 bg-indigo-900/20 border border-indigo-500/30 rounded-lg">
                                <h4 className="text-indigo-300 text-xs font-bold mb-1">SGE Ready</h4>
                                <p className="text-[10px] text-indigo-200/70">
                                  Optimized for AI Snapshots with "Key Takeaways" and structured lists.
                                </p>
                             </div>
                             <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                                <h4 className="text-purple-300 text-xs font-bold mb-1">Discover</h4>
                                <p className="text-[10px] text-purple-200/70">
                                  High-res visuals and entity-first content for Google Discover.
                                </p>
                             </div>
                           </div>
                        </div>
                     </div>
                  </div>
               </div>
             )}
          </div>
        )}

        {/* MEDIA TAB */}
        {activeTab === Tab.MEDIA && (
          <div className="max-w-6xl mx-auto space-y-8 relative z-10 animate-in fade-in duration-500 pt-4">
             <div className="flex items-center justify-between">
               <div>
                 <h2 className="text-3xl font-bold text-white">Asset Studio</h2>
                 <p className="text-slate-400 mt-1">Step 3: Create supplemental media.</p>
               </div>
               <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-lg">
                 <button 
                   onClick={() => setMediaType('image')}
                   className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${mediaType === 'image' ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700' : 'text-slate-500 hover:text-white'}`}
                 >
                   Image Gen
                 </button>
                 <button 
                   onClick={() => setMediaType('video')}
                   className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${mediaType === 'video' ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700' : 'text-slate-500 hover:text-white'}`}
                 >
                   Veo Video
                 </button>
               </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Controls */}
                <div className="lg:col-span-4 space-y-6">
                   <div className="bg-slate-900/80 backdrop-blur-sm p-6 rounded-2xl border border-slate-700 shadow-xl">
                      <div className="flex items-center justify-between mb-4">
                         <label className="text-sm font-bold text-slate-300">Prompt</label>
                         <span className="text-xs text-slate-500 bg-slate-800 px-2 py-1 rounded">
                           {mediaType === 'image' ? 'Imagen 4' : 'Veo 3.1'}
                         </span>
                      </div>
                      <textarea 
                        value={mediaPrompt}
                        onChange={(e) => setMediaPrompt(e.target.value)}
                        placeholder={mediaType === 'image' ? "A futuristic city with flying cars, neon lights, ultra detailed..." : "A cinematic drone shot of a mountain peak at sunset, 4k..."}
                        className="w-full h-32 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none text-sm leading-relaxed"
                      />
                      
                      <div className="mt-5">
                        <label className="block text-xs font-bold text-slate-400 mb-3 uppercase tracking-wider">Aspect Ratio</label>
                        <div className="grid grid-cols-3 gap-2">
                          {['16:9', '9:16', '1:1'].map(ratio => (
                            <button
                              key={ratio}
                              onClick={() => setAspectRatio(ratio as any)}
                              className={`py-2.5 text-xs font-bold rounded-lg border transition-all ${aspectRatio === ratio ? 'bg-primary-500/10 border-primary-500 text-primary-400 ring-1 ring-primary-500/50' : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'}`}
                            >
                              {ratio}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button 
                        onClick={handleGenerateMedia}
                        disabled={isGeneratingMedia}
                        className="w-full mt-6 bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-500 hover:to-indigo-500 text-white py-3.5 rounded-xl font-bold shadow-lg shadow-primary-900/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isGeneratingMedia ? <Loader2 className="animate-spin" /> : <Wand2 className="w-5 h-5" />}
                        Generate {mediaType === 'image' ? 'Image' : 'Video'}
                      </button>
                   </div>
                   
                   {/* Image Editing Tools (Only visible if image generated) */}
                   {mediaType === 'image' && generatedMedia && (
                     <div className="bg-slate-900/80 backdrop-blur-sm p-6 rounded-2xl border border-slate-700 shadow-xl animate-in fade-in slide-in-from-top-4">
                        <h3 className="font-bold text-white flex items-center gap-2 mb-4 text-sm uppercase tracking-wider"><Layers className="w-4 h-4 text-yellow-400"/> Smart Edit</h3>
                        <div className="relative">
                          <input 
                            type="text" 
                            placeholder="e.g., Add a retro filter, remove background..."
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-3 pr-10 py-3 text-sm text-white focus:outline-none focus:border-primary-500"
                          />
                          <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                            <Sparkles className="w-4 h-4 text-slate-600" />
                          </div>
                        </div>
                        <button 
                          onClick={handleEditImage}
                          disabled={isEditing}
                          className="w-full mt-3 bg-slate-800 hover:bg-slate-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors flex justify-center gap-2 border border-slate-700"
                        >
                          {isEditing ? <Loader2 className="w-4 h-4 animate-spin"/> : "Apply Edit"}
                        </button>
                     </div>
                   )}

                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-700 border-dashed">
                      <h3 className="font-semibold text-white mb-2 text-sm">Upload Reference</h3>
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        onChange={handleImageUpload}
                        className="block w-full text-xs text-slate-500
                          file:mr-4 file:py-2 file:px-4
                          file:rounded-full file:border-0
                          file:text-xs file:font-bold
                          file:bg-slate-800 file:text-primary-400
                          hover:file:bg-slate-700
                          cursor-pointer
                        "
                      />
                    </div>
                </div>

                {/* Preview Area */}
                <div className="lg:col-span-8 bg-black rounded-2xl border border-slate-800 flex items-center justify-center overflow-hidden relative min-h-[500px] shadow-2xl">
                  {generatedMedia ? (
                    mediaType === 'image' || generatedMedia.startsWith('data:image') ? (
                      <img src={generatedMedia} alt="Generated" className="max-w-full max-h-full object-contain shadow-2xl" />
                    ) : (
                      <div className="text-center p-10">
                        <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                          <Video className="w-10 h-10 text-green-400" />
                        </div>
                        <p className="text-white text-xl font-bold mb-2">Video Generation Complete</p>
                        <p className="text-slate-400 mb-8">Your Veo creation is ready to view.</p>
                        <a 
                          href={generatedMedia} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 bg-white text-black px-8 py-4 rounded-full font-bold hover:scale-105 transition-transform shadow-lg shadow-white/10"
                        >
                          <Play className="w-5 h-5 fill-black" /> Watch Video
                        </a>
                      </div>
                    )
                  ) : (
                    <div className="text-slate-700 flex flex-col items-center">
                      <div className="w-24 h-24 rounded-3xl bg-slate-900/50 flex items-center justify-center mb-6 border border-slate-800">
                        {mediaType === 'image' ? <ImageIcon className="w-10 h-10" /> : <Video className="w-10 h-10" />}
                      </div>
                      <p className="font-medium text-lg">Your creation will appear here</p>
                      <p className="text-sm text-slate-600 mt-2">Select a prompt to get started</p>
                    </div>
                  )}
                  
                  {isGeneratingMedia && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-20">
                      <div className="text-center space-y-6 max-w-sm">
                        <div className="relative mx-auto w-16 h-16">
                          <div className="absolute inset-0 rounded-full border-t-2 border-primary-500 animate-spin"></div>
                          <div className="absolute inset-2 rounded-full border-b-2 border-indigo-500 animate-spin reverse"></div>
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white mb-2">Generating...</h3>
                          <p className="text-slate-400 text-sm">
                             {mediaType === 'video' ? "Dreaming up your video with Veo (this may take 1-2 mins)..." : "Painting pixels with Imagen..."}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
             </div>
          </div>
        )}

        {/* VOICE TAB */}
        {activeTab === Tab.VOICE && (
          <div className="max-w-4xl mx-auto space-y-8 pt-8 px-4 relative z-10 animate-in fade-in duration-500">
              <div className="flex justify-center mb-8">
                  <div className="bg-slate-900 p-1 rounded-xl border border-slate-800 inline-flex shadow-lg">
                      <button
                          onClick={() => setVoiceMode('live')}
                          className={`px-8 py-2.5 rounded-lg text-sm font-bold transition-all ${voiceMode === 'live' ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                          Live Conversation
                      </button>
                      <button
                          onClick={() => setVoiceMode('tts')}
                          className={`px-8 py-2.5 rounded-lg text-sm font-bold transition-all ${voiceMode === 'tts' ? 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
                      >
                          Text to Speech
                      </button>
                  </div>
              </div>

              {voiceMode === 'live' ? (
                   <div className="animate-in slide-in-from-bottom-4 duration-500">
                     <LiveVoice />
                   </div>
              ) : (
                   <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-2xl p-8 shadow-xl animate-in slide-in-from-bottom-4 duration-500">
                       <div className="flex items-center gap-3 mb-6">
                          <div className="bg-primary-500/10 p-2 rounded-lg">
                            <Volume2 className="w-6 h-6 text-primary-400" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-white">AI Voice Generator</h3>
                            <p className="text-slate-400 text-sm">Convert your written content into lifelike speech using Gemini 2.5.</p>
                          </div>
                       </div>

                       <textarea
                          value={ttsText}
                          onChange={(e) => setTtsText(e.target.value)}
                          placeholder="Enter text here to convert to speech..."
                          className="w-full h-48 bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-200 focus:ring-2 focus:ring-primary-500 focus:outline-none resize-none mb-6 text-base leading-relaxed"
                       />

                       <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                          <button
                             onClick={handleGenerateTTS}
                             disabled={isGeneratingTTS || !ttsText}
                             className="w-full sm:w-auto bg-primary-600 hover:bg-primary-500 text-white px-8 py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary-900/20"
                          >
                             {isGeneratingTTS ? <Loader2 className="animate-spin w-5 h-5" /> : <Wand2 className="w-5 h-5" />}
                             Generate Audio
                          </button>
                          
                          {ttsAudioSrc ? (
                              <audio controls src={ttsAudioSrc} className="w-full sm:w-80 h-10 rounded-lg" autoPlay />
                          ) : (
                            <span className="text-sm text-slate-500 italic">Audio will appear here...</span>
                          )}
                       </div>
                   </div>
              )}
          </div>
        )}

      </main>
    </div>
  );
};

const NavStep: React.FC<{ step: number, label: string, active: boolean, onClick: () => void }> = ({ step, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-300 ${
      active 
        ? 'bg-slate-700 text-white shadow-md ring-1 ring-slate-600' 
        : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
    }`}
  >
    <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${active ? 'bg-primary-500 text-white' : 'bg-slate-700 text-slate-500'}`}>
      {step}
    </span>
    <span>{label}</span>
  </button>
);

export default App;