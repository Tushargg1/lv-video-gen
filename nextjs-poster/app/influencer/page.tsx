'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface Scene {
  scene_index: number;
  time_range: string;
  scene_title: string;
  video_prompt: string;
}

interface ReelPlan {
  reel_title: string;
  topic: string;
  captions: {
    instagram: string;
    youtube_shorts: string;
    facebook: string;
  };
  scenes: Scene[];
}

interface ReelRecord {
  id: number;
  title: string;
  topic: string;
  caption: string;
  status: string;
  target_date: string;
  scheduled_time: string;
  clip_paths: string[];
  video_url: string;
  platforms: string[];
  is_posted: boolean;
  post_links: any;
  created_at: string;
}

function formatTime12h(timeStr: string) {
  if (!timeStr) return '19:00 (7:00 PM)';
  const parts = timeStr.split(':').map(Number);
  const h = parts[0] ?? 19;
  const m = parts[1] ?? 0;
  const hour12 = h % 12 || 12;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const minStr = String(m).padStart(2, '0');
  return `${timeStr} (${hour12}:${minStr} ${ampm})`;
}

export default function InfluencerDashboard() {
  const [reels, setReels] = useState<ReelRecord[]>([]);
  const [todaysReel, setTodaysReel] = useState<ReelRecord | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [customTopic, setCustomTopic] = useState('');
  const [pipelineStatus, setPipelineStatus] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);

  // Daily post time state
  const [dailyPostTime, setDailyPostTime] = useState('19:00');
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [isSavingTime, setIsSavingTime] = useState(false);
  const [timeSaveSuccess, setTimeSaveSuccess] = useState(false);

  // Character Reference Model & Prompt state
  const [characterPrompt, setCharacterPrompt] = useState(
    'A stunning 23-year-old AI fashion & lifestyle influencer, radiant natural skin, captivating hazel-green eyes, sleek brunette hair with subtle caramel highlights, wearing chic contemporary streetwear, minimalist jewelry, elegant confident aura, 8k photorealistic, 35mm film aesthetic'
  );
  const [referenceImage, setReferenceImage] = useState<string>('');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [promptSaveSuccess, setPromptSaveSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const savedPromptRef = useRef(characterPrompt);

  // Groq API Key state
  const [groqKey, setGroqKey] = useState('');
  const [hasGroqKey, setHasGroqKey] = useState(false);
  const [isEditingGroqKey, setIsEditingGroqKey] = useState(false);
  const [isSavingGroqKey, setIsSavingGroqKey] = useState(false);
  const [groqSaveSuccess, setGroqSaveSuccess] = useState(false);

  // Real-time Pipeline Logs & Activity State
  const [liveLogs, setLiveLogs] = useState<{ id: string | number; time: string; message: string; level: string }[]>([]);
  const [activePlan, setActivePlan] = useState<ReelPlan | null>(null);
  const [extensionStatus, setExtensionStatus] = useState<{
    isActive: boolean;
    lastPingSecondsAgo: number | null;
    lastPingTime: string | null;
  } | null>(null);
  const [showPromptDetails, setShowPromptDetails] = useState(true);
  const [completedClips, setCompletedClips] = useState<number[]>([]);
  const [selectedClipIndex, setSelectedClipIndex] = useState<number>(1);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const fetchConfig = async () => {
    try {
      const res = await fetch('http://localhost:3005/api/influencer/config');
      if (res.ok) {
        const data = await res.json();
        if (data.config) {
          if (data.config.daily_post_time) {
            setDailyPostTime(data.config.daily_post_time);
            localStorage.setItem('influencer_post_time', data.config.daily_post_time);
          }
          if (data.config.character_prompt) {
            setCharacterPrompt(data.config.character_prompt);
            savedPromptRef.current = data.config.character_prompt;
            localStorage.setItem('influencer_character_prompt', data.config.character_prompt);
          }
          if (data.config.reference_image_base64) {
            setReferenceImage(data.config.reference_image_base64);
          }
          if (data.config.groq_api_key || data.config.has_groq_key) {
            setHasGroqKey(true);
            if (data.config.groq_api_key) setGroqKey(data.config.groq_api_key);
          }
        }
      }
    } catch (e) {
      const savedTime = localStorage.getItem('influencer_post_time');
      if (savedTime) setDailyPostTime(savedTime);
      const savedPrompt = localStorage.getItem('influencer_character_prompt');
      if (savedPrompt) {
        setCharacterPrompt(savedPrompt);
        savedPromptRef.current = savedPrompt;
      }
      const savedGroq = localStorage.getItem('influencer_groq_key');
      if (savedGroq) {
        setGroqKey(savedGroq);
        setHasGroqKey(true);
      }
    }
  };

  useEffect(() => {
    fetchConfig();
    const savedTopic = localStorage.getItem('influencer_topic');
    if (savedTopic) setCustomTopic(savedTopic);
  }, []);

  const handleSaveGroqKey = async () => {
    if (!groqKey.trim()) return;
    setIsSavingGroqKey(true);
    localStorage.setItem('influencer_groq_key', groqKey.trim());
    try {
      const ports = [3005, 3001];
      for (const port of ports) {
        try {
          await fetch(`http://localhost:${port}/api/influencer/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ groq_api_key: groqKey.trim() })
          });
        } catch (e) {}
      }
      setHasGroqKey(true);
      setGroqSaveSuccess(true);
      setTimeout(() => setGroqSaveSuccess(false), 3000);
      setIsEditingGroqKey(false);
    } catch (err) {
      console.error('Failed to save Groq key:', err);
    } finally {
      setIsSavingGroqKey(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setReferenceImage(base64);

      try {
        const ports = [3005, 3001];
        for (const port of ports) {
          try {
            await fetch(`http://localhost:${port}/api/influencer/config`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reference_image_base64: base64 })
            });
          } catch (err) {}
        }
      } catch (err) {
        console.error('Failed to sync reference image:', err);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = async () => {
    setReferenceImage('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    try {
      const ports = [3005, 3001];
      for (const port of ports) {
        try {
          await fetch(`http://localhost:${port}/api/influencer/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ remove_reference_image: true })
          });
        } catch (err) {}
      }
    } catch (err) {}
  };

  const handleSavePrompt = async () => {
    if (!characterPrompt.trim()) return;
    setIsSavingPrompt(true);
    savedPromptRef.current = characterPrompt;
    localStorage.setItem('influencer_character_prompt', characterPrompt);
    try {
      const ports = [3005, 3001];
      for (const port of ports) {
        try {
          await fetch(`http://localhost:${port}/api/influencer/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ character_prompt: characterPrompt.trim() })
          });
        } catch (err) {}
      }
      await fetch('/api/influencer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_config', character_prompt: characterPrompt.trim() })
      }).catch(() => {});
      setPromptSaveSuccess(true);
      setTimeout(() => setPromptSaveSuccess(false), 3000);
      setIsEditingPrompt(false);
    } catch (err) {
      console.error('Failed to save character prompt:', err);
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleSaveTime = async (newTime: string) => {
    if (!newTime) return;
    setIsSavingTime(true);
    setDailyPostTime(newTime);
    localStorage.setItem('influencer_post_time', newTime);
    try {
      const ports = [3005, 3001];
      for (const port of ports) {
        try {
          await fetch(`http://localhost:${port}/api/influencer/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ daily_post_time: newTime })
          });
        } catch (e) {}
      }
      await fetch('/api/influencer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_time', daily_post_time: newTime })
      }).catch(() => {});

      setTimeSaveSuccess(true);
      setTimeout(() => setTimeSaveSuccess(false), 3000);
      setIsEditingTime(false);
    } catch (err) {
      console.error('Failed to update time:', err);
    } finally {
      setIsSavingTime(false);
    }
  };

  const handleTopicChange = (val: string) => {
    setCustomTopic(val);
    localStorage.setItem('influencer_topic', val);
  };

  const fetchReels = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/influencer');
      if (res.ok) {
        const data = await res.json();
        setReels(data.reels || []);
        setTodaysReel(data.todaysReel || null);
      }
    } catch (e) {
      console.error('Failed to fetch reels:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const checkLocalServer = async () => {
    const ports = [3005, 3001];
    let foundOnline = false;
    for (const port of ports) {
      try {
        const res = await fetch(`http://localhost:${port}/api/influencer/status`);
        if (res.ok) {
          const data = await res.json();
          setServerOnline(true);
          foundOnline = true;
          setPipelineStatus(data.status);
          if (data.extension) setExtensionStatus(data.extension);
          if (data.plan) setActivePlan(data.plan);
          if (data.completedClips && Array.isArray(data.completedClips)) {
            setCompletedClips(data.completedClips);
          }
          if (data.logs && Array.isArray(data.logs)) {
            setLiveLogs(data.logs);
          }
          if (data.isRunning) {
            setIsGenerating(true);
            setStatusMessage(data.status?.message || 'Generating 50s reel...');
            if (data.status?.customTopic && !customTopic) {
              setCustomTopic(data.status.customTopic);
              localStorage.setItem('influencer_topic', data.status.customTopic);
            }
          } else if (isGenerating) {
            setIsGenerating(false);
            fetchReels();
          }
          break;
        }
      } catch (e) {}
    }
    if (!foundOnline) {
      setServerOnline(false);
    }
  };

  useEffect(() => {
    fetchReels();
    checkLocalServer();
    const intervalTime = isGenerating ? 1000 : 3000;
    const interval = setInterval(() => {
      checkLocalServer();
    }, intervalTime);
    return () => clearInterval(interval);
  }, [isGenerating]);

  // Auto-scroll terminal logs to bottom
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [liveLogs]);

  const handleResetPipeline = async () => {
    try {
      await fetch('http://localhost:3005/api/influencer/reset', { method: 'POST' });
      await fetch('http://localhost:3005/api/job', { method: 'DELETE' }).catch(() => {});
      await fetch('http://localhost:3005/api/result', { method: 'DELETE' }).catch(() => {});
      setIsGenerating(false);
      setPipelineStatus(null);
      setStatusMessage('⏹ Generation stopped by user. Ready.');
    } catch (e) {
      setIsGenerating(false);
      setStatusMessage('⏹ Generation stopped.');
    }
  };

  const handleTriggerGeneration = async (forceNew: boolean = false) => {
    setIsGenerating(true);
    setStatusMessage(forceNew ? '⚡ Groq 120B planning brand new 50s reel script...' : '🚀 Generating / Resuming clips from saved storyboard...');
    const ports = [3005, 3001];
    let started = false;
    for (const port of ports) {
      try {
        const res = await fetch(`http://localhost:${port}/api/influencer/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            customTopic: customTopic.trim() || null,
            forceNewPlan: forceNew
          })
        });
        if (res.ok) {
          setStatusMessage('🚀 Generation started! The extension will generate 5 x 10s clips, merge them into 50s, and auto-schedule.');
          started = true;
          break;
        }
      } catch (err) {}
    }
    if (!started) {
      setStatusMessage('❌ Could not connect to local server on port 3005 or 3001. Please make sure the bridge server is running.');
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 sm:p-10">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Navigation & Header */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-2xl">✨</span>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                AI Influencer Studio
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                1 Reel Daily • 50 Seconds
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Autonomous 5-clip (10s each) generation, seamless 50s video stitching, and scheduled auto-posting.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <Link
              href="/"
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-colors"
            >
              ← Back to Dashboard
            </Link>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border ${
              serverOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
            }`}>
              <span className={`w-2 h-2 rounded-full ${serverOnline ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              {serverOnline ? 'Bridge Server Online' : 'Bridge Offline (Port 3005 / 3001)'}
            </div>
          </div>
        </div>

        {/* Creator Profile & Status Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            
            {/* Header info */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-100">
              <div className="flex items-center gap-4">
                {/* Reference Model Photo Avatar */}
                <div className="relative group flex-shrink-0">
                  {referenceImage ? (
                    <div className="relative">
                      <img
                        src={referenceImage}
                        alt="AI Influencer Model"
                        className="w-20 h-20 rounded-xl object-cover border border-slate-300 shadow-sm"
                      />
                      <div className="absolute inset-0 bg-black/60 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-[10px] text-white font-bold p-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="hover:underline"
                        >
                          📷 Change
                        </button>
                        <button
                          type="button"
                          onClick={handleRemoveImage}
                          className="text-red-300 hover:underline"
                        >
                          ✕ Remove
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      title="Upload reference model photo for visual consistency across all 5 clips"
                      className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center text-center p-2 transition-all cursor-pointer group"
                    >
                      <span className="text-xl mb-0.5">📷</span>
                      <span className="text-[10px] text-slate-600 font-semibold leading-tight">
                        + Add Model Photo
                      </span>
                    </button>
                  )}
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>

                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Virtual Creator Profile</span>
                    {referenceImage ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                        ✓ Photo Active
                      </span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                        No Photo Attached
                      </span>
                    )}
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mt-0.5">Aria Vance</h2>
                  <p className="text-xs text-slate-500">Niche: Luxury Streetwear, Aesthetic Lifestyle & City Life</p>
                </div>
              </div>

              {/* Controls: AI Engine & Daily Post Time */}
              <div className="flex flex-col items-end gap-2">
                {/* Groq / AI Engine Pill */}
                {!isEditingGroqKey ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsEditingGroqKey(true)}
                      title="Click to configure Groq API Key"
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                    >
                      <span>⚡</span>
                      <span>
                        AI Engine: <strong className="text-slate-900 font-bold ml-0.5">{hasGroqKey ? 'Groq Flagship 120B (Active)' : 'Gemini Flash'}</strong>
                      </span>
                      <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-700 ml-1">
                        {hasGroqKey ? 'Edit' : '+ Connect Key'}
                      </span>
                    </button>
                    {groqSaveSuccess && (
                      <span className="text-xs text-emerald-600 font-bold">
                        ✓ Saved!
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-white border border-slate-300 rounded-xl shadow-lg flex flex-col sm:flex-row items-center gap-2 z-20">
                    <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                      <span>⚡</span> Groq Key:
                    </span>
                    <input
                      type="password"
                      placeholder="gsk_..."
                      value={groqKey}
                      onChange={(e) => setGroqKey(e.target.value)}
                      className="px-2.5 py-1 bg-white border border-slate-300 text-xs font-mono text-slate-900 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
                    />
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleSaveGroqKey}
                        disabled={isSavingGroqKey}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {isSavingGroqKey ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setIsEditingGroqKey(false)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-lg cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}

                {/* Daily Post Time Selector */}
                {!isEditingTime ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditingTime(true)}
                      title="Click to select or change daily post time"
                      className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 transition-colors cursor-pointer"
                    >
                      <span>🕒 Daily Post: <strong className="text-slate-900 font-bold ml-1">{formatTime12h(dailyPostTime)}</strong></span>
                      <span className="text-[10px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-700">
                        Change
                      </span>
                    </button>
                    {timeSaveSuccess && (
                      <span className="text-xs text-emerald-600 font-bold">
                        ✓ Saved!
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-white border border-slate-300 rounded-xl shadow-lg flex flex-col sm:flex-row items-center gap-2 z-10">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-700">🕒 Set Time:</span>
                      <input
                        type="time"
                        value={dailyPostTime}
                        onChange={(e) => setDailyPostTime(e.target.value)}
                        className="px-2.5 py-1 bg-white border border-slate-300 text-xs font-bold text-slate-900 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      {['12:00', '18:00', '19:00', '20:30', '21:00'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setDailyPostTime(preset)}
                          className={`px-2 py-0.5 text-[10px] rounded transition-colors ${
                            dailyPostTime === preset
                              ? 'bg-blue-600 text-white font-bold'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSaveTime(dailyPostTime)}
                        disabled={isSavingTime}
                        className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                      >
                        {isSavingTime ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => setIsEditingTime(false)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs rounded-lg cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Character Reference Prompt Card */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🎨</span> Character Reference Prompt (Identity)
                  </span>
                  {promptSaveSuccess && (
                    <span className="text-[10px] text-emerald-600 font-bold">
                      ✓ Saved!
                    </span>
                  )}
                </div>

                {!isEditingPrompt ? (
                  <button
                    onClick={() => setIsEditingPrompt(true)}
                    className="text-xs px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    ✏️ Edit Prompt
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={handleSavePrompt}
                      disabled={isSavingPrompt}
                      className="text-xs px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm cursor-pointer disabled:opacity-50"
                    >
                      {isSavingPrompt ? 'Saving...' : 'Save Prompt'}
                    </button>
                    <button
                      onClick={() => {
                        setIsEditingPrompt(false);
                        setCharacterPrompt(savedPromptRef.current);
                      }}
                      className="text-xs px-2.5 py-1 rounded-md bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              {!isEditingPrompt ? (
                <div>
                  <p className="text-xs text-slate-700 leading-relaxed italic">
                    "{characterPrompt}"
                  </p>
                  <p className="text-[11px] text-slate-500 mt-2 flex items-center gap-1">
                    <span>✨</span>
                    <span>
                      <strong>Composition:</strong> Each 10s clip combines:
                      <span className="text-blue-700 font-mono ml-1">[Reference Photo]</span> +
                      <span className="text-slate-700 font-mono ml-1">[Identity Prompt]</span> +
                      <span className="text-slate-700 font-mono ml-1">[10s Story Script]</span>
                    </span>
                  </p>
                </div>
              ) : (
                <div className="space-y-2 pt-1">
                  <textarea
                    rows={3}
                    value={characterPrompt}
                    onChange={(e) => setCharacterPrompt(e.target.value)}
                    placeholder="Describe character appearance, age, face, hair, eyes, styling, lighting, aesthetic..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 leading-relaxed"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-500 mr-1">Quick Add:</span>
                    {[
                      '8k photorealistic',
                      'cinematic volumetric lighting',
                      '35mm film aesthetic',
                      'hazel-green eyes',
                      'luxury streetwear',
                      'dewy radiant skin'
                    ].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          if (!characterPrompt.includes(tag)) {
                            setCharacterPrompt((prev) => (prev ? `${prev}, ${tag}` : tag));
                          }
                        }}
                        className="px-2 py-0.5 text-[10px] rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-colors"
                      >
                        + {tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Topic Input & Trigger Controls */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <input
                type="text"
                placeholder="Optional topic/theme (e.g. Neon twilight rooftop walk)..."
                value={customTopic}
                onChange={(e) => handleTopicChange(e.target.value)}
                className="w-full sm:flex-1 px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              
              {isGenerating ? (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="flex-1 sm:flex-initial px-4 py-2.5 rounded-lg font-semibold text-xs bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 animate-spin text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <circle cx="12" cy="12" r="10" strokeWidth="4" className="opacity-25" />
                      <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" className="opacity-75" />
                    </svg>
                    Generating 50s Reel...
                  </div>
                  <button
                    onClick={handleResetPipeline}
                    title="Stop generation immediately"
                    className="px-4 py-2.5 rounded-lg font-semibold text-xs bg-red-600 hover:bg-red-700 active:scale-95 text-white shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                  >
                    <span>⏹</span>
                    Stop Generation
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => handleTriggerGeneration(false)}
                    disabled={!serverOnline}
                    className="flex-1 sm:flex-initial px-5 py-2.5 rounded-lg font-semibold text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span>⚡</span>
                    {activePlan ? (completedClips.length > 0 ? `Continue Making Clips (${completedClips.length}/5 Saved)` : "Make All 5 Clips (Saved Plan)") : "Generate Today's 50s Reel"}
                  </button>
                  <button
                    onClick={() => handleTriggerGeneration(true)}
                    disabled={!serverOnline}
                    title="Plan a brand new 5-clip storyboard with Groq 120B Flagship"
                    className="px-4 py-2.5 rounded-lg font-medium text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span>✨</span>
                    New Story Idea
                  </button>
                </div>
              )}
            </div>

            {!isGenerating && statusMessage && (
              <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs text-slate-700">
                {statusMessage}
              </div>
            )}
          </div>

          {/* Today's Status Card */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Today's Reel Status</span>
              <div className="mt-3">
                {todaysReel ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {todaysReel.status || 'SCHEDULED'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 line-clamp-2">
                      {todaysReel.title}
                    </p>
                    <div className="text-xs text-slate-500 space-y-1">
                      <div>⏰ Scheduled: <span className="text-slate-800 font-medium">{new Date(todaysReel.scheduled_time).toLocaleTimeString()}</span></div>
                      <div>⏱️ Total Duration: <span className="text-slate-800 font-medium">50 Seconds (5 x 10s)</span></div>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 text-center text-slate-400">
                    <span className="text-3xl block mb-2">⏳</span>
                    <p className="text-xs font-medium text-slate-600">No reel scheduled yet today.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Autonomous scheduler will generate 1 reel for the set time, or trigger manually.</p>
                  </div>
                )}
              </div>
            </div>

            {todaysReel?.video_url && (
              <a
                href={todaysReel.video_url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block w-full text-center py-2 px-3 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition-colors"
              >
                Watch 50s Video Preview ↗
              </a>
            )}
          </div>
        </div>

        {/* Live Real-Time Production Control Room */}
        {(isGenerating || liveLogs.length > 0 || activePlan) && (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
            
            {/* Top Control Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <span className={`w-3 h-3 rounded-full ${isGenerating ? 'bg-blue-600 animate-ping' : 'bg-slate-400'}`} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900 text-sm">
                      {isGenerating ? '🔴 LIVE PIPELINE IN PROGRESS' : 'SAVED STORYBOARD ARCHIVE'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                      {activePlan?.reel_title || customTopic || pipelineStatus?.customTopic || "Today's Theme"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    5 sequential 10s clips (50s total) → Stitch with FFmpeg into 1080x1920 vertical reel
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Extension Status Pill */}
                <div className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 ${
                  extensionStatus?.isActive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${extensionStatus?.isActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span>
                    Extension: {extensionStatus?.isActive ? `Active (Pinged ${extensionStatus.lastPingSecondsAgo || 0}s ago)` : 'Waiting for Edge/Google Flow'}
                  </span>
                </div>

                {/* Timer Badge */}
                {isGenerating && (
                  <div className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-slate-100 text-slate-800 border border-slate-200 flex items-center gap-1">
                    <span>⏱️</span>
                    <span>{pipelineStatus?.timeFormatted || (pipelineStatus?.elapsedSeconds ? `${pipelineStatus.elapsedSeconds}s` : 'Active')}</span>
                  </div>
                )}

                {isGenerating && (
                  <button
                    onClick={handleResetPipeline}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition-colors cursor-pointer"
                  >
                    ⏹ Stop
                  </button>
                )}
              </div>
            </div>

            {/* Storyboard Status Notice */}
            {activePlan && (
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2.5">
                <span className="text-base leading-none mt-0.5">💡</span>
                <div className="flex-1">
                  <strong className="font-semibold">Storyboard Locked & Preserved:</strong> All 5 scene prompts for this reel idea are saved in <code className="bg-white/80 px-1 py-0.5 rounded font-mono text-[11px] text-blue-800">plan.json</code>. Prompts are never regenerated on each clip. Clicking <strong>"Make All 5 Clips"</strong> generates only missing clips sequentially until all 5 exist on disk, then automatically stitches them with FFmpeg into your final 50s reel.
                </div>
              </div>
            )}

            {/* 5-Clip Sequential Visual Progress Stepper */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span>🎬 5-Clip Reel Architecture (Click any clip to view saved prompt)</span>
                <span className="text-blue-600 font-bold">
                  {completedClips.length === 5 ? 'All 5 Clips Saved on Disk!' : (pipelineStatus?.currentClip ? `Generating Clip ${pipelineStatus.currentClip} of 5` : `${completedClips.length}/5 Clips Saved`)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {[
                  { index: 1, range: '0-10s', title: 'The Hook' },
                  { index: 2, range: '10-20s', title: 'Progression & Movement' },
                  { index: 3, range: '20-30s', title: 'Detail Showcase' },
                  { index: 4, range: '30-40s', title: 'Atmosphere & Transition' },
                  { index: 5, range: '40-50s', title: 'Outro & Final Pose' }
                ].map((step) => {
                  const cur = pipelineStatus?.currentClip || 0;
                  const isCur = isGenerating && cur === step.index;
                  const isSavedOnDisk = completedClips.includes(step.index);
                  const isDone = isSavedOnDisk || (cur > step.index) || pipelineStatus?.step === 'concatenating' || pipelineStatus?.step === 'completed';
                  const isSelected = selectedClipIndex === step.index;

                  return (
                    <div
                      key={step.index}
                      onClick={() => setSelectedClipIndex(step.index)}
                      className={`p-3 rounded-xl border transition-all cursor-pointer relative ${
                        isSelected ? 'ring-2 ring-blue-600 shadow-sm' : ''
                      } ${
                        isCur
                          ? 'bg-blue-50/80 border-blue-500'
                          : isSavedOnDisk
                          ? 'bg-emerald-50/70 border-emerald-300'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          isCur
                            ? 'bg-blue-600 text-white'
                            : isSavedOnDisk
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}>
                          Clip {step.index}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">{step.range}</span>
                      </div>

                      <div className="text-xs font-bold text-slate-900 truncate">
                        {activePlan?.scenes?.[step.index - 1]?.scene_title || step.title}
                      </div>

                      <div className="mt-1.5 flex items-center gap-1 text-[11px]">
                        {isCur ? (
                          <span className="text-blue-700 font-bold flex items-center gap-1 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-ping" />
                            Generating ({pipelineStatus?.timeFormatted || '0s'})
                          </span>
                        ) : isSavedOnDisk ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                            ✓ Saved to Disk
                          </span>
                        ) : isDone ? (
                          <span className="text-emerald-700 font-semibold flex items-center gap-0.5">
                            ✓ Complete
                          </span>
                        ) : (
                          <span className="text-slate-400">⏳ Saved in Plan</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Saved Storyboard Prompt Inspector (Inspect any clip) */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <span>🎯</span> Clip {selectedClipIndex}/5 Prompt: <strong className="text-blue-700 font-semibold ml-1">"{activePlan?.scenes?.[selectedClipIndex - 1]?.scene_title || 'Scene ' + selectedClipIndex}"</strong>
                  </span>
                  {completedClips.includes(selectedClipIndex) && (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                      ✓ MP4 Saved on Disk
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedClipIndex(idx)}
                      className={`px-2.5 py-1 text-[11px] rounded font-semibold transition-colors ${
                        selectedClipIndex === idx
                          ? 'bg-blue-600 text-white shadow-sm'
                          : completedClips.includes(idx)
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      Clip {idx} {completedClips.includes(idx) ? '✓' : ''}
                    </button>
                  ))}
                  <button
                    onClick={() => setShowPromptDetails(!showPromptDetails)}
                    className="ml-2 text-xs text-blue-600 hover:underline cursor-pointer"
                  >
                    {showPromptDetails ? 'Hide' : 'Expand'}
                  </button>
                </div>
              </div>

              {showPromptDetails && (
                <div className="p-3.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-800 font-sans leading-relaxed shadow-sm">
                  {activePlan?.scenes?.[selectedClipIndex - 1]?.video_prompt ||
                    (selectedClipIndex === (pipelineStatus?.currentClip || 1) ? pipelineStatus?.currentPrompt : null) ||
                    (isGenerating ? 'Generating script with Groq 120B Flagship...' : 'Click "Make All 5 Clips" or enter an idea to generate all 5 prompts.')}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span>Prompt Pipeline:</span>
                  <span className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 font-mono text-[10px]">
                    [Model Photo: {referenceImage ? 'Active' : 'Default'}]
                  </span>
                  <span>+</span>
                  <span className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 font-mono text-[10px]">
                    [Identity Prompt]
                  </span>
                  <span>+</span>
                  <span className="px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 font-mono text-[10px]">
                    [10s Scene Prompt]
                  </span>
                </div>

                <span className="text-[10px] text-slate-400">
                  {activePlan?.engine ? `Generated via ${activePlan.engine}` : 'Groq 120B Flagship'}
                </span>
              </div>
            </div>

            {/* Live Terminal & Event Console */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
                <span className="flex items-center gap-1.5">
                  <span>💻</span> Live Automation Console & Extension Events ({liveLogs.length} events)
                </span>
                <span className="text-[11px] text-emerald-600 font-mono">● Live Feed</span>
              </div>

              <div
                ref={logsContainerRef}
                className="max-h-48 overflow-y-auto font-mono text-[11px] bg-slate-900 text-slate-100 p-3.5 rounded-xl border border-slate-800 space-y-1 shadow-inner"
              >
                {liveLogs.length === 0 ? (
                  <div className="text-slate-500 py-2 text-center font-sans">No events logged yet. Triggering generation will stream events here.</div>
                ) : (
                  liveLogs.map((log, idx) => (
                    <div key={log.id || idx} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-slate-500 select-none flex-shrink-0">[{log.time}]</span>
                      <span className={`break-words flex-1 ${
                        log.level === 'error' ? 'text-red-400 font-bold' :
                        log.level === 'warn' ? 'text-amber-400' :
                        log.level === 'success' ? 'text-emerald-400 font-semibold' :
                        log.level === 'action' ? 'text-cyan-300' :
                        'text-slate-300'
                      }`}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Simple Helper Box */}
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
              <span className="text-base flex-shrink-0">💡</span>
              <div className="space-y-0.5">
                <p className="font-bold text-blue-950">How the automation works:</p>
                <p className="text-blue-800 leading-relaxed text-[11px]">
                  The local bridge server sends each clip prompt to Microsoft Edge via the Digen extension. The extension generates the 1080p clip on <code>flow.google.com</code> and downloads it. When finished, FFmpeg concatenates all 5 clips into one 50s reel and schedules your daily post!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 5-Clip Sequential Architecture Explanation */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎞️</span>
            <h3 className="text-sm font-bold text-slate-900">
              5-Clip Sequential Reel Architecture (50 Seconds Total)
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { num: 1, time: '0-10s', title: 'The Hook', desc: 'Arresting visual entrance & scroll-stopping eye contact' },
              { num: 2, time: '10-20s', title: 'Progression', desc: 'Dynamic camera tracking shot moving through city aesthetic' },
              { num: 3, time: '20-30s', title: 'Showcase', desc: 'Medium close-up detail highlight of outfit & styling' },
              { num: 4, time: '30-40s', title: 'Atmosphere', desc: 'Cinematic 360 orbital dolly shot with sunset/neon glows' },
              { num: 5, time: '40-50s', title: 'Outro & CTA', desc: 'Direct camera smile, iconic hero pose & sign-off' },
            ].map((step) => (
              <div key={step.num} className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="w-5 h-5 rounded bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center border border-blue-200">
                    {step.num}
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-slate-500">{step.time}</span>
                </div>
                <h4 className="text-xs font-bold text-slate-900">{step.title}</h4>
                <p className="text-[11px] text-slate-500 mt-1 leading-snug">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Past Reels History */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>📅</span> Past 50-Second Influencer Reels
            </h3>
            <button
              onClick={fetchReels}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors cursor-pointer"
            >
              ↻ Refresh
            </button>
          </div>

          {reels.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">
              No reels generated yet. Once generated, they will appear here with video previews and posting links.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {reels.map((reel) => (
                <div
                  key={reel.id}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 transition-all space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-500">{reel.target_date}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                        reel.status === 'posted' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-blue-50 text-blue-700 border border-blue-200'
                      }`}>
                        {reel.status}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{reel.title}</h4>
                    <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">{reel.caption}</p>
                  </div>

                  {reel.video_url && (
                    <div className="pt-2 border-t border-slate-200 space-y-2">
                      <video
                        src={reel.video_url}
                        controls
                        playsInline
                        preload="metadata"
                        className="w-full h-44 object-cover rounded-lg bg-black"
                      />
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>Duration: 50s</span>
                        <a
                          href={reel.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          Open Raw MP4 ↗
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
