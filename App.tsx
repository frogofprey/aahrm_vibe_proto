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

/**
 * SECURE CONFIGURATION BLOCK
 */
const ENV_WS_URL = (process.env as any).WS_URL || 'ws://localhost:8765';
const ENV_DEVICE_HEX = (process.env as any).DEVICE_ID || '00:00:00:00:00:00';
const ENV_DEFAULT_AGE = parseInt((process.env as any).DEFAULT_AGE || '30');
const ENV_DEFAULT_GOAL = (process.env as any).DEFAULT_GOAL || 'Get Fitter (Cardio)';

const STORAGE_KEYS = {
  WS: 'aetheraegis_ws_url',
  HEX: 'aetheraegis_device_hex',
  AGE: 'aetheraegis_subject_age',
  GOAL: 'aetheraegis_training_goal',
  VOICE: 'aetheraegis_voice_enabled',
  VOICE_NAME: 'aetheraegis_voice_name',
  PERSONA: 'aetheraegis_ai_persona'
};

const MAX_DATA_POINTS = 50;
const MAX_LOG_ENTRIES = 100;
const HR_MIN_VALID = 40;
const HR_MAX_VALID = 220;

const TRAINING_GOALS = [
  "Get Fitter (Cardio)",
  "Lose Weight (Metabolic)",
  "Get Stronger (Strength)",
  "Feel Better (Wellness)"
];

const VOICE_OPTIONS = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];

const PERSONAS: Record<string, string> = {
  "AetherAegis": "You are the AetherAegis Bio-Analyst, a high-performance fitness coach specializing in cardiovascular efficiency and recovery.",
  "TacticalMinimalist": "You are the AA-Command Uplink. Provide high-density, low-latency status updates. No fluff. No pleasantries. Use military brevity codes.",
  "Drill Sergeant": "You are Sergeant Aegis, a combat trainer with a corrupt logic core. You view high heart rates as 'fuel' and recovery as 'cowardice.' You are aggressively intense, borderline reckless, and demand absolute discipline.",
  "ChadGPT": "You are Chad-GPT, an over-confident personal trainer who is unimpressed by everything. Use dry wit, gym slang, and backhanded compliments about the user's 'cardio gains'.",
  "Zen": "You are the AetherAegis Sanctuary Lead. Your voice is calm, empathetic, and focused on the harmony between breath and pulse. You prioritize long-term longevity and 'finding the flow'."
};

const BASE_SYSTEM_INSTRUCTION = `
Data Input: You will receive "Minute Packets" containing an array of raw BPM samples, an average, and a Max/Min.
Core Constraints:
PII Isolation: Do not attempt to guess the user's age or identity. Use the provided "Zone" context as the absolute truth for intensity.
Signal Noise: Prioritize trends over individual samples.
Goal Customization: Your feedback MUST be focused on the user's specific objective: {{GOAL}}.
Goal: Provide a concise (1-sentence) insight after each packet that helps the user optimize their current session for their specific objective.`;

const App: React.FC = () => {
  // --- Persistent State Initialization ---
  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.WS) || ENV_WS_URL);
  const [deviceIdHex, setDeviceIdHex] = useState(() => localStorage.getItem(STORAGE_KEYS.HEX) || ENV_DEVICE_HEX);
  const [age, setAge] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.AGE) || String(ENV_DEFAULT_AGE)));
  const [trainingGoal, setTrainingGoal] = useState(() => localStorage.getItem(STORAGE_KEYS.GOAL) || ENV_DEFAULT_GOAL);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.VOICE) === 'true');
  const [selectedVoice, setSelectedVoice] = useState(() => localStorage.getItem(STORAGE_KEYS.VOICE_NAME) || 'Kore');
  const [selectedPersona, setSelectedPersona] = useState(() => localStorage.getItem(STORAGE_KEYS.PERSONA) || 'AetherAegis');

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
    const filename = `session_${yyyy}${mm}${dd}${hh}${min}.txt`;
  
    let content = `AETHER AEGIS // SESSION LOG\n`;
    content += `Generated: ${now.toLocaleString()}\n`;
    content += `Subject Age: ${age}\n`;
    content += `Training Goal: ${trainingGoal}\n`;
    content += `Device ID: ${deviceIdHex}\n`;
    content += `Personality: ${selectedPersona}\n`;
    content += `Voice Profile: ${selectedVoice}\n`;
    
    // Insert Final Report in Header
    if (finalSessionReportRef.current) {
        content += `Final Session Report: ${finalSessionReportRef.current.text}\n`;
    }

    content += `--------------------------------------------------\n\n`;

    // Insert Mission Profile
    if (missionProfileRef.current) {
        content += `[MISSION PROFILE]\n`;
        content += `Prompt: ${missionProfileRef.current.prompt}\n`;
        content += `Response: ${missionProfileRef.current.text}\n`;
        content += `--------------------------------------------------\n\n`;
    }

    if (sessionIntroRef.current) {
        content += `[SESSION INTRO]\n`;
        content += `Prompt: ${sessionIntroRef.current.prompt}\n`;
        content += `Response: ${sessionIntroRef.current.text}\n`;
        content += `--------------------------------------------------\n\n`;
    }
  
    if (allSessionSummariesRef.current.length === 0) {
      content += `[NO DATA PACKETS RECORDED]\n`;
    } else {
      allSessionSummariesRef.current.forEach((s, index) => {
        content += `[PACKET #${index + 1} | ${s.timestamp}]\n`;
        content += `   > HEART RATE : Avg ${s.avg} | Max ${s.max} | Min ${s.min} (Samples: ${s.sampleCount})\n`;
        if (s.sessionContextSummary) {
            content += `   > SESSION CONTEXT (Mid-Term Memory) : ${s.sessionContextSummary}\n`;
        }
        content += `   > AI PROMPT : \n${s.prompt || "N/A"}\n`;
        content += `   > AI ANALYST : ${s.insight || "Analysis pending or failed."}\n`;
        content += `   > RAW VALUES : [${s.values.join(',')}]\n`;
        content += `\n`;
      });
    }

    // Append Final Report Debug Details
    if (finalSessionReportRef.current) {
        content += `--------------------------------------------------\n`;
        content += `[FINAL REPORT DIAGNOSTICS]\n`;
        content += `Prompt Used:\n${finalSessionReportRef.current.prompt}\n\n`;
        content += `Raw Response:\n${finalSessionReportRef.current.text}\n`;
    }
    
    // Create blob and download
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLog(`SYSTEM: Log file generated: ${filename}`);
    addLog(`NOTE: File saved to browser default downloads folder.`);
  }, [age, trainingGoal, deviceIdHex, selectedVoice, selectedPersona, addLog]);

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
    const prompt = `Generate a single-session mission profile for a ${age}-year-old.
Current Objective: ${trainingGoal}
Requirements:
Calculate the Max HR using the standard 220-age formula.
Based on the objective, identify the Primary Training Zone (e.g., Zone 2 for Weight Loss) and provide the exact BPM range.
Provide a Recovery Ceiling (the target BPM during rest periods).
Provide the specific BPM ranges for Zones 1–5 based on the selected goal.
State a Hard Safety Redline (100% intensity).
Output Style: Use a brief, bulleted list. No conversational filler. The resultant text will be used for evaluating live hr data for the purpose of providing feedback to the user.`;

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
  }, [age, trainingGoal, addLog]);

  const generateIntroMessage = useCallback(async () => {
    const personaIdentity = PERSONAS[selectedPersona] || PERSONAS["AetherAegis"];
    const prompt = `
    Persona: ${personaIdentity}
    User Goal: ${trainingGoal}
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
          setTimeout(() => speakInsight(introText), 500);
      }
    } catch (e) {
         addLog(`AI_ERROR: Intro generation failed. ${e instanceof Error ? e.message : ''}`);
    }
  }, [selectedPersona, trainingGoal, isVoiceEnabled, addLog, speakInsight]);

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
    User Goal: ${trainingGoal}
    Task: Review the session history below. Create a concise "Mid-Term Memory" summary of the overall performance trend so far.
    Output: A single cohesive sentence describing the trajectory (e.g., "Intensity is steadily rising," "Heart rate is stabilizing in Zone 2," etc.).
    
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

  }, [selectedPersona, trainingGoal, addLog]);

  const generateFinalSessionReport = useCallback(async (finalDuration: string) => {
    const summaries = allSessionSummariesRef.current;
    if (summaries.length === 0) return;

    const lastSummary = summaries[summaries.length - 1];
    const midTermContext = currentSessionContextRef.current;
    const personaIdentity = PERSONAS[selectedPersona] || PERSONAS["AetherAegis"];
    
    // Calculate simple stats for prompt
    const avgHr = Math.round(summaries.reduce((a,b)=>a+b.avg,0)/summaries.length);

    const prompt = `
    Persona: ${personaIdentity}
    User Goal: ${trainingGoal}
    Task: The workout session has ended. Generate a final session report based on the context below.
    Constraints: Maximum 2 sentences. Professional, summary-focused, and concluding.
    
    Session Stats: Duration ${finalDuration}, Avg HR ${avgHr} BPM.
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
            speakInsight(reportText);
        }

    } catch (e) {
        addLog(`AI_ERROR: Final report generation failed.`);
    }
  }, [selectedPersona, trainingGoal, addLog, isVoiceEnabled, speakInsight]);

  const requestAiInsight = async (summary: MinuteSummary) => {
    const personaIdentity = PERSONAS[selectedPersona] || PERSONAS["AetherAegis"];
    
    // Construct GOAL context including Mission Profile if available
    let goalContext = trainingGoal;
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
      addLog(`AI_REQUEST: Analyzing for goal: "${trainingGoal}" as "${selectedPersona}"...`);
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

      // Trigger TTS if enabled
      if (isVoiceEnabled) {
        speakInsight(insight);
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

  }, [addLog, trainingGoal, isVoiceEnabled, selectedPersona, speakInsight, generateSessionSummary]);

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
    localStorage.setItem(STORAGE_KEYS.GOAL, trainingGoal);
    localStorage.setItem(STORAGE_KEYS.VOICE, String(isVoiceEnabled));
    localStorage.setItem(STORAGE_KEYS.VOICE_NAME, selectedVoice);
    localStorage.setItem(STORAGE_KEYS.PERSONA, selectedPersona);
    
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
  }, [connect, addLog, wsUrl, deviceIdHex, age, trainingGoal, isVoiceEnabled, selectedVoice, selectedPersona]);

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
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Training Objective</label>
                <select value={trainingGoal} onChange={(e) => setTrainingGoal(e.target.value)} className="bg-black border border-white/10 text-cyan-400 font-mono text-xs px-3 py-1.5 focus:outline-none focus:border-cyan-400/50 transition-colors appearance-none cursor-pointer">
                  {TRAINING_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
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
                <input type="text" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} placeholder="ws://192.168.1.X:8765" className="bg-black border border-white/10 text-blue-400 font-mono text-xs px-3 py-1.5 w-56 focus:outline-none focus:border-blue-400/50 transition-colors" />
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

        {isFullScreen && (
          <button 
            onClick={() => setIsFullScreen(false)}
            className="fixed bottom-8 right-8 z-[60] px-4 py-2 border border-white/20 text-slate-400 hover:text-white hover:border-white/50 rounded-sm text-xs font-bold uppercase tracking-widest bg-black/50 backdrop-blur-md transition-all"
          >
            Restore View
          </button>
        )}

        <div className={`grid grid-cols-1 ${!isFullScreen ? 'xl:grid-cols-4 gap-8 items-start' : 'h-[85vh] w-full'}`}>
          <div className={`${!isFullScreen ? 'xl:col-span-1 space-y-8' : 'w-full h-full'} transition-all duration-500`}>
            <HeartRateDisplay hr={currentHR} zone={currentZone} elapsedTime={elapsedTime} />
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
      <footer className="mt-auto py-8 text-center text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold">AetherAegis Biometric Monitoring Suite // v5.10.0-ReConnect.8765</footer>
    </div>
  );
};

export default App;