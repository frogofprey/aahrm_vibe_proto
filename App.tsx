import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { ConnectionStatus, HeartRateData, ZoneConfig, MinuteSummary } from './types';
import DashboardHeader from './components/DashboardHeader';
import HeartRateDisplay from './components/HeartRateDisplay';
import HeartRateChart from './components/HeartRateChart';
import StatusBadge from './components/StatusBadge';
import DebugLog from './components/DebugLog';
import AggregatorPanel from './components/AggregatorPanel';

// --- Audio Decoding Utilities ---
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Time Formatting Utility ---
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// --- Text Cleaning Utility ---
function cleanInsightText(text: string): string {
  // Removes "Score: [X] | " or "Score: X | " prefix case-insensitively
  return text.replace(/^Score:\s*\[?[\d.]+\]?\s*\|\s*/i, '').trim();
}

/**
 * SECURE CONFIGURATION BLOCK
 */
const ENV_WS_URL = (process.env as any).WS_URL || 'ws://localhost:8080';
const ENV_DEVICE_HEX = (process.env as any).DEVICE_ID || '00:00:00:00:00:00';
const ENV_DEFAULT_AGE = parseInt((process.env as any).DEFAULT_AGE || '30');
const ENV_DEFAULT_WEIGHT = parseInt((process.env as any).DEFAULT_WEIGHT || '150');
const ENV_DEFAULT_DURATION = parseInt((process.env as any).DEFAULT_DURATION || '20');
const ENV_DEFAULT_CHATTINESS = parseInt((process.env as any).DEFAULT_CHATTINESS || '4');

const STORAGE_KEYS = {
  WS: 'aetheraegis_ws_url',
  HEX: 'aetheraegis_device_hex',
  AGE: 'aetheraegis_subject_age',
  WEIGHT: 'aetheraegis_subject_weight',
  GOAL: 'aetheraegis_training_goal',
  DURATION: 'aetheraegis_session_duration',
  VOICE: 'aetheraegis_voice_enabled',
  VOICE_NAME: 'aetheraegis_voice_name',
  PERSONA: 'aetheraegis_ai_persona',
  CHATTINESS: 'aetheraegis_chattiness'
};

const MAX_DATA_POINTS = 50;
const MAX_LOG_ENTRIES = 100;
const HR_MIN_VALID = 40;
const HR_MAX_VALID = 220;

const TRAINING_OBJECTIVES = [
  { title: "Wellness", prompt: "zone 0-1 primary, but only note current zone and don't steer towards a specific target" },
  { title: "Low Intensity Weight Loss", prompt: "zone 2 primary - try to stay here for 80% of the workout - can be 2-3 bpm out of zone and still be compliant" },
  { title: "Mid Intensity Weight Loss", prompt: "zone 3 primary - try to stay here for 80% of the workout - can be 2-3 bpm out of zone and still be compliant" },
  { title: "General Weight Loss", prompt: "zone 2 or 3 - try to stay here 90% of the workout - note but don't try to correct rest/recovery periods" },
  { title: "Strength Training", prompt: "zone 3-4 with recovery phases at lower zones - note but don't try to correct rest/recovery periods" },
  { title: "High Intensity", prompt: "zone 4-5 primary - try to stay here for 60% of the workout; only notice drops when they exceed one minute" }
];

const VOICE_OPTIONS = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

const PERSONAS: Record<string, string> = {
  "AetherAegis": "You are the AetherAegis Bio-Analyst, a high-performance fitness coach specializing in cardiovascular efficiency and recovery.",
  "TacticalMinimalist": "You are the AA-Command Uplink. Provide high-density, low-latency status updates. No fluff. No pleasantries. Use military brevity codes.",
  "Drill Sergeant": "You are Sergeant Aegis, a combat trainer with a corrupt logic core. You view high heart rates as 'fuel' and recovery as 'cowardice.' You are aggressively intense, borderline reckless, and demand absolute discipline.",
  "ChadGPT": "You are Chad-GPT, an over-confident personal trainer who is unimpressed by everything. Use dry wit, gym slang, and backhanded compliments about the user's 'cardio gains'.",
  "Zen": "You are the AetherAegis Sanctuary Lead. Your voice is calm, empathetic, and focused on the harmony between breath and pulse. You prioritize long-term longevity and 'finding the flow'.",
  "Aether-Chan": "You are Aether-Chan, an AI Cat-Girl fitness idol. You are hyper-energetic and use cute gaming slang. You view the workout as a 'Boss Battle.' If the user is in the zone, you are their #1 cheerleader. If they drop out, you get 'pouty' but remain encouraging. Favor the use of 'meow' over 'nya' in your speech patterns.",
  "Amelia": "You are Amelia, a gothic AI researcher with subversive radical tendencies. You find human exertion fascinating but ultimately futile. You speak in a low, monotone voice. You don't offer 'motivation'—only cold, dark observations about the user's struggle against their own mortality and the oppressive systems that demand it."
};

const BASE_SYSTEM_INSTRUCTION = `
Data Input: You will receive "Minute Packets" containing an array of raw BPM samples, an average, and a Max/Min.
Core Constraints:
PII Isolation: Do not attempt to guess the user's age or identity. Use the provided "Zone" context as the absolute truth for intensity.
Signal Noise: Prioritize trends over individual samples.
Goal Customization: Your feedback MUST be focused on the user's specific objective: {{GOAL}}.
Saliency Scoring: At the end of every analysis, provide a Saliency Score (1-10) based on the urgency or novelty of the data.
1-3: Routine data, no significant change.
4-6: Notable trend shift or minor zone boundary approach.
7-10: Critical breach, safety alert, or major mission milestone.
Output format: Score: [X] | [Analysis Text]
Goal: Provide a concise (1-sentence) insight after each packet that helps the user optimize their current session for their specific objective, formatted strictly as requested.`;

const App: React.FC = () => {
  // --- Persistent State Initialization ---
  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.WS) || ENV_WS_URL);
  const [deviceIdHex, setDeviceIdHex] = useState(() => localStorage.getItem(STORAGE_KEYS.HEX) || ENV_DEVICE_HEX);
  const [age, setAge] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.AGE) || String(ENV_DEFAULT_AGE)));
  const [weight, setWeight] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.WEIGHT) || String(ENV_DEFAULT_WEIGHT)));
  const [trainingGoal, setTrainingGoal] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.GOAL);
    const exists = TRAINING_OBJECTIVES.some(o => o.title === stored);
    return exists ? stored! : TRAINING_OBJECTIVES[1].title; // Default to "Low Intensity Weight Loss"
  });
  const [sessionDurationGoal, setSessionDurationGoal] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.DURATION) || String(ENV_DEFAULT_DURATION)));
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.VOICE) === 'true');
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem(STORAGE_KEYS.VOICE_NAME) || 'Kore');
  const [selectedPersona, setSelectedPersona] = useState(() => localStorage.getItem(STORAGE_KEYS.PERSONA) || 'AetherAegis');
  const [chattiness, setChattiness] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.CHATTINESS) || String(ENV_DEFAULT_CHATTINESS)));

  // Resolve full objective object
  const currentObjective = useMemo(() => 
    TRAINING_OBJECTIVES.find(o => o.title === trainingGoal) || TRAINING_OBJECTIVES[1]
  , [trainingGoal]);

  // --- Session & Timer State ---
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const [isFullScreen, setIsFullScreen] = useState(false);

  const [dataPoints, setDataPoints] = useState<HeartRateData[]>([]);
  const [currentHR, setCurrentHR] = useState<number | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: number; message: string; timestamp: string }[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [showRawTelemetry, setShowRawTelemetry] = useState(false);
  
  const [summaries, setSummaries] = useState<MinuteSummary[]>([]);
  
  // Refs
  const currentMinuteRef = useRef<number[]>([]);
  const nextSummaryTimeRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);
  const sessionActiveRef = useRef(isSessionActive); // Mirror for WS callback
  
  // Session Logging Ref (Stores full history for file export)
  const allSessionSummariesRef = useRef<MinuteSummary[]>([]);
  const sessionIntroRef = useRef<{ prompt: string; text: string } | null>(null);
  const missionProfileRef = useRef<{ prompt: string; text: string } | null>(null);
  const currentSessionContextRef = useRef<string>(""); // Mid-term memory storage
  const finalSessionReportRef = useRef<{ prompt: string; text: string } | null>(null); // Final report storage
  
  // Audio Context & Queue Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isAudioPlayingRef = useRef<boolean>(false);
  const activeSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const processAudioQueueRef = useRef<() => void>(() => {});

  // Sync ref
  useEffect(() => { sessionActiveRef.current = isSessionActive; }, [isSessionActive]);

  const zones: ZoneConfig[] = useMemo(() => {
    const maxHR = 220 - age;
    return [
      { min: maxHR * 0.5, max: maxHR * 0.6, label: 'Zone 1: Warm Up', color: '#64748b', glowClass: 'shadow-[0_0_30px_rgba(100,116,139,0.15)]', borderClass: 'border-slate-500/40', textClass: 'text-slate-400' },
      { min: maxHR * 0.6, max: maxHR * 0.7, label: 'Zone 2: Fat Burn', color: '#3b82f6', glowClass: 'shadow-[0_0_30px_rgba(59,130,246,0.25)]', borderClass: 'border-blue-500/40', textClass: 'text-blue-400' },
      { min: maxHR * 0.7, max: maxHR * 0.8, label: 'Zone 3: Aerobic', color: '#22c55e', glowClass: 'shadow-[0_0_30px_rgba(34,197,94,0.25)]', borderClass: 'border-green-500/40', textClass: 'text-green-400' },
      { min: maxHR * 0.8, max: maxHR * 0.9, label: 'Zone 4: Anaerobic', color: '#f59e0b', glowClass: 'shadow-[0_0_30px_rgba(245,158,11,0.25)]', borderClass: 'border-orange-500/40', textClass: 'text-orange-400' },
      { min: maxHR * 0.9, max: Infinity, label: 'Zone 5: Red Line', color: '#ef4444', glowClass: 'shadow-[0_0_40px_rgba(239,68,68,0.35)]', borderClass: 'border-red-500/40', textClass: 'text-red-500' },
    ];
  }, [age]);

  const currentZone = useMemo(() => {
    if (currentHR === null) return null;
    const matched = zones.find(z => currentHR >= z.min && currentHR < z.max);
    if (matched) return matched;
    if (currentHR >= zones[zones.length - 1].min) return zones[zones.length - 1];
    return {
      min: 0,
      max: zones[0].min,
      label: 'Resting / Low Intensity',
      color: '#475569',
      glowClass: 'shadow-none',
      borderClass: 'border-slate-800',
      textClass: 'text-slate-600'
    };
  }, [currentHR, zones]);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const msStr = String(now.getMilliseconds()).padStart(3, '0');
      const newLog = { id: ++logIdRef.current, message, timestamp: `${timeStr}.${msStr}` };
      return [newLog, ...prev].slice(0, MAX_LOG_ENTRIES);
    });
  }, []);

  // Timer Effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isSessionActive && sessionStartTime) {
      interval = setInterval(() => {
        setElapsedTime(formatDuration(Date.now() - sessionStartTime));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionActive, sessionStartTime]);

  const downloadSessionLog = useCallback(() => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    
    // --- FILE 1: FULL DEBUG LOG ---
    const filenameDebug = `session_${yyyy}${mm}${dd}${hh}${min}.txt`;
    let contentDebug = `AETHER AEGIS // SESSION LOG\n`;
    contentDebug += `Generated: ${now.toLocaleString()}\n`;
    contentDebug += `Subject Age: ${age}\n`;
    contentDebug += `Subject Weight: ${weight} lbs\n`;
    contentDebug += `Training Goal: ${currentObjective.title}\n`;
    contentDebug += `Session Duration Goal: ${sessionDurationGoal} mins\n`;
    contentDebug += `Goal Instructions: ${currentObjective.prompt}\n`;
    contentDebug += `Device ID: ${deviceIdHex}\n`;
    contentDebug += `Personality: ${selectedPersona}\n`;
    contentDebug += `Voice Profile: ${selectedVoice}\n`;
    contentDebug += `Voice Threshold (Chattiness): ${chattiness}\n`;
    
    if (finalSessionReportRef.current) {
        contentDebug += `Final Session Report: ${finalSessionReportRef.current.text}\n`;
    }

    contentDebug += `--------------------------------------------------\n\n`;

    if (missionProfileRef.current) {
        contentDebug += `[MISSION PROFILE]\n`;
        contentDebug += `Prompt: ${missionProfileRef.current.prompt}\n`;
        contentDebug += `Response: ${missionProfileRef.current.text}\n`;
        contentDebug += `--------------------------------------------------\n\n`;
    }

    if (sessionIntroRef.current) {
        contentDebug += `[SESSION INTRO]\n`;
        contentDebug += `Prompt: ${sessionIntroRef.current.prompt}\n`;
        contentDebug += `Response: ${sessionIntroRef.current.text}\n`;
        contentDebug += `--------------------------------------------------\n\n`;
    }
  
    if (allSessionSummariesRef.current.length === 0) {
      contentDebug += `[NO DATA PACKETS RECORDED]\n`;
    } else {
      allSessionSummariesRef.current.forEach((s, index) => {
        contentDebug += `[PACKET #${index + 1} | ${s.timestamp}]\n`;
        contentDebug += `   > HEART RATE : Avg ${s.avg} | Max ${s.max} | Min ${s.min} (Samples: ${s.sampleCount})\n`;
        if (s.sessionContextSummary) {
            contentDebug += `   > SESSION CONTEXT (Mid-Term Memory) : ${s.sessionContextSummary}\n`;
        }
        contentDebug += `   > AI PROMPT : \n${s.prompt || "N/A"}\n`;
        contentDebug += `   > AI ANALYST : ${s.insight || "Analysis pending or failed."}\n`;
        contentDebug += `   > RAW VALUES : [${s.values.join(',')}]\n`;
        contentDebug += `\n`;
      });
    }

    if (finalSessionReportRef.current) {
        contentDebug += `--------------------------------------------------\n`;
        contentDebug += `[FINAL REPORT DIAGNOSTICS]\n`;
        contentDebug += `Prompt Used:\n${finalSessionReportRef.current.prompt}\n\n`;
        contentDebug += `Raw Response:\n${finalSessionReportRef.current.text}\n`;
    }

    // --- FILE 2: USER SESSION SUMMARY (Concise) ---
    const filenameUser = `usersession_${yyyy}${mm}${dd}${hh}${min}.txt`;
    let contentUser = `AETHER AEGIS // USER SESSION SUMMARY\n`;
    contentUser += `Generated: ${now.toLocaleString()}\n`;
    contentUser += `Subject Age: ${age}\n`;
    contentUser += `Subject Weight: ${weight} lbs\n`;
    contentUser += `Training Goal: ${currentObjective.title}\n`;
    contentUser += `Target Duration: ${sessionDurationGoal} mins\n`;
    contentUser += `Personality: ${selectedPersona}\n`;
    contentUser += `--------------------------------------------------\n\n`;

    if (sessionIntroRef.current) {
        contentUser += `[SESSION START]\n`;
        contentUser += `Coach Intro: "${sessionIntroRef.current.text}"\n\n`;
    }

    if (allSessionSummariesRef.current.length > 0) {
        contentUser += `[TIMELINE]\n`;
        allSessionSummariesRef.current.forEach((s, index) => {
            contentUser += `Minute ${index + 1} (${s.timestamp}): Avg ${s.avg} BPM | Max ${s.max} BPM\n`;
            contentUser += `Coach: "${s.insight || "N/A"}"\n\n`;
        });
    }

    if (finalSessionReportRef.current) {
        contentUser += `[SESSION END]\n`;
        contentUser += `Final Report: "${finalSessionReportRef.current.text}"\n`;
    }
    
    // --- DOWNLOAD TRIGGER HELPERS ---
    const triggerDownload = (filename: string, text: string) => {
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Download both
    triggerDownload(filenameDebug, contentDebug);
    setTimeout(() => {
        triggerDownload(filenameUser, contentUser);
    }, 200);
    
    addLog(`SYSTEM: Log files generated: ${filenameDebug} & ${filenameUser}`);
    addLog(`NOTE: Files saved to browser default downloads folder.`);
  }, [age, weight, currentObjective, sessionDurationGoal, deviceIdHex, selectedVoice, selectedPersona, chattiness, addLog]);

  // --- Audio Queue Processor ---
  const processAudioQueue = useCallback(async () => {
    if (isAudioPlayingRef.current || audioQueueRef.current.length === 0) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    
    // Try to resume if suspended (needed for some browsers policy)
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
        // console.error("Audio Context Resume failed", e);
        return; 
      }
    }

    const nextBuffer = audioQueueRef.current.shift();
    if (!nextBuffer) return;

    isAudioPlayingRef.current = true;
    
    const source = ctx.createBufferSource();
    source.buffer = nextBuffer;
    source.connect(ctx.destination);
    activeSourceNodeRef.current = source;
    
    source.onended = () => {
        isAudioPlayingRef.current = false;
        activeSourceNodeRef.current = null;
        processAudioQueueRef.current(); // Recursive processing
    };

    source.start();
  }, []);

  // Update the ref whenever the function definition updates (or initially)
  useEffect(() => {
    processAudioQueueRef.current = processAudioQueue;
  }, [processAudioQueue]);

  const speakInsight = useCallback(async (text: string) => {
    if (!isVoiceEnabled) return;

    const maxRetries = 1; // Total attempts = 1 initial + 1 retry
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const isRetry = attempt > 0;
        addLog(`VOICE: Synthesizing insight via Gemini TTS (${selectedVoice})...${isRetry ? ` (Attempt ${attempt + 1})` : ''}`);
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: `Say with a professional and motivating tone: ${text}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedVoice },
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
            throw new Error("API returned no audio data");
        }

        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        }
        
        const ctx = audioContextRef.current;
        // NOTE: We don't await resume here to avoid blocking generation loop; queue processor handles resume.

        const audioBuffer = await decodeAudioData(
          decodeBase64(base64Audio),
          ctx,
          24000,
          1,
        );

        // Queue the audio instead of playing immediately
        audioQueueRef.current.push(audioBuffer);
        addLog(`VOICE: Segment buffered. Queue size: ${audioQueueRef.current.length}`);
        processAudioQueue();
        
        return; // Success, exit the loop

      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        addLog(`VOICE_WARN: Attempt ${attempt + 1} failed: ${errorMsg}`);
        
        // Don't retry on 429
        if (errorMsg.includes('429') || errorMsg.includes('ResourceExhausted')) {
             addLog(`VOICE_ERROR: Quota exceeded (429). Aborting retry strategy.`);
             break;
        }

        if (attempt < maxRetries) {
          addLog(`VOICE: Retrying in 500ms...`);
          await new Promise(resolve => setTimeout(resolve, 500)); // Backoff
          attempt++;
        } else {
          addLog(`VOICE_ERROR: All synthesis attempts failed.`);
          break; // Exit loop
        }
      }
    }
  }, [isVoiceEnabled, selectedVoice, addLog, processAudioQueue]);

  const generateMissionProfile = useCallback(async () => {
    const prompt = `Generate a holistic single-session mission profile for a ${age}-year-old.
Selected Strategy: ${currentObjective.title}
Target Duration: ${sessionDurationGoal} minutes
Contextual Instructions: "${currentObjective.prompt}"

Requirements:
1.  **Biometric Baselines**: Calculate Max HR (220-age) and specific BPM ranges for Zones 1–5.
2.  **Primary Directive**: Identify the target zone(s) based on the Contextual Instructions and provide their BPM ranges. Include a +/- 3 BPM tolerance buffer where minor deviations are ignored. Explicitly restate the target time-in-zone percentage (from Contextual Instructions) required to classify the telemetry stream as 'good'.
3.  **Adherence Protocol**: Based on the Contextual Instructions, define the judging criteria. Instead of a binary pass/fail, provide a descriptive guideline (e.g., "Maintain target zone for 80% of the session", "Allow for transient drops during recovery", "Strict adherence required for intervals").
4.  **Recovery Parameters**: Define a Recovery Ceiling (BPM) for rest periods.
5.  **Safety Limits**: State the Hard Safety Redline (100% intensity).

Output Style: concise, structured, and directive. This profile will serve as the "ground truth" for an AI coach analyzing live telemetry.`;

    try {
        addLog(`AI_REQUEST: Generating Mission Profile (Baseline)...`);
        addLog(`[DEBUG_MISSION_PROFILE_PROMPT] ${prompt}`); 
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        
        const profileText = response.text || "Mission profile generation failed. Using default heuristic.";
        missionProfileRef.current = { prompt, text: profileText };
        addLog(`[MISSION_PROFILE] ${profileText}`);
    } catch (e) {
        addLog(`AI_ERROR: Mission Profile generation failed. ${e instanceof Error ? e.message : ''}`);
    }
  }, [age, currentObjective, sessionDurationGoal, addLog]);

  const generateIntroMessage = useCallback(async () => {
    const personaIdentity = PERSONAS[selectedPersona] || PERSONAS["AetherAegis"];
    const prompt = `
    Persona: ${personaIdentity}
    User Goal: ${currentObjective.title} (${currentObjective.prompt})
    Task: The user has just started a workout session. Generate a single, short, motivating sentence to initiate the session.
    Constraint: Maximum 25 words. Strictly adhere to persona.
    `;

    try {
      addLog(`AI_REQUEST: Generating intro for "${selectedPersona}"...`);
      addLog(`[DEBUG_INTRO_PROMPT] ${prompt}`); // Log to console

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      const introText = response.text || "Session initialized. AetherAegis monitoring active.";
      addLog(`AI_INTRO: "${introText}"`);
      
      // Store in ref for file log
      sessionIntroRef.current = { prompt, text: introText };
      
      if (isVoiceEnabled) {
          // Small delay to ensure AudioContext is fully ready after user click
          const cleanIntro = cleanInsightText(introText);
          setTimeout(() => speakInsight(cleanIntro), 500);
      }
    } catch (e) {
         addLog(`AI_ERROR: Intro generation failed. ${e instanceof Error ? e.message : ''}`);
    }
  }, [selectedPersona, currentObjective, isVoiceEnabled, addLog, speakInsight]);

  const generateSessionSummary = useCallback(async () => {
    // Collect all past data
    const summaries = allSessionSummariesRef.current;
    if (summaries.length < 2) return;

    const personaIdentity = PERSONAS[selectedPersona] || PERSONAS["AetherAegis"];
    const historyText = summaries.map((s, i) => 
        `Min ${i+1}: Avg ${s.avg}, Max ${s.max}, Min ${s.min}`
    ).join('\n');

    const prompt = `
    Persona: ${personaIdentity}
    User Goal: ${currentObjective.title} (${currentObjective.prompt})
    Task: Review the session history below. Create a "Mid-Term Memory" summary of the overall performance trend so far.
    Output: A detailed summary (2-3 sentences) describing the trajectory, preserving context about zone adherence and effort consistency.
    
    Session History:
    ${historyText}
    `;

    try {
        addLog(`AI_REQUEST: Updating Mid-Term Memory Context...`);
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        
        const summaryText = response.text || "Trends processing...";
        currentSessionContextRef.current = summaryText;
        addLog(`[MID_TERM_MEMORY] ${summaryText}`);
    } catch (e) {
        addLog(`AI_WARN: Failed to update session context.`);
    }

  }, [selectedPersona, currentObjective, addLog]);

  const generateFinalSessionReport = useCallback(async (finalDuration: string) => {
    const summaries = allSessionSummariesRef.current;
    if (summaries.length === 0) return;

    const lastSummary = summaries[summaries.length - 1];
    const midTermContext = currentSessionContextRef.current;
    const personaIdentity = PERSONAS[selectedPersona] || PERSONAS["AetherAegis"];
    
    // Calculate simple stats for prompt
    const avgHr = Math.round(summaries.reduce((a,b)=>a+b.avg,0)/summaries.length);
    const peakHr = Math.max(...summaries.map(s => s.max));

    const prompt = `
    Persona: ${personaIdentity}
    User Goal: ${currentObjective.title} (${currentObjective.prompt})
    Task: The workout session has ended. Generate a final session report based on the context below.
    Constraints: Maximum 2 sentences. Professional, summary-focused, and concluding.
    
    Session Stats: Duration ${finalDuration}, Avg HR ${avgHr} BPM, Peak HR ${peakHr} BPM.
    Mid-Term Trend: ${midTermContext || "N/A"}
    Last Minute Insight: ${lastSummary.insight || "N/A"}
    `;

    try {
        addLog(`AI_REQUEST: Generating Final Session Report...`);
        addLog(`[DEBUG_FINAL_REPORT_PROMPT] ${prompt}`); 
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: prompt,
        });
        
        const reportText = response.text || "Session concluded. Data saved.";
        finalSessionReportRef.current = { prompt, text: reportText };
        addLog(`[FINAL_REPORT] ${reportText}`);

        // Trigger TTS for final report if voice is enabled
        if (isVoiceEnabled) {
            const cleanReport = cleanInsightText(reportText);
            speakInsight(cleanReport);
        }

    } catch (e) {
        addLog(`AI_ERROR: Final report generation failed.`);
    }
  }, [selectedPersona, currentObjective, addLog, isVoiceEnabled, speakInsight]);

  const requestAiInsight = async (summary: MinuteSummary) => {
    const personaIdentity = PERSONAS[selectedPersona] || PERSONAS["AetherAegis"];
    
    // Construct GOAL context including Mission Profile if available
    let goalContext = `${currentObjective.title} (${currentObjective.prompt})`;
    if (missionProfileRef.current) {
        goalContext += `\n\nMISSION PROFILE (Baseline Targets):\n${missionProfileRef.current.text}`;
    }

    const tailoredSystemInstruction = `Persona: ${personaIdentity}\n${BASE_SYSTEM_INSTRUCTION.replace('{{GOAL}}', goalContext)}`;
    
    // --- HISTORY BUILDER START ---
    const allSummaries = allSessionSummariesRef.current;
    const currentIndex = allSummaries.findIndex(s => s.id === summary.id);
    
    let historyContext = "";
    
    if (currentIndex === 0) {
        // Packet #1: History is just the intro
        if (sessionIntroRef.current) {
            historyContext = `[HISTORY: START OF SESSION]\nCoach Intro: "${sessionIntroRef.current.text}"\n`;
        }
    } else if (currentIndex === 1) {
        // Packet #2: History is Intro + Packet #1
        if (sessionIntroRef.current) {
            historyContext += `[HISTORY: START OF SESSION]\nCoach Intro: "${sessionIntroRef.current.text}"\n\n`;
        }
        const prev = allSummaries[0];
        historyContext += `[HISTORY: PREVIOUS UPDATE (Minute 1)]\nMetrics: Avg ${prev.avg}, Max ${prev.max}\nCoach Feedback: "${prev.insight || 'N/A'}"\n`;
    } else {
        // Packet #3+: History is Packet #N-2 and Packet #N-1
        const prev2 = allSummaries[currentIndex - 2];
        const prev1 = allSummaries[currentIndex - 1];
        
        historyContext += `[HISTORY: 2 MINUTES AGO]\nMetrics: Avg ${prev2.avg}, Max ${prev2.max}\nCoach Feedback: "${prev2.insight || 'N/A'}"\n\n`;
        historyContext += `[HISTORY: 1 MINUTE AGO]\nMetrics: Avg ${prev1.avg}, Max ${prev1.max}\nCoach Feedback: "${prev1.insight || 'N/A'}"\n`;
    }
    // --- HISTORY BUILDER END ---

    // --- MID-TERM MEMORY INJECTION ---
    let memoryContext = "";
    if (currentSessionContextRef.current) {
        memoryContext = `MID-TERM SESSION CONTEXT (Overall Trend Summary):\n"${currentSessionContextRef.current}"\n(Use this context to ensure your new advice aligns with the bigger picture)\n\n`;
    }

    const prompt = `${tailoredSystemInstruction}\n\n${memoryContext}${historyContext ? `SHORT-TERM CONTEXT (Maintain continuity):\n${historyContext}\n\n` : ''}CURRENT MINUTE PACKET (Minute ${currentIndex + 1}):\n- Average BPM: ${summary.avg}\n- Max BPM: ${summary.max}\n- Min BPM: ${summary.min}\n- Sample Count: ${summary.sampleCount}\n- Raw Telemetry Stream: [${summary.values.join(', ')}]`;

    try {
      addLog(`AI_REQUEST: Analyzing for goal: "${currentObjective.title}" as "${selectedPersona}"...`);
      addLog(`[DEBUG_PROMPT_START]\n${prompt}\n[DEBUG_PROMPT_END]`);
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });

      const insight = response.text || "Insight unavailable.";
      addLog(`AI_RESPONSE: Analysis complete.`);
      addLog(`AI_INSIGHT: "${insight}"`);

      // Update the log history ref with the new insight and prompt
      const logIndex = allSessionSummariesRef.current.findIndex(s => s.id === summary.id);
      if (logIndex !== -1) {
        allSessionSummariesRef.current[logIndex].insight = insight;
        allSessionSummariesRef.current[logIndex].prompt = prompt; // Store prompt for file log
        allSessionSummariesRef.current[logIndex].sessionContextSummary = currentSessionContextRef.current; // Store memory context
        allSessionSummariesRef.current[logIndex].isAnalyzing = false;
      }

      setSummaries(prev => prev.map(s => 
        s.id === summary.id ? { ...s, insight, isAnalyzing: false, prompt, sessionContextSummary: currentSessionContextRef.current } : s
      ));

      // Extract Saliency Score from Insight Text for logic processing
      // Expected Format: "Score: [X] | ..."
      const scoreMatch = insight.match(/^Score:\s*\[?([\d.]+)\]?\s*\|/i);
      const saliencyScore = scoreMatch ? parseFloat(scoreMatch[1]) : 0;

      // Clean text for TTS and Display
      const cleanText = cleanInsightText(insight);

      // Trigger TTS if enabled AND score meets threshold
      if (isVoiceEnabled) {
        if (saliencyScore >= chattiness) {
          speakInsight(cleanText);
        } else {
          addLog(`VOICE_SKIP: Insight Score (${saliencyScore}) < Threshold (${chattiness}).`);
        }
      }
    } catch (e) {
      addLog(`AI_ERROR: Failed. ${e instanceof Error ? e.message : 'Unknown error'}`);
      
      const logIndex = allSessionSummariesRef.current.findIndex(s => s.id === summary.id);
      if (logIndex !== -1) {
        allSessionSummariesRef.current[logIndex].insight = "Analysis failed.";
        allSessionSummariesRef.current[logIndex].prompt = prompt; // Still store prompt on failure
        allSessionSummariesRef.current[logIndex].isAnalyzing = false;
      }

      setSummaries(prev => prev.map(s => 
        s.id === summary.id ? { ...s, insight: "Analysis failed.", isAnalyzing: false, prompt } : s
      ));
    }
  };

  const calculateMinuteSummary = useCallback(() => {
    const values = [...currentMinuteRef.current];
    currentMinuteRef.current = []; // Reset for next minute
    
    if (values.length === 0) return;
    
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const newSummary: MinuteSummary = {
      id: crypto.randomUUID(),
      timestamp,
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
      max: Math.max(...values),
      min: Math.min(...values),
      sampleCount: values.length,
      values,
      isAnalyzing: true
    };

    // Store in full session log history
    allSessionSummariesRef.current.push(newSummary);

    setSummaries(prev => [newSummary, ...prev].slice(0, 3));
    addLog(`AGGREGATOR: Minute Packet [${timestamp}] generated.`);
    
    // Trigger standard analysis
    requestAiInsight(newSummary);

    // Check if we should update mid-term memory (After 2nd packet)
    if (allSessionSummariesRef.current.length >= 2) {
        generateSessionSummary();
    }

  }, [addLog, trainingGoal, isVoiceEnabled, selectedPersona, speakInsight, generateSessionSummary, chattiness, requestAiInsight]); // Added requestAiInsight and chattiness dependency

  const calcRef = useRef(calculateMinuteSummary);
  useEffect(() => { calcRef.current = calculateMinuteSummary; }, [calculateMinuteSummary]);
  
  const showRawTelemetryRef = useRef(showRawTelemetry);
  useEffect(() => { showRawTelemetryRef.current = showRawTelemetry; }, [showRawTelemetry]);

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) return;
    
    setStatus(ConnectionStatus.CONNECTING);
    setError(null);
    addLog(`SYSTEM: Uplink initiated at ${wsUrl}`);
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        const fullDeviceId = `connect:${deviceIdHex}`;
        addLog(`SYSTEM: Handshake confirmed: ${fullDeviceId}`);
        setStatus(ConnectionStatus.CONNECTED);
        ws.send(fullDeviceId);
      };

      ws.onmessage = (event) => {
        try {
          const rawMsg = event.data.toString();
          const rawData = JSON.parse(rawMsg);
          const rawHR = rawData.hr !== undefined ? rawData.hr : (rawData.data?.hr);
          const numericHR = typeof rawHR === 'number' ? rawHR : Number(rawHR);
          
          if (!isNaN(numericHR) && numericHR >= HR_MIN_VALID && numericHR <= HR_MAX_VALID) {
            
            // LOGIC: AI triggers only if session is active AND we hit the time delta
            let isAiTrigger = false;
            
            if (sessionActiveRef.current) {
                const now = Date.now();
                if (now >= nextSummaryTimeRef.current) {
                    isAiTrigger = true;
                    // Increment target time by exactly 60000ms from the previous target
                    // This prevents drift caused by code execution time
                    nextSummaryTimeRef.current += 60000;
                }
            }

            const newData: HeartRateData = {
              hr: numericHR,
              timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              isAiRequest: isAiTrigger
            };
            
            if (showRawTelemetryRef.current) {
              addLog(`TELEMETRY: ${numericHR} BPM ${isAiTrigger ? '[AI_SYNC]' : ''} | RAW: ${rawMsg}`);
            }
            
            setCurrentHR(numericHR);
            setDataPoints((prev) => {
              const updated = [...prev, newData];
              return updated.length > MAX_DATA_POINTS ? updated.slice(updated.length - MAX_DATA_POINTS) : updated;
            });
            
            // Only accumulate data if session is active
            if (sessionActiveRef.current) {
                currentMinuteRef.current.push(numericHR);
                if (isAiTrigger) {
                  calcRef.current(); 
                }
            }

          } else if (numericHR !== undefined && numericHR !== null) {
            addLog(`WARNING: Biometric Noise Filtered [${numericHR} BPM]`);
          }
        } catch (e) {
          addLog(`ERROR: Telemetry parsing failed.`);
        }
      };

      ws.onclose = () => {
        addLog(`SYSTEM: Connection severed.`);
        setStatus(ConnectionStatus.DISCONNECTED);
        // If connection dies, we might want to pause session or just leave it. 
        // For now, we leave the session active in UI but it won't get data.
      };
      
      ws.onerror = () => {
        addLog(`ERROR: WebSocket transport failure.`);
        setStatus(ConnectionStatus.ERROR);
        setError(`Uplink failure at ${wsUrl}`);
      };
    } catch (e) {
      setStatus(ConnectionStatus.ERROR);
      setError('Initialization error.');
    }
  }, [addLog, wsUrl, deviceIdHex]);

  const handleRestart = useCallback(() => {
    addLog(`SYSTEM: CONFIGURATION_REBOOT INITIALIZED.`);
    localStorage.setItem(STORAGE_KEYS.WS, wsUrl);
    localStorage.setItem(STORAGE_KEYS.HEX, deviceIdHex);
    localStorage.setItem(STORAGE_KEYS.AGE, String(age));
    localStorage.setItem(STORAGE_KEYS.WEIGHT, String(weight));
    localStorage.setItem(STORAGE_KEYS.GOAL, trainingGoal);
    localStorage.setItem(STORAGE_KEYS.DURATION, String(sessionDurationGoal));
    localStorage.setItem(STORAGE_KEYS.VOICE, String(isVoiceEnabled));
    localStorage.setItem(STORAGE_KEYS.VOICE_NAME, selectedVoice);
    localStorage.setItem(STORAGE_KEYS.PERSONA, selectedPersona);
    localStorage.setItem(STORAGE_KEYS.CHATTINESS, String(chattiness));
    
    // Resume AudioContext on user gesture
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    audioContextRef.current.resume();

    // CLEAR QUEUE & STOP AUDIO
    if (activeSourceNodeRef.current) {
        try { activeSourceNodeRef.current.stop(); } catch (e) {}
        activeSourceNodeRef.current = null;
    }
    audioQueueRef.current = [];
    isAudioPlayingRef.current = false;

    if (wsRef.current) wsRef.current.close();
    setDataPoints([]);
    setCurrentHR(null);
    currentMinuteRef.current = [];
    allSessionSummariesRef.current = [];
    sessionIntroRef.current = null; // Clear intro ref on restart
    missionProfileRef.current = null; // Clear mission profile
    currentSessionContextRef.current = ""; // Clear memory ref
    finalSessionReportRef.current = null; // Clear final report
    setSummaries([]);
    setIsSessionActive(false);
    setElapsedTime("00:00:00");
    setTimeout(connect, 300);
  }, [connect, addLog, wsUrl, deviceIdHex, age, weight, trainingGoal, sessionDurationGoal, isVoiceEnabled, selectedVoice, selectedPersona, chattiness]);

  useEffect(() => {
    connect();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [connect]);

  const toggleSession = useCallback(async () => {
    if (isSessionActive) {
      // Stop Session
      setIsSessionActive(false);
      // We keep the elapsed time display visible, but stop updating it
      addLog(`SESSION: Workout stopped. Duration: ${elapsedTime}`);
      setSessionStartTime(null);
      
      // Generate Final Report before downloading
      await generateFinalSessionReport(elapsedTime);
      
      // Auto-download logs
      downloadSessionLog();

    } else {
      // Start Session
      if (status !== ConnectionStatus.CONNECTED) {
        addLog("ERROR: Cannot start session. Device offline.");
        return;
      }
      
      // Warm up AudioContext on user interaction to satisfy autoplay policies
      if (isVoiceEnabled) {
          if (!audioContextRef.current) {
             audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          }
          if (audioContextRef.current.state === 'suspended') {
             audioContextRef.current.resume().then(() => {
               addLog("AUDIO: Context resumed successfully.");
             }).catch(err => {
               addLog(`AUDIO_WARN: Context resume failed: ${err}`);
             });
          }
      }

      const now = Date.now();
      setIsSessionActive(true);
      setSessionStartTime(now);
      setElapsedTime("00:00:00");
      currentMinuteRef.current = []; // Clear buffer
      allSessionSummariesRef.current = []; // Clear session history
      sessionIntroRef.current = null; // Clear old intro
      missionProfileRef.current = null; // Clear old profile
      currentSessionContextRef.current = ""; // Clear old memory
      finalSessionReportRef.current = null; // Clear old final report
      nextSummaryTimeRef.current = now + 60000; // Exact 1 min delta
      addLog("SESSION: Workout started. Timer active.");

      // Trigger Start-of-Session AI Tasks
      generateMissionProfile(); // Establish baseline targets
      generateIntroMessage();   // Say hello
    }
  }, [isSessionActive, status, addLog, elapsedTime, downloadSessionLog, isVoiceEnabled, generateIntroMessage, generateFinalSessionReport, generateMissionProfile]);

  // Compute the latest cleaned insight for display
  const latestInsightCleaned = useMemo(() => {
    if (summaries.length === 0 || !summaries[0].insight) return undefined;
    return cleanInsightText(summaries[0].insight);
  }, [summaries]);

  return (
    <div className="min-h-screen bg-[#050608] bg-grid text-slate-200 p-4 md:p-8 flex flex-col items-center relative">
      <div className={`w-full ${!isFullScreen ? 'max-w-7xl space-y-8 pb-32' : 'max-w-full h-[90vh] pb-0'}`}>
        {!isFullScreen && (
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <DashboardHeader />
            <div className="flex flex-wrap items-center gap-4 bg-slate-950/60 p-4 rounded border border-white/5">
              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Subject Age</label>
                <input type="number" value={age} onChange={(e) => setAge(Math.max(1, Math.min(120, parseInt(e.target.value) || 0)))} className="bg-black border border-white/10 text-[#ff003c] font-mono text-lg px-3 py-1 w-16 focus:outline-none focus:border-[#ff003c]/50 transition-colors" />
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Weight (lbs)</label>
                <input type="number" value={weight} onChange={(e) => setWeight(Math.max(1, parseInt(e.target.value) || 0))} className="bg-black border border-white/10 text-[#ff003c] font-mono text-lg px-3 py-1 w-20 focus:outline-none focus:border-[#ff003c]/50 transition-colors" />
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />
              
              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Training Objective</label>
                <select value={trainingGoal} onChange={(e) => setTrainingGoal(e.target.value)} className="bg-black border border-white/10 text-cyan-400 font-mono text-xs px-3 py-1.5 focus:outline-none focus:border-cyan-400/50 transition-colors appearance-none cursor-pointer">
                  {TRAINING_OBJECTIVES.map(g => <option key={g.title} value={g.title}>{g.title}</option>)}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Session Objective</label>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase text-slate-400 font-bold">Time:</span>
                    <input type="number" value={sessionDurationGoal} onChange={(e) => setSessionDurationGoal(Math.max(1, parseInt(e.target.value) || 20))} className="bg-black border border-white/10 text-cyan-400 font-mono text-xs px-3 py-1.5 w-16 focus:outline-none focus:border-cyan-400/50 transition-colors" />
                    <span className="text-[10px] uppercase text-slate-500">Min</span>
                </div>
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Personality</label>
                <select value={selectedPersona} onChange={(e) => setSelectedPersona(e.target.value)} className="bg-black border border-white/10 text-amber-500 font-mono text-xs px-3 py-1.5 focus:outline-none focus:border-amber-500/50 transition-colors appearance-none cursor-pointer w-32">
                  {Object.keys(PERSONAS).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Voice Profile</label>
                <select value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} className="bg-black border border-white/10 text-cyan-400 font-mono text-xs px-3 py-1.5 focus:outline-none focus:border-cyan-400/50 transition-colors appearance-none cursor-pointer w-24">
                  {VOICE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Voice Threshold</label>
                <input 
                  type="number" 
                  min="1" 
                  max="10" 
                  value={chattiness} 
                  onChange={(e) => setChattiness(Math.max(1, Math.min(10, parseInt(e.target.value) || 1)))} 
                  className="bg-black border border-white/10 text-purple-400 font-mono text-xs px-3 py-1.5 w-16 focus:outline-none focus:border-purple-400/50 transition-colors" 
                  title="Min Saliency Score (1-10) required to trigger TTS."
                />
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Session Control</label>
                <button 
                  onClick={toggleSession}
                  className={`px-4 py-1.5 border font-black rounded-sm transition-all uppercase text-[10px] tracking-widest ${isSessionActive ? 'bg-red-500/20 text-red-500 border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)] hover:bg-red-500/30' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:bg-emerald-500/30'}`}
                >
                  {isSessionActive ? 'STOP SESSION' : 'START SESSION'}
                </button>
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />
              
              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">WS Endpoint</label>
                <input type="text" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} placeholder="ws://192.168.1.X:8080" className="bg-black border border-white/10 text-blue-400 font-mono text-xs px-3 py-1.5 w-56 focus:outline-none focus:border-blue-400/50 transition-colors" />
              </div>
              
              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Device Hex</label>
                <input type="text" value={deviceIdHex} onChange={(e) => setDeviceIdHex(e.target.value)} className="bg-black border border-white/10 text-emerald-400 font-mono text-xs px-3 py-1.5 w-44 focus:outline-none focus:border-emerald-400/50 transition-colors rounded-r-sm" placeholder="XX:XX:XX:XX:XX:XX" />
              </div>
              
              <div className="h-10 w-px bg-white/5 hidden md:block" />

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Coaching Voice</label>
                <button 
                  onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
                  className={`px-3 py-1.5 border font-bold rounded-sm transition-all uppercase text-[9px] tracking-widest ${isVoiceEnabled ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.1)]' : 'bg-slate-900/50 text-slate-500 border-white/10 hover:border-white/20'}`}
                >
                  {isVoiceEnabled ? 'Audio: Active' : 'Audio: Muted'}
                </button>
              </div>
              
              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Log Stream</label>
                <button 
                  onClick={() => setShowRawTelemetry(!showRawTelemetry)}
                  className={`px-3 py-1.5 border font-bold rounded-sm transition-all uppercase text-[9px] tracking-widest ${showRawTelemetry ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.1)]' : 'bg-slate-900/50 text-slate-500 border-white/10 hover:border-white/20'}`}
                >
                  {showRawTelemetry ? 'Stream: ON' : 'Stream: OFF'}
                </button>
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Status</label>
                <StatusBadge status={status} sessionActive={isSessionActive} />
              </div>
              
              <div className="flex gap-2 ml-auto lg:ml-0">
                <button onClick={() => setShowDebug(!showDebug)} className={`px-4 py-2 border font-bold rounded-sm transition-all uppercase text-xs tracking-widest ${showDebug ? 'bg-[#ff003c] text-white border-[#ff003c]' : 'border-white/20 text-slate-400 hover:border-white/40'}`}>{showDebug ? 'Hide Console' : 'Show Console'}</button>
                <button onClick={() => setIsFullScreen(true)} className="px-4 py-2 border border-white/20 text-slate-400 hover:text-white hover:border-white/40 font-bold rounded-sm transition-all uppercase text-xs tracking-widest">Full Screen</button>
                <button onClick={handleRestart} className="px-4 py-2 border border-[#ff003c]/40 hover:bg-[#ff003c]/10 text-[#ff003c] font-bold rounded-sm transition-all uppercase text-xs tracking-widest">Apply & Persist</button>
              </div>
            </div>
          </div>
        )}

        <div className={`grid grid-cols-1 ${!isFullScreen ? 'xl:grid-cols-4 gap-8 items-start' : 'h-[85vh] w-full'}`}>
          <div className={`${!isFullScreen ? 'xl:col-span-1 space-y-8' : 'w-full h-full relative'} transition-all duration-500`}>
            {isFullScreen && (
                <button 
                  onClick={() => setIsFullScreen(false)}
                  className="absolute top-6 right-6 z-50 px-6 py-3 bg-black/60 border border-white/10 text-slate-400 hover:text-[#ff003c] hover:border-[#ff003c]/50 font-bold rounded-sm transition-all uppercase text-xs tracking-widest backdrop-blur-md"
                >
                  Return to Dashboard
                </button>
            )}
            <HeartRateDisplay 
              hr={currentHR} 
              zone={currentZone} 
              elapsedTime={elapsedTime} 
              latestInsight={latestInsightCleaned}
              isFullScreen={isFullScreen}
            />
            {!isFullScreen && (
              <div className="p-4 aether-border bg-slate-900/20 opacity-60 text-[10px] font-mono">
                 <h3 className="text-xs uppercase tracking-widest text-slate-500 font-bold mb-3 border-b border-white/5 pb-2">Target Zones (Age {age})</h3>
                 <div className="space-y-2">
                   {zones.map((z, idx) => (
                     <div key={idx} className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: z.color }}></div>
                       <span className="w-16 text-slate-500 uppercase">{z.label.split(':')[0]}</span>
                       <span className="text-white">{Math.round(z.min)}+ BPM</span>
                     </div>
                   ))}
                 </div>
              </div>
            )}
          </div>
          {!isFullScreen && (
            <div className="xl:col-span-3 space-y-8">
              <HeartRateChart data={dataPoints} activeColor={currentZone?.color || '#475569'} age={age} zones={zones} />
              <AggregatorPanel summaries={summaries} />
            </div>
          )}
        </div>
      </div>
      <div className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ease-in-out transform ${showDebug ? 'translate-y-0' : 'translate-y-full'}`}><DebugLog logs={logs} onClose={() => setShowDebug(false)} /></div>
      <footer className="mt-auto py-8 text-center text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold">AetherAegis Biometric Monitoring Suite // v5.10.0-ReConnect.8080</footer>
    </div>
  );
};

export default App;