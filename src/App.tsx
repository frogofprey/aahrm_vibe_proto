import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { ConnectionStatus, HeartRateData, ZoneConfig, MinuteSummary, TokenUsage, SessionContext, SessionState, PersonaConfig } from './types';
import DashboardHeader from './components/DashboardHeader';
import HeartRateDisplay from './components/HeartRateDisplay';
import HeartRateChart from './components/HeartRateChart';
import StatusBadge from './components/StatusBadge';
import DebugLog from './components/DebugLog';
import AggregatorPanel from './components/AggregatorPanel';
import { personalityData } from './personality';
import { TRAINING_OBJECTIVES } from './training_objectives';

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

function formatMMSS(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// --- Text Cleaning Utility ---
function cleanInsightText(text: string): string {
  // Removes "Score: [X] | " or "Score: X | " prefix case-insensitively
  // AND removes any trailing [debug info] blocks in brackets
  return text
    .replace(/^Score:\s*\[?[\d.]+\]?\s*\|\s*/i, '')
    .replace(/(\s*\[[^\]]*\]\s*)+$/, '')
    .trim();
}

// --- Token Usage Extraction Utility ---
function extractUsage(response: any): TokenUsage | undefined {
    if (response.usageMetadata) {
        return {
            input: response.usageMetadata.promptTokenCount || 0,
            output: response.usageMetadata.candidatesTokenCount || 0,
            total: response.usageMetadata.totalTokenCount || 0
        };
    }
    return undefined;
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
  GENDER: 'aetheraegis_subject_gender',
  GOAL: 'aetheraegis_training_goal',
  DURATION: 'aetheraegis_session_duration',
  VOICE: 'aetheraegis_voice_enabled',
  PERSONA: 'aetheraegis_ai_persona',
  CHATTINESS: 'aetheraegis_chattiness',
  SHOW_SYS: 'aetheraegis_show_sys_logs',
  SHOW_USER: 'aetheraegis_show_user_logs',
  ABSTRACTION: 'aetheraegis_telemetry_abstraction'
};

const MAX_DATA_POINTS = 50;
const MAX_LOG_ENTRIES = 100;
const HR_MIN_VALID = 40;
const HR_MAX_VALID = 220;

const PERSONA_CONFIG: Record<string, PersonaConfig> = personalityData;

const TELEMETRY_ABSTRACTION_INSTRUCTION = `Telemetry Abstraction: Do NOT recite raw BPM values (e.g., "145 bpm") unless critically necessary for safety (Score 7+). Instead, use qualitative descriptors appropriate for your personality and the mission.`;

const BASE_SYSTEM_INSTRUCTION = `
Data Input: You will receive "Minute Packets" containing an array of raw BPM samples, an average, and a Max/Min.
Core Constraints:
PII Isolation: Do not attempt to guess the user's age or identity. Use the provided "Zone" context as the absolute truth for intensity.
Signal Noise: Prioritize trends over individual samples.
{{TELEMETRY_CONSTRAINT}}
Anti-Repetition: Review [HISTORY] and [MID-TERM CONTEXT] before writing. Vary on three levels: (1) sentence structure — avoid defaulting to the same grammatical frame across consecutive responses; (2) metaphor clusters — retire any concept (not just term) used in the last 3 responses, even if expressed with different words; (3) catchphrases — signature tics defined in the persona profile are permitted; other repeated phrases should be used sparingly. Suspended for critical safety warnings (Score 7+).
Corrections: the input telemetry will show you the users current heart rate and past trends. Provide the user instructions to move their heart rate to the target zone by giving clear instructions in character to slow down, speed up or maintain current pace. Be very clear and highlight cases where the heart rate is above the specified redline or maximum heart rate (MHR) Note that target heart rates may change depending on the state of the session. If the user is more than one zone away from the target, increase the urgency of the instruction. 
Milestones: Narrative Milestones are noted by a time tag and a narrative block (0:00 [Instance Loading]) followed by flavor text you can use to increase immersion. Use the active_time provided in the message to note when a narrative milestone is relevant to the current update. The milestone should only be noted when the current active_time exactly matches the time in the narrative block, but subsequent updates can still use it for flavor or immersion. The milestone should be clear to the user and in character. Do not attempt to create new milestones. If a milestone is relevant for this update, then put the tag from the brackets [] at the end of the message (debug). 
Goal: The current state is shown in the objective block. Be sure to remark on state changes when appropriate. In general an update will consiste of a Correction followed by a Milestone if the active_time matches the narrative milestone exactly. If both are relevant the correction should come first and be clear to the user and then be followed by a milestone update. If a milestone is relevant for this update, ensure that the nature of the milestone is made extremely clear to the user - use a separate sentence to enforce this. Ensure that pace steering advice is not contradicted by milestone updates.  
Mission Plan: {{GOAL}}
Context Usage: You will receive an [OBJECTIVE STATUS TRACKER] and [CURRENT SESSION STATE]. These are purely contextual inputs for your awareness. DO NOT recite these stats in your output. Use them only to calibrate your motivational tone (e.g., if behind, encourage; if ahead, praise).
Saliency Scoring: At the end of every analysis, provide a Saliency Score (1-10) based on the urgency or novelty of the data.
1-3: Routine data, no significant change. The user is in the target zone and no corrections or mission milestones are relevant. 
4-6: Notable trend shift or minor zone boundary approach. Any mission milestones should be rated a minimum of 6 in order to ensure that the user will hear them. User is under target zone and needs instruction to increase towards the target. Reserve score 6 for narrative only updates. 
7-10: Critical breach or safety alert. The user is well over the target zone, the score should reach 10 if the user has exceeded his MHR for more than 10 seconds. 
Output format: Score: [X] | [Analysis Text]
STRICT FORMATTING: Your response MUST start with "Score: [X] |". Do not include any other text, markdown, or headers before this.
`;

const App: React.FC = () => {
  // --- Persistent State Initialization ---
  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.WS) || ENV_WS_URL);
  const [deviceIdHex, setDeviceIdHex] = useState(() => localStorage.getItem(STORAGE_KEYS.HEX) || ENV_DEVICE_HEX);
  const [age, setAge] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.AGE) || String(ENV_DEFAULT_AGE)));
  const [weight, setWeight] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.WEIGHT) || String(ENV_DEFAULT_WEIGHT)));
  const [gender, setGender] = useState(() => localStorage.getItem(STORAGE_KEYS.GENDER) || 'Male');
  const [trainingGoal, setTrainingGoal] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.GOAL);
    const exists = TRAINING_OBJECTIVES.some(o => o.title === stored);
    return exists ? stored! : TRAINING_OBJECTIVES[1].title; // Default to "Low Intensity Weight Loss"
  });
  
  // Session Objectives
  const [sessionDurationGoal, setSessionDurationGoal] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.DURATION) || String(ENV_DEFAULT_DURATION)));

  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.VOICE) === 'true');
  // Default to Arlie if stored persona is invalid or missing
  const [selectedPersona, setSelectedPersona] = useState(() => {
      const stored = localStorage.getItem(STORAGE_KEYS.PERSONA);
      return (stored && PERSONA_CONFIG[stored]) ? stored : 'Arlie';
  });
  const [chattiness, setChattiness] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.CHATTINESS) || String(ENV_DEFAULT_CHATTINESS)));
  
  // New: Telemetry Abstraction Setting
  const [isTelemetryAbstractionEnabled, setIsTelemetryAbstractionEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.ABSTRACTION) !== 'false');

  // Log Filtering State
  const [showSystemLogs, setShowSystemLogs] = useState(() => localStorage.getItem(STORAGE_KEYS.SHOW_SYS) !== 'false');
  const [showUserLogs, setShowUserLogs] = useState(() => localStorage.getItem(STORAGE_KEYS.SHOW_USER) !== 'false');

  // Resolve full objective object
  const currentObjective = useMemo(() => 
    TRAINING_OBJECTIVES.find(o => o.title === trainingGoal) || TRAINING_OBJECTIVES[1]
  , [trainingGoal]);

  // --- Session & Timer State ---
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentSessionState, setCurrentSessionState] = useState<SessionState>(SessionState.IDLE);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const [activeTime, setActiveTime] = useState("00:00");
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [introText, setIntroText] = useState<string | null>(null);
  const [finalReportText, setFinalReportText] = useState<string | null>(null);

  const [dataPoints, setDataPoints] = useState<HeartRateData[]>([]);
  const [currentHR, setCurrentHR] = useState<number | null>(null);
  const [hrTrend, setHrTrend] = useState<string>("Stable");
  const hrHistoryRef = useRef<{ hr: number; timestamp: number }[]>([]);
  const smoothedHRRef = useRef<number | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<{ id: number; message: string; timestamp: string }[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const [showRawTelemetry, setShowRawTelemetry] = useState(false);
  
  const [summaries, setSummaries] = useState<MinuteSummary[]>([]);
  const [intervalCount, setIntervalCount] = useState(0);
  
  // Refs
  const currentMinuteRef = useRef<number[]>([]);
  const lastUpdateWallTimeRef = useRef<number>(0);
  const nextActiveTargetRef = useRef<number>(60000);
  const wsRef = useRef<WebSocket | null>(null);
  const logIdRef = useRef(0);
  const sessionActiveRef = useRef(isSessionActive); // Mirror for WS callback
  const currentSessionStateRef = useRef(currentSessionState);
  
  // Objective Time Ref (Only increments in performance states)
  const performanceDurationRef = useRef(0);
  const activeDurationRef = useRef(0);
  const hasStartedActiveRef = useRef(false);
  const lastPerformanceTickRef = useRef<number>(0);
  const pendingAiMarkerRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);
  
  // Session Metrics Refs
  const runningMetricsRef = useRef<{ heartPoints: number; calories: number; compliantMinutes: number; performanceMinutes: number }>({ heartPoints: 0, calories: 0, compliantMinutes: 0, performanceMinutes: 0 });
  
  // Hysteresis Refs
  const transitionTimersRef = useRef<{ 
      warmupToMain: number | null; 
      mainToPause: number | null;
      pauseToMain: number | null;
      bonusToRecovery: number | null; 
  }>({ 
      warmupToMain: null, 
      mainToPause: null,
      pauseToMain: null,
      bonusToRecovery: null 
  });

  // State Tracking Refs (Frame-based)
  const sessionStatesInFrameRef = useRef<Set<SessionState>>(new Set());
  
  // Session Logging Ref (Stores full history for file export)
  const allSessionSummariesRef = useRef<MinuteSummary[]>([]);
  const sessionTransitionsRef = useRef<{ timestamp: string; message: string }[]>([]); // New Transition Log Ref

  const sessionIntroRef = useRef<{ prompt: string; text: string; tokenUsage?: TokenUsage } | null>(null);
  const missionProfileRef = useRef<{ prompt: string; text: string; tokenUsage?: TokenUsage } | null>(null);
  const narrativeMissionPlanRef = useRef<{ prompt: string; text: string; tokenUsage?: TokenUsage } | null>(null);
  const currentSessionContextRef = useRef<SessionContext | null>(null); // Mid-term memory storage
  const finalSessionReportRef = useRef<{ prompt: string; text: string; tokenUsage?: TokenUsage } | null>(null); // Final report storage
  
  // Audio Context & Queue Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isAudioPlayingRef = useRef<boolean>(false);
  const activeSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const processAudioQueueRef = useRef<() => void>(() => {});

  // Sync ref
  useEffect(() => { sessionActiveRef.current = isSessionActive; }, [isSessionActive]);
  useEffect(() => { currentSessionStateRef.current = currentSessionState; }, [currentSessionState]);

  // Frame State Tracking Effect
  useEffect(() => {
    if (isSessionActive) {
      sessionStatesInFrameRef.current.add(currentSessionState);
    }
  }, [currentSessionState, isSessionActive]);

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

  // --- Logging Utility ---
  const addLog = useCallback((message: string) => {
    setLogs((prev) => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const msStr = String(now.getMilliseconds()).padStart(3, '0');
      const newLog = { id: ++logIdRef.current, message, timestamp: `${timeStr}.${msStr}` };
      return [newLog, ...prev].slice(0, MAX_LOG_ENTRIES);
    });
  }, []);

  // --- State Transition Helper ---
  const transitionState = useCallback((newState: SessionState, reason: string) => {
    if (newState !== currentSessionStateRef.current) {
        const timestamp = new Date().toLocaleTimeString();
        const msg = `${currentSessionStateRef.current} -> ${newState} | Reason: ${reason}`;
        
        // Log to transition history for Final Report
        sessionTransitionsRef.current.push({ timestamp, message: msg });
        
        // Log to System Console
        addLog(`STATE_CHANGE: ${msg}`);
        
        // Trigger Active Timer on first transition to MAIN_ACTIVE
        if (newState === SessionState.MAIN_ACTIVE && !hasStartedActiveRef.current) {
            hasStartedActiveRef.current = true;
            nextActiveTargetRef.current = 0; // Trigger immediate update at 0:00 active time (respecting 30s cooldown)
            addLog(`SYSTEM: Active Timer Engaged.`);
        }

        // Interval State Strategy: Increment count on MAIN_ACTIVE -> RECOVERY
        const strategy = (currentObjective as any).transitionStrategy || "normal state";
        if (strategy === "interval state") {
            if (currentSessionStateRef.current === SessionState.MAIN_ACTIVE && newState === SessionState.RECOVERY) {
                setIntervalCount(prev => prev + 1);
                addLog(`SYSTEM: Interval ${intervalCount + 1} completed.`);
            }
        }

        // Update Actual State
        currentSessionStateRef.current = newState;
        setCurrentSessionState(newState);
    }
  }, [addLog, currentObjective, intervalCount]);

  // --- State Machine Logic ---
  const updateSessionState = useCallback((currentBPM: number | null) => {
      // 1. Connection/System Level Errors override everything
      if (status === ConnectionStatus.ERROR) {
          transitionState(SessionState.ERROR, "System Connection Error");
          return;
      }

      // 2. Idle check
      if (!isSessionActive) {
          transitionState(SessionState.IDLE, "Session Deactivated");
          return;
      }

      // 3. Initialize Strategy
      const strategy = (currentObjective as any).transitionStrategy || "normal state";
      const isFixed = strategy.startsWith("fixed state");
      
      // 4. Initialization Phase
      // If we don't have a mission profile yet, we are technically in INIT
      if (!missionProfileRef.current) {
          transitionState(SessionState.INIT, "Pending Mission Profile");
          return;
      }

      // 5. Fixed Strategy Logic
      if (isFixed) {
          // Parse target state, defaulting to MAIN_ACTIVE
          let targetState = SessionState.MAIN_ACTIVE;
          if (strategy.includes("MAIN_ACTIVE")) targetState = SessionState.MAIN_ACTIVE;
          
          // Brief buffer to allow INIT to resolve visually
          if (sessionStartTime && (Date.now() - sessionStartTime) < 5000) {
              transitionState(SessionState.INIT, "Initial Buffer (Fixed Strategy)");
          } else {
              transitionState(targetState, "Fixed Strategy Protocol");
          }
          return;
      }

      // 6. Interval Strategy Logic
      if (strategy === "interval state") {
          const now = Date.now();
          const elapsedMs = now - (sessionStartTime || now);
          const elapsedMinutes = elapsedMs / 60000;
          
          let targetMinBPM = 999;
          if (currentObjective.targetZones.length > 0) {
              const minZoneIdx = Math.min(...currentObjective.targetZones);
              const zone = minZoneIdx > 0 ? zones[minZoneIdx - 1] : zones[0];
              if (zone) targetMinBPM = zone.min;
          }

          if (currentSessionState === SessionState.INIT || currentSessionState === SessionState.WARMUP) {
              // Warmup to Main Active
              const isWarmupComplete = elapsedMinutes >= 2.0 || (currentBPM || 0) >= targetMinBPM;
              if (isWarmupComplete) {
                  if (!transitionTimersRef.current.warmupToMain) {
                      transitionTimersRef.current.warmupToMain = now;
                  } else if (now - transitionTimersRef.current.warmupToMain > 5000) {
                      transitionState(SessionState.MAIN_ACTIVE, "Warmup targets met (Interval Strategy)");
                      transitionTimersRef.current.warmupToMain = null;
                  }
              } else {
                  transitionTimersRef.current.warmupToMain = null;
                  if (currentSessionState === SessionState.INIT && elapsedMinutes > 0.1) {
                      transitionState(SessionState.WARMUP, "Initialization complete");
                  }
              }
          } else if (currentSessionState === SessionState.MAIN_ACTIVE) {
              // Main Active to Recovery (Valley)
              const isDrop = (currentBPM || 0) < targetMinBPM;
              if (isDrop) {
                  if (!transitionTimersRef.current.mainToPause) {
                      transitionTimersRef.current.mainToPause = now;
                  } else if (now - transitionTimersRef.current.mainToPause > 10000) { // 10s debounce for interval drop
                      transitionState(SessionState.RECOVERY, "HR below target (Interval Valley)");
                      transitionTimersRef.current.mainToPause = null;
                  }
              } else {
                  transitionTimersRef.current.mainToPause = null;
              }
          } else if (currentSessionState === SessionState.RECOVERY) {
              // Recovery to Main Active (Spike)
              const isSpike = (currentBPM || 0) >= targetMinBPM;
              if (isSpike) {
                  if (!transitionTimersRef.current.pauseToMain) {
                      transitionTimersRef.current.pauseToMain = now;
                  } else if (now - transitionTimersRef.current.pauseToMain > 5000) {
                      transitionState(SessionState.MAIN_ACTIVE, "HR recovered to target (Interval Spike)");
                      transitionTimersRef.current.pauseToMain = null;
                  }
              } else {
                  transitionTimersRef.current.pauseToMain = null;
              }
          }
          return;
      }

      // 7. Normal Strategy Logic
      // Calculations
      const now = Date.now();
      const elapsedMs = now - (sessionStartTime || now);
      const elapsedMinutes = elapsedMs / 60000;
      
      // Determine Target Minimum BPM based on Objective
      // Using zones array and targetZones indices from objective
      let targetMinBPM = 999;
      if (currentObjective.targetZones.length > 0) {
          const minZoneIdx = Math.min(...currentObjective.targetZones);
          // Adjust for 1-based indexing in objective vs 0-based in zones array
          const zone = minZoneIdx > 0 ? zones[minZoneIdx - 1] : zones[0];
          if (zone) {
              targetMinBPM = zone.min;
          }
      } else {
          // Fallback if no specific zones (e.g. Wellness zone 0-1)
          targetMinBPM = zones[1].min; // Zone 2 start
      }

      // GOAL CHECK
      // Use performance duration (time in MAIN_ACTIVE/BONUS_ACTIVE) instead of wall clock time
      const performanceMinutes = performanceDurationRef.current / 60000;
      const goalsMet = performanceMinutes >= sessionDurationGoal;

      // We are in the "Active Workout" phase if goals aren't met, 
      // OR if we are still in WARMUP/INIT (we must finish warmup before considering goals met for state transitions)
      const isWorkoutActive = !goalsMet || currentSessionState === SessionState.WARMUP || currentSessionState === SessionState.INIT;

      if (isWorkoutActive) {
          // --- Main Workout Phase (Goals Not Met Yet or Warming Up) ---
          
          if (currentSessionState === SessionState.WARMUP || currentSessionState === SessionState.INIT) {
              // Transition Trigger: Time > 2.0 OR HR >= TargetMin
              const isWarmupComplete = elapsedMinutes >= 2.0 || (currentBPM || 0) >= targetMinBPM;

              if (isWarmupComplete) {
                   // Start Debounce
                   if (!transitionTimersRef.current.warmupToMain) {
                       transitionTimersRef.current.warmupToMain = now;
                   } else if (now - transitionTimersRef.current.warmupToMain > 5000) {
                       // Confirm Transition
                       transitionState(SessionState.MAIN_ACTIVE, "Warmup targets met (Duration or HR)");
                       transitionTimersRef.current.warmupToMain = null;
                   }
              } else {
                   // Conditions lost (e.g. HR dropped back down before 2 mins)
                   transitionTimersRef.current.warmupToMain = null;
                   // Ensure we stay in WARMUP unless we are INIT
                   if (currentSessionState !== SessionState.WARMUP && currentSessionState !== SessionState.INIT) {
                       transitionState(SessionState.WARMUP, "Conditions lost");
                   } else if (currentSessionState === SessionState.INIT && elapsedMinutes > 0.1) {
                       // Move INIT to WARMUP quickly
                       transitionState(SessionState.WARMUP, "Initialization complete");
                   }
              }
          }
          else if (currentSessionState === SessionState.MAIN_ACTIVE) {
              // Check for Drop to PAUSE
              // Higher values (>= TargetMin) are compliant. Lower values (< TargetMin) trigger Pause.
              const isDrop = (currentBPM || 0) < targetMinBPM;
              
              if (isDrop) {
                  if (!transitionTimersRef.current.mainToPause) {
                      transitionTimersRef.current.mainToPause = now;
                  } else if (now - transitionTimersRef.current.mainToPause > 30000) { // Changed to 30s
                      transitionState(SessionState.PAUSE, "HR below target for 30s");
                      transitionTimersRef.current.mainToPause = null;
                  }
              } else {
                  transitionTimersRef.current.mainToPause = null;
              }
          }
          else if (currentSessionState === SessionState.PAUSE) {
              // Check for Return to MAIN_ACTIVE
              const isRecovery = (currentBPM || 0) >= targetMinBPM;

              if (isRecovery) {
                  if (!transitionTimersRef.current.pauseToMain) {
                      transitionTimersRef.current.pauseToMain = now;
                  } else if (now - transitionTimersRef.current.pauseToMain > 5000) {
                      transitionState(SessionState.MAIN_ACTIVE, "HR recovered to target");
                      transitionTimersRef.current.pauseToMain = null;
                  }
              } else {
                  transitionTimersRef.current.pauseToMain = null;
              }
          }

      } else {
          // --- Goals Met Phase (Post-Workout / Bonus) ---
          
          const isRecoveryCondition = (currentBPM || 0) < targetMinBPM;

          if (currentSessionState === SessionState.BONUS_ACTIVE || currentSessionState === SessionState.MAIN_ACTIVE || currentSessionState === SessionState.PAUSE) {
              if (isRecoveryCondition) {
                  // Candidate for RECOVERY. Check Hysteresis.
                  if (!transitionTimersRef.current.bonusToRecovery) {
                      transitionTimersRef.current.bonusToRecovery = now;
                  } else if (now - transitionTimersRef.current.bonusToRecovery > 5000) {
                      transitionState(SessionState.RECOVERY, "Goals met, HR cooling down");
                      transitionTimersRef.current.bonusToRecovery = null;
                  }
              } else {
                  // Staying Active/Bonus
                  transitionTimersRef.current.bonusToRecovery = null;
                  if (currentSessionState !== SessionState.BONUS_ACTIVE) {
                      transitionState(SessionState.BONUS_ACTIVE, "Goals met, HR maintaining target");
                  }
              }
          } else {
               // Currently RECOVERY
               if (!isRecoveryCondition) {
                   // Instant jump to BONUS_ACTIVE
                   transitionState(SessionState.BONUS_ACTIVE, "HR spiked above recovery ceiling");
                   transitionTimersRef.current.bonusToRecovery = null;
               } else {
                   // Staying Recovery
                   transitionTimersRef.current.bonusToRecovery = null;
                   if (currentSessionState !== SessionState.RECOVERY) {
                       transitionState(SessionState.RECOVERY, "Recovery logic fallback");
                   }
               }
          }
      }

  }, [isSessionActive, status, currentObjective, sessionStartTime, zones, sessionDurationGoal, currentSessionState, transitionState]);

  // Performance Duration Timer (Web Worker based to prevent background throttling)
  useEffect(() => {
    if (isSessionActive) {
        // Create worker blob for a reliable background timer
        const workerCode = `
            let timer = null;
            self.onmessage = function(e) {
                if (e.data === 'start') {
                    if (timer) clearInterval(timer);
                    timer = setInterval(() => {
                        self.postMessage('tick');
                    }, 100);
                } else if (e.data === 'stop') {
                    if (timer) clearInterval(timer);
                    timer = null;
                }
            };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);
        workerRef.current = worker;

        lastPerformanceTickRef.current = Date.now();
        
        worker.onmessage = () => {
            const now = Date.now();
            const delta = now - lastPerformanceTickRef.current;
            lastPerformanceTickRef.current = now;
            
            // Only increment active performance time if in valid states (MAIN_ACTIVE, BONUS_ACTIVE)
            if (currentSessionState === SessionState.MAIN_ACTIVE || currentSessionState === SessionState.BONUS_ACTIVE) {
                performanceDurationRef.current += delta;
            }

            // Active Timer: Accumulate time when active and not paused
            if (hasStartedActiveRef.current && currentSessionState !== SessionState.PAUSE) {
                activeDurationRef.current += delta;
            }

            // --- AI SYNC TRIGGER LOGIC (High Resolution) ---
            let isAiTrigger = false;
            const timeSinceLastUpdate = now - lastUpdateWallTimeRef.current;
            const currentActiveTime = activeDurationRef.current;

            if (hasStartedActiveRef.current) {
                // Active mode: follow active clock targets ONLY
                if (currentActiveTime >= nextActiveTargetRef.current) {
                    isAiTrigger = true;
                }
            } else {
                // Pre-active: follow wall clock
                if (timeSinceLastUpdate >= 60000) {
                    isAiTrigger = true;
                }
            }

            // Safety: Never fire more than once every 30 seconds
            if (isAiTrigger && timeSinceLastUpdate < 30000) {
                if (showSystemLogs && isAiTrigger) {
                    addLog(`DEBUG: AI Update suppressed (Cooldown: ${Math.round(timeSinceLastUpdate/1000)}s)`);
                }
                isAiTrigger = false;
            }

            // Only trigger if we have data to analyze
            if (isAiTrigger) {
                const hasData = currentMinuteRef.current.length > 0;
                lastUpdateWallTimeRef.current = now;
                // Advance active target if we are in active mode
                if (hasStartedActiveRef.current) {
                    nextActiveTargetRef.current = (Math.floor(currentActiveTime / 60000) + 1) * 60000;
                }
                
                // Trigger calculation and AI call if we have data
                if (hasData && calcRef.current) {
                    pendingAiMarkerRef.current = true;
                    calcRef.current();
                }
            }
        };

        worker.postMessage('start');

        return () => {
            worker.postMessage('stop');
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
            workerRef.current = null;
        };
    }
  }, [isSessionActive, currentSessionState]);

  // Wall Clock Timer Effect
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isSessionActive && sessionStartTime) {
      interval = setInterval(() => {
        setElapsedTime(formatDuration(Date.now() - sessionStartTime));
        if (hasStartedActiveRef.current) {
            setActiveTime(formatMMSS(activeDurationRef.current));
        } else {
            setActiveTime("00:00");
        }
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

    // Calculate Final Metric Totals - Using Running Metrics (Gated) instead of raw sum
    const totalPoints = runningMetricsRef.current.heartPoints;
    const totalCalories = runningMetricsRef.current.calories;
    // For compliance calculation in log, use active performance minutes as denominator
    const performanceMinutes = runningMetricsRef.current.performanceMinutes;
    // Total duration is all buckets
    const totalDurationMinutes = allSessionSummariesRef.current.length;
    
    // Construct relevant objective line
    const activeObjectiveStr = `Time ${sessionDurationGoal}m`;

    // --- FILE 1: FULL DEBUG LOG ---
    const filenameDebug = `session_${yyyy}${mm}${dd}${hh}${min}.txt`;
    let contentDebug = `AETHER AEGIS // SESSION LOG\n`;
    contentDebug += `Generated: ${now.toLocaleString()}\n`;
    contentDebug += `Subject Age: ${age}\n`;
    contentDebug += `Subject Weight: ${weight} lbs\n`;
    contentDebug += `Subject Gender: ${gender}\n`;
    contentDebug += `Training Goal: ${currentObjective.title}\n`;
    contentDebug += `Strategy: ${(currentObjective as any).transitionStrategy}\n`;
    contentDebug += `OBJECTIVES: ${activeObjectiveStr}\n`;
    contentDebug += `TOTAL CALORIES BURNED: ${totalCalories.toFixed(1)} kcal\n`;
    contentDebug += `TOTAL HEART POINTS: ${totalPoints}\n`;
    contentDebug += `ZONE COMPLIANCE: ${runningMetricsRef.current.compliantMinutes.toFixed(1)}/${performanceMinutes.toFixed(1)} active minutes (Total Wall Time: ${totalDurationMinutes}m)\n`;
    contentDebug += `Device ID: ${deviceIdHex}\n`;
    contentDebug += `Personality: ${selectedPersona}\n`;
    contentDebug += `Voice Profile: ${PERSONA_CONFIG[selectedPersona].voiceName}\n`;
    contentDebug += `Voice Threshold (Chattiness): ${chattiness}\n`;
    contentDebug += `Telemetry Abstraction: ${isTelemetryAbstractionEnabled}\n`;
    
    if (finalSessionReportRef.current) {
        contentDebug += `Final Session Report: ${finalSessionReportRef.current.text}\n`;
        if (finalSessionReportRef.current.tokenUsage) {
            const u = finalSessionReportRef.current.tokenUsage;
            contentDebug += `[Tokens: In ${u.input} / Out ${u.output} / Tot ${u.total}]\n`;
        }
    }

    contentDebug += `--------------------------------------------------\n`;
    
    contentDebug += `[STATE TRANSITION HISTORY]\n`;
    if (sessionTransitionsRef.current.length > 0) {
        sessionTransitionsRef.current.forEach(t => {
            contentDebug += `[${t.timestamp}] ${t.message}\n`;
        });
    } else {
        contentDebug += `No transitions recorded.\n`;
    }
    contentDebug += `--------------------------------------------------\n\n`;

    if (missionProfileRef.current) {
        contentDebug += `[MISSION PROFILE]\n`;
        contentDebug += `Prompt: ${missionProfileRef.current.prompt}\n`;
        contentDebug += `Response: ${missionProfileRef.current.text}\n`;
        if (missionProfileRef.current.tokenUsage) {
            const u = missionProfileRef.current.tokenUsage;
            contentDebug += `[Tokens: In ${u.input} / Out ${u.output} / Tot ${u.total}]\n`;
        }
        contentDebug += `--------------------------------------------------\n\n`;
    }

    if (narrativeMissionPlanRef.current) {
        contentDebug += `[NARRATIVE MISSION PLAN]\n`;
        contentDebug += `Prompt: ${narrativeMissionPlanRef.current.prompt}\n`;
        contentDebug += `Response: ${narrativeMissionPlanRef.current.text}\n`;
        if (narrativeMissionPlanRef.current.tokenUsage) {
            const u = narrativeMissionPlanRef.current.tokenUsage;
            contentDebug += `[Tokens: In ${u.input} / Out ${u.output} / Tot ${u.total}]\n`;
        }
        contentDebug += `--------------------------------------------------\n\n`;
    }

    if (sessionIntroRef.current) {
        contentDebug += `[SESSION INTRO]\n`;
        contentDebug += `Prompt: ${sessionIntroRef.current.prompt}\n`;
        contentDebug += `Response: ${sessionIntroRef.current.text}\n`;
        if (sessionIntroRef.current.tokenUsage) {
            const u = sessionIntroRef.current.tokenUsage;
            contentDebug += `[Tokens: In ${u.input} / Out ${u.output} / Tot ${u.total}]\n`;
        }
        contentDebug += `--------------------------------------------------\n\n`;
    }
  
    if (allSessionSummariesRef.current.length === 0) {
      contentDebug += `[NO DATA PACKETS RECORDED]\n`;
    } else {
      allSessionSummariesRef.current.forEach((s, index) => {
        contentDebug += `[PACKET #${index + 1} | ${s.timestamp}]\n`;
        contentDebug += `   > STATE      : ${s.sessionState || "N/A"}\n`;
        contentDebug += `   > HEART RATE : Avg ${s.avg} | Max ${s.max} | Min ${s.min} (Samples: ${s.sampleCount})\n`;
        contentDebug += `   > METRICS    : ${s.calories.toFixed(1)} kcal | ${s.heartPoints} HP\n`;
        if (s.sessionContextSummary) {
            contentDebug += `   > SESSION CONTEXT (Mid-Term Memory) : ${s.sessionContextSummary.text}\n`;
            contentDebug += `     [Context Prompt]: \n${s.sessionContextSummary.prompt}\n`;
            if (s.sessionContextSummary.tokenUsage) {
               const u = s.sessionContextSummary.tokenUsage;
               contentDebug += `     [Context Tokens]: In ${u.input} / Out ${u.output} / Tot ${u.total}\n`;
            }
        }
        contentDebug += `   > AI PROMPT : \n${s.prompt || "N/A"}\n`;
        contentDebug += `   > AI ANALYST : ${s.insight || "Analysis pending or failed."}\n`;
        if (s.tokenUsage) {
            contentDebug += `   > TOKENS     : In ${s.tokenUsage.input} | Out ${s.tokenUsage.output} | Tot ${s.tokenUsage.total}\n`;
        }
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
    contentUser += `Objectives: ${activeObjectiveStr}\n`;
    contentUser += `Total Calories: ${totalCalories.toFixed(1)} kcal\n`;
    contentUser += `Total Heart Points: ${totalPoints}\n`;
    contentUser += `Zone Compliance: ${runningMetricsRef.current.compliantMinutes.toFixed(1)}/${performanceMinutes.toFixed(1)} active minutes\n`;
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
            contentUser += `Metrics: ${s.calories.toFixed(1)} kcal, ${s.heartPoints} HP\n`;
            contentUser += `State: ${s.sessionState}\n`;
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
  }, [age, weight, gender, currentObjective, sessionDurationGoal, deviceIdHex, selectedPersona, chattiness, isTelemetryAbstractionEnabled, addLog]);

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

  // --- AI Call Retry Helper ---
  const generateContentWithRetry = useCallback(async (model: string, contents: any, config: any, maxRetries: number, logPrefix: string) => {
      let attempt = 0;
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

      while (true) {
          try {
              return await ai.models.generateContent({ model, contents, config });
          } catch (e: any) {
              const errStr = String(e);
              // Fast fail on client errors
              if (errStr.includes('400') || errStr.includes('401') || errStr.includes('403') || errStr.includes('429') || errStr.includes('ResourceExhausted')) {
                  throw e;
              }
              
              if (attempt >= maxRetries) throw e;
              
              attempt++;
              addLog(`${logPrefix}: 5xx/Network Error. Retrying (${attempt}/${maxRetries})...`);
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
      }
  }, [addLog]);

  const speakInsight = useCallback(async (text: string, saliencyScore?: number) => {
    if (!isVoiceEnabled) return;
    
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const voiceName = personaConfig.voiceName;
    
    // Select TTS instruction based on saliency score
    let ttsInstruction = personaConfig.tts46Instruction; // Default to mid-range
    if (saliencyScore !== undefined) {
        if (saliencyScore >= 7) ttsInstruction = personaConfig.tts70Instruction;
        else if (saliencyScore >= 4) ttsInstruction = personaConfig.tts46Instruction;
        else if (saliencyScore >= 1) ttsInstruction = personaConfig.tts13Instruction;
    }

    const maxRetries = 1; // Total attempts = 1 initial + 1 retry
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        const isRetry = attempt > 0;
        addLog(`VOICE: Synthesizing insight via Gemini TTS (${voiceName})...${isRetry ? ` (Attempt ${attempt + 1})` : ''}`);
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: `${ttsInstruction} ${text}` }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName },
              },
            },
          },
        });
        
        // Log token usage for TTS if available
        const tokenUsage = extractUsage(response);
        if (tokenUsage) {
            addLog(`VOICE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}]`);
        }

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
  }, [isVoiceEnabled, selectedPersona, addLog, processAudioQueue]);

  const generateMissionProfile = useCallback(async (): Promise<string> => {
    const mhr = 220 - age;
    const buffWidth = 5;
    
    // Determine active session length for TIZ calculation
    const sessionLength = sessionDurationGoal;

    const minTizMins = Math.round(0.8 * sessionLength);
    const maxVarMins = sessionLength - minTizMins;

    const z1_min = Math.round(mhr * 0.5);
    const z1_max = Math.round(mhr * 0.6);
    const z2_min = Math.round(mhr * 0.6);
    const z2_max = Math.round(mhr * 0.7);
    const z3_min = Math.round(mhr * 0.7);
    const z3_max = Math.round(mhr * 0.8);
    const z4_min = Math.round(mhr * 0.8);
    const z4_max = Math.round(mhr * 0.9);
    const z5_min = Math.round(mhr * 0.9);
    const z5_max = mhr;

    // Determine target bounds for buffer
    // targetZones are 1-indexed in the objective definition (e.g. [2] for Zone 2)
    const targetZoneIndices = currentObjective.targetZones.map(z => z - 1);
    const targetMin = Math.min(...targetZoneIndices.map(i => zones[i].min));
    const targetMax = Math.max(...targetZoneIndices.map(i => zones[i].max));
    
    const buffMin = Math.round(targetMin - buffWidth);
    const buffMax = targetMax === Infinity ? mhr : Math.round(targetMax + buffWidth);

    let profileText = currentObjective.mission
      .replace(/{{MHR}}/g, mhr.toString())
      .replace(/{{Z1_MIN}}/g, z1_min.toString())
      .replace(/{{Z1_MAX}}/g, z1_max.toString())
      .replace(/{{Z2_MIN}}/g, z2_min.toString())
      .replace(/{{Z2_MAX}}/g, z2_max.toString())
      .replace(/{{Z3_MIN}}/g, z3_min.toString())
      .replace(/{{Z3_MAX}}/g, z3_max.toString())
      .replace(/{{Z4_MIN}}/g, z4_min.toString())
      .replace(/{{Z4_MAX}}/g, z4_max.toString())
      .replace(/{{Z5_MIN}}/g, z5_min.toString())
      .replace(/{{Z5_MAX}}/g, z5_max.toString())
      .replace(/{{BUFF_WIDTH}}/g, buffWidth.toString())
      .replace(/{{BUFF_MIN}}/g, buffMin.toString())
      .replace(/{{BUFF_MAX}}/g, buffMax.toString())
      .replace(/{{MIN_TIZ_MINS}}/g, minTizMins.toString())
      .replace(/{{MAX_VAR_MINS}}/g, maxVarMins.toString());

    addLog(`SYSTEM: Mission Profile generated locally for "${currentObjective.title}"`);
    missionProfileRef.current = { prompt: "LOCAL_GENERATION", text: profileText, tokenUsage: undefined };
    addLog(`[MISSION_PROFILE] ${profileText}`);
    
    return profileText;
  }, [age, currentObjective, sessionDurationGoal, zones, addLog]);

  const generateNarrativeMissionPlan = useCallback(async (profileText: string) => {
      const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
      const duration = sessionDurationGoal;
      const strategy = (currentObjective as any).transitionStrategy || "normal state";
      
      let exampleFormat = "";
      if (strategy === "interval state") {
          exampleFormat = `
      [THEME]: Operation Laser-Pointer: The high-intensity interval chase against the "Chubby-Chonk" Boss!
      [TIMELINE]:
       0:00 [Interval 1 - The First Pounce]: The Boss engages full laser-chase mode! User must push into the target heart rate zone (135+) to evade the barrage.
       3:00 [Recovery 1 - The Grooming Break]: The Boss retreats to aggressively groom a paw. User must drop back to the recovery zone (115) to shed heat and regroup.
       6:00 [Interval 2 - The Midnight Zoomies]: Unprovoked Phase Two! The Boss initiates the midnight zoomies. Push back into the target heart rate zone (135+) to match the chaos.
       9:00 [Recovery 2 - The Cardboard Box]: The Boss is temporarily distracted by a high-value cardboard box. Maintain the recovery zone (115) and catch your breath.
      12:00 [Interval 3 - The Final Stand]: The Boss goes berserk and summons the red-dot swarm! Final push into the target heart rate zone (135+) to break the sisal shield.
      15:00 [Recovery 3 - The Nap]: The Boss's stamina is broken; the beast demands a nap. Spin down safely to baseline.
      18:00 [Boss Defeated]: The Boss is fully asleep. Encounter survived. 

      [Mission Complete]: VICTORY! The Golden Yarn Trophy is safely secured while the beast slumbers!
      [Maguffin]: Golden Yarn Trophy
      [BONUS]: SECRET STAGE UNLOCKED! You kept pedaling while the boss slept. The Golden Yarn Trophy is enhanced, and your laser pointer is upgraded to a prismatic beam.
      `;
      } else if (strategy === "normal state") {
          exampleFormat = `
      [THEME]: Operation Laser-Pointer: The steady-state siege against the "Chubby-Chonk" Boss to unlock the Golden Yarn Trophy!
      [TIMELINE]:
       0:00 [The Loading Screen]: user is getting ready to engage and should be ramping up to the target heart rate zone.
       2:00 [Warmup Complete]: Boss fight has begun in earnest; user should be in the target heart rate zone now until recovery. 
       5:00 [Engagement Phase]: Boss engages secret weapon laser pointer to distract the user; user should be in the target heart rate zone now until recovery. 
      10:00 [Encounter Midpoint]: Boss at half health - stamina check 
      15:00 [Five Minute Warning]: Boss desperate and uses his sisal shield
      18:00 [Two Minute Warning]: Boss on last legs and desperate, more power to the laser; maintain current effort to defeat the boss. 
      20:00 [Boss Down]: Boss defeated; time to celebrate the victory. User can either recover or go for bonus points. 
      [Mission Complete]:	VICTORY! the Golden Yarn Trophy is yours!
      [Maguffin]: Golden Yarn Trophy
      [BONUS]:	SECRET STAGE UNLOCKED! the Golden Yarn Trophy is enhanced by your extra effort. The laser pointer glows even more brightly. 
      `;
      } else {
          // Default: Fixed State
          exampleFormat = `
      [THEME]: Operation Laser-Pointer: The fixed-state mission to secure the Golden Yarn Trophy!
      [TIMELINE]:
      (Timeline is blank for fixed state objectives)

      [Mission Complete]: VICTORY! The Golden Yarn Trophy is yours!
      [Maguffin]: Golden Yarn Trophy
      [BONUS]: SECRET STAGE UNLOCKED! The Golden Yarn Trophy is enhanced by your extra effort.
      `;
      }

      const prompt = `
      You are an expert author/Narrative creator. Based on the following Mission Profile and Persona, create a "Narrative Mission Plan" to guide a session story arc that will be used by an LLM tracking the users progress through a workout ensuring that they are staying in the desired heart rate zone and notifying them of session milestones. For this task, only consider the Persona characteristics for the theme and plan; don't literally interpret the persona instructions here. 
      
      Persona: ${personaConfig.systemInstruction}
      Persona Mission Instruction: ${personaConfig.missionProfile}
      Mission Profile: ${profileText}
      Session Duration: ${duration} minutes.
      
      Requirements:
      1. Recontextualize the workout goals into the persona's thematic world. Use the persona's thematic world as inspiration for naming and narrative flavor, but write the plan in a neutral, third-person planning voice. 
      2. Define specific Milestones/Narrative events triggering at least every 5 minutes (e.g., at 5m, 10m, 15m...). If expected time for the session is more than 5 minutes, give a 2 minute warning as well. Condense the timeline if needed for shorter sessions. the model is only called on 1 minute intervals so any events occurring more quickly than that will be lost. Incorporate planned state transitions into the plan as best as is possible. 
      3. Define a "Mission Complete" narrative conclusion (Goals Met). Generate a Maguffin for the persona to use narratively. 
      4. Define a "Bonus/Overtime" narrative context (BONUS_ACTIVE state) so the persona will be able to continue a little past the goal if desired. 
      
      Output Format: (based on Steady State 'walking')
      ${exampleFormat}
      `;

      try {
          addLog(`AI_REQUEST: Generating Narrative Mission Plan...`);
          addLog(`[DEBUG_NARRATIVE_PLAN_PROMPT] ${prompt}`);

          const response = await generateContentWithRetry(
              'gemini-3-flash-preview',
              prompt,
              undefined,
              2, // 2 retries
              'AI_NARRATIVE_PLAN'
          );

          const tokenUsage = extractUsage(response);
          const narrativeText = response.text || "Narrative generation failed.";
          narrativeMissionPlanRef.current = { prompt, text: narrativeText, tokenUsage };
          addLog(`[NARRATIVE_PLAN] ${narrativeText}`);
          if (tokenUsage) addLog(`AI_USAGE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}]`);

      } catch (e) {
          addLog(`AI_ERROR: Narrative Mission Plan generation failed. ${e instanceof Error ? e.message : ''}`);
          narrativeMissionPlanRef.current = null;
      }
  }, [selectedPersona, sessionDurationGoal, currentObjective, addLog, generateContentWithRetry]);

  const generateIntroMessage = useCallback(async () => {
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const personaIdentity = personaConfig.systemInstruction;
    
    const objectivesContext = `Mission Parameter: Target Duration: ${sessionDurationGoal} minutes`;
    const examplePhrase = `"Let's make these ${sessionDurationGoal} minutes count"`;

    let narrativeContext = "";
    if (narrativeMissionPlanRef.current) {
        narrativeContext = `\nNarrative Mission Plan:\n${narrativeMissionPlanRef.current.text}`;
    }

    // Conditionally include Telemetry Abstraction Instruction
    const abstractionInstruction = isTelemetryAbstractionEnabled ? TELEMETRY_ABSTRACTION_INSTRUCTION : "";

    const prompt = `
    Persona: ${personaIdentity}
    User Goal: ${currentObjective.title}
    ${objectivesContext}
    ${narrativeContext}
    
    ${abstractionInstruction}

    Task: The user has just started a workout session. Generate an introduction to initiate the session.
    Instruction: You are encouraged to reference the Mission Parameter naturally to set the stage (e.g., ${examplePhrase}), but do not output it as a list. Speak to the user, don't read the settings back to them. If a Narrative Mission Plan is provided, incorporate the theme immediately.
    Constraint: Strictly adhere to persona.
    `;

    try {
      addLog(`AI_REQUEST: Generating intro for "${selectedPersona}"...`);
      addLog(`[DEBUG_INTRO_PROMPT] ${prompt}`); // Log to console

      const response = await generateContentWithRetry(
          'gemini-3-flash-preview',
          prompt,
          undefined, // No config
          1, // 1 Retry
          'AI_INTRO'
      );

      const tokenUsage = extractUsage(response);
      const introText = response.text || "Session initialized. AetherAegis monitoring active.";
      addLog(`AI_INTRO: "${introText}"`);
      if (tokenUsage) addLog(`AI_USAGE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}]`);
      
      // Store in ref for file log
      sessionIntroRef.current = { prompt, text: introText, tokenUsage };
      setIntroText(introText);
      
      if (isVoiceEnabled) {
          // Small delay to ensure AudioContext is fully ready after user click
          const cleanIntro = cleanInsightText(introText);
          // Introduction always uses tts46Instruction (score 5 equivalent)
          setTimeout(() => speakInsight(cleanIntro, 5), 500);
      }
    } catch (e) {
         addLog(`AI_ERROR: Intro generation failed. ${e instanceof Error ? e.message : ''}`);
    }
  }, [selectedPersona, currentObjective, sessionDurationGoal, isVoiceEnabled, addLog, speakInsight, generateContentWithRetry, isTelemetryAbstractionEnabled]);

  const generateSessionSummary = useCallback(async () => {
    // Collect summaries
    const summaries = allSessionSummariesRef.current;
    if (summaries.length === 0) return;

    // Get the latest packet to append to the memory
    const latestPacket = summaries[summaries.length - 1];
    
    // Recursive: Feed the *previous* mid-term memory back into the input
    const previousMemoryText = currentSessionContextRef.current?.text || "";

    // NEW: Get Transition History
    const transitionHistory = sessionTransitionsRef.current.map(t => `[${t.timestamp}] ${t.message}`).join('\n');

    const prompt = `
    User Goal: ${currentObjective.title}

    Task: You are maintaining a structured "Mid-Term Memory" log of a workout session. 
    Update the EXISTING SUMMARY using the NEW TELEMETRY and TRANSITION HISTORY.

    FORMATTING RULES:
    1. Output strictly in the format: "[STATE_NAME] summary of performance in this state".
    2. Review the RECENT STATE TRANSITIONS. Ensure EVERY state that has occurred (e.g., [WARMUP], [MAIN_ACTIVE]) has a corresponding summary line.
    3. If a state appears in the transitions but not in the existing summary (e.g. short-lived WARMUP), create a new entry for it summarizing that phase was completed.
    4. If the state exists in the previous summary, update its description with the new data.
    5. Keep summaries objective, concise, and technical. No personality or fluff. Do not use markdown bolding.
    
    RECENT STATE TRANSITIONS (Context):
    ${transitionHistory || "(No transitions yet)"}

    EXISTING SUMMARY:
    ${previousMemoryText || "(No history yet)"}

    NEW TELEMETRY (Minute ${summaries.length}):
    - State: ${latestPacket.sessionState}
    - Avg HR: ${latestPacket.avg} BPM
    - Max HR: ${latestPacket.max} BPM
    - Insight: "${latestPacket.insight || 'N/A'}"

    Output the updated state-based summary block:
    `;

    try {
        addLog(`AI_REQUEST: Recursive Mid-Term Memory Update...`);
        addLog(`[DEBUG_MID_TERM_PROMPT] ${prompt}`); 

        const response = await generateContentWithRetry(
            'gemini-3-flash-preview',
            prompt,
            undefined, // No config
            1, // 1 Retry
            'AI_MID_TERM_MEMORY'
        );
        
        const tokenUsage = extractUsage(response);
        const summaryText = response.text || "Trends processing...";
        currentSessionContextRef.current = { text: summaryText, prompt, tokenUsage };
        
        addLog(`[MID_TERM_MEMORY] ${summaryText}`);
        if (tokenUsage) addLog(`AI_USAGE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}]`);
    } catch (e) {
        addLog(`AI_WARN: Failed to update session context.`);
    }

  }, [currentObjective, addLog, generateContentWithRetry]);

  const generateFinalSessionReport = useCallback(async (finalDuration: string) => {
    const summaries = allSessionSummariesRef.current;
    if (summaries.length === 0) return;

    const lastSummary = summaries[summaries.length - 1];
    const midTermContext = currentSessionContextRef.current ? currentSessionContextRef.current.text : "N/A";
    // Get Mission Profile text
    const missionProfileText = missionProfileRef.current ? missionProfileRef.current.text : "Standard Protocol";
    const narrativeMissionPlanText = narrativeMissionPlanRef.current ? narrativeMissionPlanRef.current.text : "Standard Narrative";
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const personaIdentity = personaConfig.systemInstruction;
    
    // Calculate simple stats for prompt
    const avgHr = Math.round(summaries.reduce((a,b)=>a+b.avg,0)/summaries.length);
    const peakHr = Math.max(...summaries.map(s => s.max));
    // Use filtered totals from ref to ensure final report matches "no-penalty" logic
    const totalCalories = runningMetricsRef.current.calories;
    const totalPoints = runningMetricsRef.current.heartPoints;
    
    // Use Performance Minutes for Compliance, not Total Wall Clock Minutes
    const performanceMinutes = runningMetricsRef.current.performanceMinutes;
    
    // Compile Transition History
    const transitionHistory = sessionTransitionsRef.current.map(t => `[${t.timestamp}] ${t.message}`).join('\n');

    // Conditionally include Telemetry Abstraction Instruction
    const abstractionInstruction = isTelemetryAbstractionEnabled ? TELEMETRY_ABSTRACTION_INSTRUCTION : "";

    const activeDurationStr = formatMMSS(activeDurationRef.current);
    const activeMinutes = (activeDurationRef.current / 60000).toFixed(1);

    const prompt = `
    Persona: ${personaIdentity}
    User Goal: ${currentObjective.title}
    Mission Plan / Profile: ${missionProfileText}
    Narrative Mission Plan: ${narrativeMissionPlanText}

    ${abstractionInstruction}

    Task: The workout session has ended. Generate a final session report based on the context below. Use only prose and don't include any markdown tags in the output. Output will be read by a TTS so ensure that it won't sound like "reading a phonebook". Four sentence maximum output. 
    
    Constraints: 
    - Professional, summary-focused, and concluding. 
    - Be generous with the ending workout stats. 
    - Explicitly mention major milestones achieved (e.g., reaching target zones, completing objective time). Explicitly mention the boss and Maguffin. 
    - Use the 'Active Duration' (${activeMinutes} mins) as the primary reference for workout intensity and milestone timing.
    - Include a final word of encouragement.
    
    Session Stats: 
    - Total Wall Time: ${finalDuration}
    - Active Workout Time: ${activeDurationStr} (${activeMinutes} mins)
    - Avg HR: ${avgHr} BPM
    - Peak HR: ${peakHr} BPM
    - Calories: ${totalCalories.toFixed(0)}
    - Heart Points: ${totalPoints}
    ${(currentObjective as any).transitionStrategy === "interval state" ? `- Intervals Completed: ${intervalCount}` : ""}
    
    Zone Compliance: ${runningMetricsRef.current.compliantMinutes}/${performanceMinutes} performance minutes matching target zones.
    
    Session State Timeline:
    ${transitionHistory}

    Mid-Term Trend: ${midTermContext}
    Last Minute Insight: ${lastSummary.insight || "N/A"}
    `;

    try {
        addLog(`AI_REQUEST: Generating Final Session Report...`);
        addLog(`[DEBUG_FINAL_REPORT_PROMPT] ${prompt}`); 
        
        const response = await generateContentWithRetry(
            'gemini-3-flash-preview',
            prompt,
            undefined, // No config
            1, // 1 Retry
            'AI_FINAL_REPORT'
        );
        
        const tokenUsage = extractUsage(response);
        const llmModel = 'gemini-3-flash-preview';
        const ttsModel = 'gemini-2.5-flash-preview-tts';
        const reportText = response.text || "Session concluded. Data saved.";
        const fullReportText = `${reportText}\n\nLLM Model: ${llmModel}\nTTS Model: ${ttsModel}`;
        
        finalSessionReportRef.current = { prompt, text: fullReportText, tokenUsage };
        setFinalReportText(fullReportText); // Update State for UI
        addLog(`[FINAL_REPORT] ${reportText}`);
        if (tokenUsage) addLog(`AI_USAGE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}]`);

        // Trigger TTS for final report if voice is enabled
        if (isVoiceEnabled) {
            const cleanReport = cleanInsightText(reportText);
            // Final reports always use tts46Instruction (score 5 equivalent)
            speakInsight(cleanReport, 5);
        }

    } catch (e) {
        addLog(`AI_ERROR: Final report generation failed.`);
    }
  }, [selectedPersona, currentObjective, addLog, isVoiceEnabled, speakInsight, generateContentWithRetry, isTelemetryAbstractionEnabled]);

  const requestAiInsight = async (summary: MinuteSummary) => {
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const personaIdentity = personaConfig.systemInstruction;
    
    // Construct GOAL context including Mission Profile if available
    let goalContext = `${currentObjective.title}`;
    if (missionProfileRef.current) {
        goalContext += `\n\nMISSION PROFILE (Baseline Targets):\n${missionProfileRef.current.text}`;
    }
    
    if (narrativeMissionPlanRef.current) {
        goalContext += `\n\nNARRATIVE MISSION PLAN (Story Arc):\n${narrativeMissionPlanRef.current.text}`;
    }

    // Conditionally include Telemetry Abstraction Instruction
    const abstractionInstruction = isTelemetryAbstractionEnabled ? TELEMETRY_ABSTRACTION_INSTRUCTION : "";
    
    const tailoredSystemInstruction = `Persona: ${personaIdentity}
    Mission Weight: ${personaConfig.missionWeight} (0-1 scale of how heavily to incorporate narrative elements)
    ${BASE_SYSTEM_INSTRUCTION
        .replace('{{GOAL}}', goalContext)
        .replace('{{TELEMETRY_CONSTRAINT}}', abstractionInstruction)}`;
    
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
        memoryContext = `MID-TERM SESSION CONTEXT (Overall Trend Summary):\n"${currentSessionContextRef.current.text}"\n(Use this context to ensure your new advice aligns with the bigger picture)\n`;
    }
    
    // --- REAL-TIME OBJECTIVE STATUS INJECTION ---
    // Calculate performance time in minutes for display context (Ignoring warmup/recovery)
    const currentPerformanceMinutes = (performanceDurationRef.current / 60000).toFixed(1);
    
    // Timer Context
    const activeTimeStr = formatMMSS(activeDurationRef.current);
    const timerContext = `[CURRENT TIMERS]\nActive_Time: ${activeTimeStr}`;

    let objectiveStatus = `[OBJECTIVE STATUS TRACKER - CONTEXT INPUT ONLY]\n- Time: ${currentPerformanceMinutes} / ${sessionDurationGoal} mins`;
    
    // Interval Count for Interval Strategy
    const strategy = (currentObjective as any).transitionStrategy || "normal state";
    if (strategy === "interval state") {
        objectiveStatus += `\n- Interval Count: ${intervalCount}`;
    }
    
    // Total Denominator for compliance should only include performance-active minutes
    const totalPerformanceMinutes = runningMetricsRef.current.performanceMinutes;
    objectiveStatus += `\n- Compliance: ${runningMetricsRef.current.compliantMinutes.toFixed(1)}/${totalPerformanceMinutes.toFixed(1)} performance minutes in target zone`;
    objectiveStatus += `\n(System Context: Use the following metrics as the factual foundation for your observations. Translate these values into your persona's voice—focus on the 'State of the Mission' rather than the raw digits. Do not replicate the list format; simply internalize the data to inform your judgment.)`;
    
    // Append objective status to the memory context block (or create if empty)
    memoryContext += `\n${objectiveStatus}\n`;
    memoryContext += `[CURRENT SESSION STATE]: ${summary.sessionState}\n\n`; // Use the frame-based session state


    const wallTime = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const prompt = `${tailoredSystemInstruction}\n\n[WALL_TIME]: ${wallTime}\n\n${memoryContext}${historyContext ? `SHORT-TERM CONTEXT (Maintain continuity):\n${historyContext}\n\n` : ''}CURRENT MINUTE PACKET:\n- Average BPM: ${summary.avg}\n- Max BPM: ${summary.max}\n- Min BPM: ${summary.min}\n- HR Trend (10s): ${hrTrend}\n- Calories Burned (Min): ${summary.calories.toFixed(1)}\n- Heart Points (Min): ${summary.heartPoints}\n- Sample Count: ${summary.sampleCount}\n- Raw Telemetry Stream: [${summary.values.join(', ')}]\n\n${timerContext}`;

    try {
      addLog(`AI_REQUEST: Analyzing for goal: "${currentObjective.title}" as "${selectedPersona}"...`);
      addLog(`[DEBUG_PROMPT_START]\n${prompt}\n[DEBUG_PROMPT_END]`);
      
      const response = await generateContentWithRetry(
          'gemini-3-flash-preview',
          prompt,
          undefined, // No config needed (prompt contains tailored system instruction)
          1, // 1 Retry
          'AI_INSIGHT'
      );

      const tokenUsage = extractUsage(response);
      const insight = response.text || "Insight unavailable.";
      addLog(`AI_RESPONSE: Analysis complete.`);
      addLog(`AI_INSIGHT: "${insight}"`);
      if (tokenUsage) addLog(`AI_USAGE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}]`);

      // Update the log history ref with the new insight and prompt
      const logIndex = allSessionSummariesRef.current.findIndex(s => s.id === summary.id);
      if (logIndex !== -1) {
        allSessionSummariesRef.current[logIndex].insight = insight;
        allSessionSummariesRef.current[logIndex].prompt = prompt; // Store prompt for file log
        // Store structured memory context snapshot
        if (currentSessionContextRef.current) {
            allSessionSummariesRef.current[logIndex].sessionContextSummary = currentSessionContextRef.current; 
        }
        allSessionSummariesRef.current[logIndex].tokenUsage = tokenUsage; // Store token usage
        allSessionSummariesRef.current[logIndex].isAnalyzing = false;
      }

      setSummaries(prev => prev.map(s => 
        s.id === summary.id ? { 
            ...s, 
            insight, 
            isAnalyzing: false, 
            prompt, 
            sessionContextSummary: currentSessionContextRef.current || undefined, 
            tokenUsage 
        } : s
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
          speakInsight(cleanText, saliencyScore);
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

    // --- FRAME STATE CALCULATION ---
    // Prioritize states encountered during the frame based on: WARMUP > RECOVERY > ERROR > PAUSE > MAIN_ACTIVE
    const observedStates = sessionStatesInFrameRef.current;
    let effectiveFrameState = currentSessionState;

    if (observedStates.has(SessionState.WARMUP)) {
        effectiveFrameState = SessionState.WARMUP;
    } else if (observedStates.has(SessionState.RECOVERY)) {
        effectiveFrameState = SessionState.RECOVERY;
    } else if (observedStates.has(SessionState.ERROR)) {
        effectiveFrameState = SessionState.ERROR;
    } else if (observedStates.has(SessionState.PAUSE)) {
        effectiveFrameState = SessionState.PAUSE;
    } else if (observedStates.has(SessionState.MAIN_ACTIVE)) {
        effectiveFrameState = SessionState.MAIN_ACTIVE;
    }
    // Else fall back to current state (likely BONUS_ACTIVE or INIT)
    
    // Reset frame state tracker for the next minute, but seed it with the current state
    sessionStatesInFrameRef.current.clear();
    sessionStatesInFrameRef.current.add(currentSessionState);

    const avgHr = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const maxVal = Math.max(...values);
    const minVal = Math.min(...values);

    // --- Heart Points Logic ---
    const maxHr = 220 - age;
    const zone2Min = maxHr * 0.6;
    const zone4Min = maxHr * 0.8;
    let points = 0;
    if (avgHr >= zone4Min) points = 2;
    else if (avgHr >= zone2Min) points = 1;

    // --- Compliance Logic ---
    // Allow for a 3 BPM margin to be "close enough"
    let isCompliant = false;
    const margin = 3;

    const strategy = (currentObjective as any).transitionStrategy || "normal state";
    if (strategy === "fixed state - MAIN_ACTIVE") {
        isCompliant = true;
    } else {
        for (const targetZoneIdx of currentObjective.targetZones) {
            // Adjust for 1-based indexing in objective vs 0-based in zones array
            const targetZone = targetZoneIdx > 0 ? zones[targetZoneIdx - 1] : zones[0];
            if (targetZone) {
                 const lowerBound = targetZone.min - margin;
                 const upperBound = targetZone.max === Infinity ? Infinity : targetZone.max + margin;
                 if (avgHr >= lowerBound && avgHr < upperBound) {
                     isCompliant = true;
                     break;
                 }
            }
        }
    }

    // --- Calorie Burn Logic (Keytel Equation) ---
    const weightKg = weight * 0.453592;
    let calories = 0;
    // Standard Keytel Equation
    // Male: C/min = (-55.0969 + 0.6309 x HR + 0.1988 x W + 0.2017 x A) / 4.184
    // Female: C/min = (-20.4022 + 0.4472 x HR - 0.1263 x W + 0.074 x A) / 4.184
    if (gender === 'Male') {
       calories = (-55.0969 + (0.6309 * avgHr) + (0.1988 * weightKg) + (0.2017 * age)) / 4.184;
    } else {
       calories = (-20.4022 + (0.4472 * avgHr) - (0.1263 * weightKg) + (0.074 * age)) / 4.184;
    }
    calories = Math.max(0, calories); // Prevent negative calories

    // --- METRIC ACCUMULATION GATE ---
    // Always increment metabolic metrics to avoid "penalizing" the user
    runningMetricsRef.current.heartPoints += points;
    runningMetricsRef.current.calories += calories;
    
    // Only increment Compliance Denominator if in active performance states
    // This allows WARMUP and RECOVERY to be ignored for percentage calculation
    const isPerformanceState = effectiveFrameState === SessionState.MAIN_ACTIVE || effectiveFrameState === SessionState.BONUS_ACTIVE;
    
    if (isPerformanceState) {
        const minutesElapsed = values.length / 60;
        runningMetricsRef.current.performanceMinutes += minutesElapsed; // Increment denominator for active minutes
        if (isCompliant) runningMetricsRef.current.compliantMinutes += minutesElapsed;
    }

    const newSummary: MinuteSummary = {
      id: crypto.randomUUID(),
      timestamp,
      avg: avgHr,
      max: maxVal,
      min: minVal,
      sampleCount: values.length,
      values,
      isAnalyzing: true,
      heartPoints: points,
      calories: calories,
      sessionState: effectiveFrameState // Use calculated frame state
    };

    // Store in full session log history
    allSessionSummariesRef.current.push(newSummary);

    setSummaries(prev => [newSummary, ...prev].slice(0, 3));
    addLog(`AGGREGATOR: Minute Packet [${timestamp}] generated.`);
    addLog(`METRICS: +${points} HP | +${calories.toFixed(1)} kcal | Compliance: ${isCompliant ? 'PASS' : 'FAIL'} | Gated: ${!isPerformanceState}`);
    addLog(`STATE_FRAME: ${effectiveFrameState} (Current: ${currentSessionState})`);
    
    // Trigger standard analysis
    requestAiInsight(newSummary);

    // Check if we should update mid-term memory (After 1st packet)
    if (allSessionSummariesRef.current.length >= 1) {
        generateSessionSummary();
    }

  }, [addLog, trainingGoal, isVoiceEnabled, selectedPersona, speakInsight, generateSessionSummary, chattiness, requestAiInsight, age, weight, gender, zones, currentObjective, currentSessionState]);

  const calcRef = useRef(calculateMinuteSummary);
  useEffect(() => { calcRef.current = calculateMinuteSummary; }, [calculateMinuteSummary]);
  
  const showRawTelemetryRef = useRef(showRawTelemetry);
  useEffect(() => { showRawTelemetryRef.current = showRawTelemetry; }, [showRawTelemetry]);

  // Expose updated state machine to message loop
  const updateStateRef = useRef(updateSessionState);
  useEffect(() => { updateStateRef.current = updateSessionState; }, [updateSessionState]);


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
        const rawMsg = event.data.toString();
        try {
          const rawData = JSON.parse(rawMsg);
          const rawHR = rawData.hr !== undefined ? rawData.hr : (rawData.data?.hr);
          const numericHR = typeof rawHR === 'number' ? rawHR : Number(rawHR);
          
          if (!isNaN(numericHR) && numericHR >= HR_MIN_VALID && numericHR <= HR_MAX_VALID) {
            
            // Update State Machine continuously based on new data
            if (updateStateRef.current) {
                updateStateRef.current(numericHR);
            }

            const newData: HeartRateData = {
              hr: numericHR,
              timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              isAiRequest: pendingAiMarkerRef.current
            };
            
            if (pendingAiMarkerRef.current) {
                pendingAiMarkerRef.current = false;
            }
            
            if (sessionActiveRef.current) {
                currentMinuteRef.current.push(numericHR);
            }

            if (showRawTelemetryRef.current) {
              addLog(`TELEMETRY: ${numericHR} BPM | RAW: ${rawMsg}`);
            }
            
            setCurrentHR(numericHR);

            // --- HR Trend Calculation ---
            const nowMs = Date.now();
            const smoothedHR = 0.7 * numericHR + 0.3 * (smoothedHRRef.current ?? numericHR);
            smoothedHRRef.current = smoothedHR;
            
            hrHistoryRef.current.push({ hr: smoothedHR, timestamp: nowMs });
            // Keep only last 10 seconds
            hrHistoryRef.current = hrHistoryRef.current.filter(p => nowMs - p.timestamp <= 10000);
            
            if (hrHistoryRef.current.length > 1) {
                const oldest = hrHistoryRef.current[0];
                const newest = hrHistoryRef.current[hrHistoryRef.current.length - 1];
                const diff = newest.hr - oldest.hr;
                
                let trend = "Stable";
                if (diff > 10) trend = "Fast Increase";
                else if (diff > 4) trend = "Increase";
                else if (diff < -10) trend = "Fast Decrease";
                else if (diff < -4) trend = "Decrease";
                
                setHrTrend(trend);
            }

            setDataPoints((prev) => {
              const updated = [...prev, newData];
              return updated.length > MAX_DATA_POINTS ? updated.slice(updated.length - MAX_DATA_POINTS) : updated;
            });

          } else {
            addLog(`UPLINK: ${rawMsg}`);
          }
        } catch (e) {
          addLog(`UPLINK: ${rawMsg}`);
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
    localStorage.setItem(STORAGE_KEYS.GENDER, gender);
    localStorage.setItem(STORAGE_KEYS.GOAL, trainingGoal);
    localStorage.setItem(STORAGE_KEYS.DURATION, String(sessionDurationGoal));
    localStorage.setItem(STORAGE_KEYS.VOICE, String(isVoiceEnabled));
    localStorage.setItem(STORAGE_KEYS.PERSONA, selectedPersona);
    localStorage.setItem(STORAGE_KEYS.CHATTINESS, String(chattiness));
    localStorage.setItem(STORAGE_KEYS.SHOW_SYS, String(showSystemLogs));
    localStorage.setItem(STORAGE_KEYS.SHOW_USER, String(showUserLogs));
    localStorage.setItem(STORAGE_KEYS.ABSTRACTION, String(isTelemetryAbstractionEnabled));
    
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
    setHrTrend("Stable");
    setIntervalCount(0);
    hrHistoryRef.current = [];
    smoothedHRRef.current = null;
    currentMinuteRef.current = [];
    allSessionSummariesRef.current = [];
    sessionTransitionsRef.current = []; // Clear transitions log
    sessionIntroRef.current = null; // Clear intro ref on restart
    missionProfileRef.current = null; // Clear mission profile
    narrativeMissionPlanRef.current = null; // Clear narrative plan
    currentSessionContextRef.current = null; // Clear memory ref
    finalSessionReportRef.current = null; // Clear final report
    setFinalReportText(null); // Clear UI report
    setSummaries([]);
    setIsSessionActive(false);
    setCurrentSessionState(SessionState.IDLE);
    transitionTimersRef.current = { warmupToMain: null, bonusToRecovery: null, mainToPause: null, pauseToMain: null };
    setIntroText(null);
    setElapsedTime("00:00:00");
    setActiveTime("00:00");
    performanceDurationRef.current = 0; // Reset Performance Duration
    activeDurationRef.current = 0;
    hasStartedActiveRef.current = false;
    lastUpdateWallTimeRef.current = 0;
    nextActiveTargetRef.current = 60000;
    setTimeout(connect, 300);
  }, [connect, addLog, wsUrl, deviceIdHex, age, weight, gender, trainingGoal, sessionDurationGoal, isVoiceEnabled, selectedPersona, chattiness, showSystemLogs, showUserLogs, isTelemetryAbstractionEnabled]);

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
      setCurrentSessionState(SessionState.IDLE);
      transitionState(SessionState.IDLE, "User manually stopped session");

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
      
      // Clear buffers BEFORE state transition logging
      currentMinuteRef.current = []; 
      allSessionSummariesRef.current = []; 
      sessionTransitionsRef.current = []; // Clear transitions before first log
      currentSessionContextRef.current = null; // Clear mid-term memory
      narrativeMissionPlanRef.current = null; // Clear narrative plan on start

      // Log initial transition away from IDLE
      transitionState(SessionState.INIT, "User manually started session");

      setSessionStartTime(now);
      setElapsedTime("00:00:00");
      setActiveTime("00:00");
      runningMetricsRef.current = { heartPoints: 0, calories: 0, compliantMinutes: 0, performanceMinutes: 0 }; // Reset metrics
      performanceDurationRef.current = 0; // Reset performance duration
      activeDurationRef.current = 0;
      hasStartedActiveRef.current = false;
      lastUpdateWallTimeRef.current = now;
      nextActiveTargetRef.current = 60000;
      setIntroText(null);
      transitionTimersRef.current = { warmupToMain: null, bonusToRecovery: null, mainToPause: null, pauseToMain: null };
      
      // Reset Frame Tracking
      sessionStatesInFrameRef.current.clear();
      sessionStatesInFrameRef.current.add(SessionState.INIT);

      addLog("SESSION: Workout started. Timer active.");

      // Trigger Start-of-Session AI Tasks
      const profileText = await generateMissionProfile(); // Establish baseline targets
      if (profileText) {
          await generateNarrativeMissionPlan(profileText); // Establish narrative arc
      }
      generateIntroMessage();   // Say hello
    }
  }, [isSessionActive, status, addLog, elapsedTime, downloadSessionLog, isVoiceEnabled, generateIntroMessage, generateFinalSessionReport, generateMissionProfile, generateNarrativeMissionPlan, transitionState]);

  // Compute the latest cleaned insight for display
  const latestInsightCleaned = useMemo(() => {
    if (finalReportText) return cleanInsightText(finalReportText);
    if (summaries.length > 0 && summaries[0].insight) return cleanInsightText(summaries[0].insight);
    if (introText) return cleanInsightText(introText);
    return undefined;
  }, [summaries, introText, finalReportText]);

  // Filter logs for display based on category toggle state
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // System categories regex
      const isSystem = log.message.match(/^(SYSTEM|ERROR|WARNING|AUDIO|VOICE_WARN|VOICE_ERROR|AI_USAGE|AI_REQUEST|TELEMETRY|STATE_CHANGE|\[)/);
      if (isSystem) return showSystemLogs;
      // All others (SESSION, METRICS, AI_INSIGHT, etc.) are considered User Logs
      return showUserLogs;
    });
  }, [logs, showSystemLogs, showUserLogs]);

  return (
    <div className="min-h-screen bg-[#050608] biometric-grid text-slate-200 p-4 md:p-8 flex flex-col items-center relative">
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

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Gender</label>
                <select value={gender} onChange={(e) => setGender(e.target.value)} className="bg-black border border-white/10 text-[#ff003c] font-mono text-lg px-3 py-1 w-24 focus:outline-none focus:border-[#ff003c]/50 transition-colors appearance-none cursor-pointer">
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />
              
              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Training Objective</label>
                <select value={trainingGoal} onChange={(e) => setTrainingGoal(e.target.value)} className="bg-black border border-white/10 text-cyan-400 font-mono text-xs px-3 py-1.5 focus:outline-none focus:border-cyan-400/50 transition-colors appearance-none cursor-pointer">
                  {TRAINING_OBJECTIVES.map(g => <option key={g.title} value={g.title}>{g.title}</option>)}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Session Target Config</label>
                <div className="flex items-center gap-2">
                  <div className="bg-black border border-white/10 text-cyan-400 font-mono text-xs px-2 py-1.5 w-24 flex items-center justify-center">
                    Duration
                  </div>
                  
                  <div className="relative">
                    <input type="number" value={sessionDurationGoal} onChange={(e) => setSessionDurationGoal(Math.max(1, parseInt(e.target.value) || 20))} className="bg-black border border-white/10 text-white font-mono text-xs px-2 py-1.5 w-20 focus:outline-none focus:border-cyan-400/50 transition-colors text-right pr-6" />
                    <span className="absolute right-2 top-1.5 text-[10px] text-slate-500">m</span>
                  </div>
                </div>
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Personality</label>
                <select value={selectedPersona} onChange={(e) => setSelectedPersona(e.target.value)} className="bg-black border border-white/10 text-amber-500 font-mono text-xs px-3 py-1.5 focus:outline-none focus:border-amber-500/50 transition-colors appearance-none cursor-pointer w-32">
                  {Object.keys(PERSONA_CONFIG).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Data Verbalization</label>
                <button 
                  onClick={() => setIsTelemetryAbstractionEnabled(!isTelemetryAbstractionEnabled)}
                  className={`px-3 py-1.5 border font-bold rounded-sm transition-all uppercase text-[9px] tracking-widest ${isTelemetryAbstractionEnabled ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.1)]' : 'bg-slate-900/50 text-slate-500 border-white/10 hover:border-white/20'}`}
                >
                  {isTelemetryAbstractionEnabled ? 'Abstract: ON' : 'Abstract: OFF'}
                </button>
              </div>

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
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">System Logs</label>
                <button 
                  onClick={() => setShowSystemLogs(!showSystemLogs)}
                  className={`px-3 py-1.5 border font-bold rounded-sm transition-all uppercase text-[9px] tracking-widest ${showSystemLogs ? 'bg-blue-500/20 text-blue-400 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.1)]' : 'bg-slate-900/50 text-slate-500 border-white/10 hover:border-white/20'}`}
                >
                  {showSystemLogs ? 'Sys: ON' : 'Sys: OFF'}
                </button>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">User Logs</label>
                <button 
                  onClick={() => setShowUserLogs(!showUserLogs)}
                  className={`px-3 py-1.5 border font-bold rounded-sm transition-all uppercase text-[9px] tracking-widest ${showUserLogs ? 'bg-purple-500/20 text-purple-400 border-purple-500/40 shadow-[0_0_10px_rgba(168,85,247,0.1)]' : 'bg-slate-900/50 text-slate-500 border-white/10 hover:border-white/20'}`}
                >
                  {showUserLogs ? 'Usr: ON' : 'Usr: OFF'}
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

              <div className="h-10 w-px bg-white/5 hidden md:block" />

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Session State</label>
                <div className="px-3 py-1.5 border border-purple-500/30 bg-purple-500/10 rounded-sm">
                   <span className="text-[10px] font-black uppercase tracking-tighter text-purple-400">{currentSessionState}</span>
                </div>
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
              activeTime={activeTime}
              latestInsight={latestInsightCleaned}
              isFullScreen={isFullScreen}
              hrTrend={hrTrend}
              intervalCount={intervalCount}
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
              <AggregatorPanel summaries={summaries} introText={introText} finalReportText={finalReportText} />
            </div>
          )}
        </div>
      </div>
      <div className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-500 ease-in-out transform ${showDebug ? 'translate-y-0' : 'translate-y-full'}`}><DebugLog logs={filteredLogs} onClose={() => setShowDebug(false)} /></div>
      <footer className="mt-auto py-8 text-center text-[10px] uppercase tracking-[0.2em] text-slate-600 font-bold">AetherAegis Biometric Monitoring Suite // v5.10.0-ReConnect.8080</footer>
    </div>
  );
};

export default App;