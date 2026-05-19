import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { GoogleGenAI, Modality, ThinkingLevel } from "@google/genai";
import { ConnectionStatus, HeartRateData, ZoneConfig, MinuteSummary, TokenUsage, SessionContext, SessionState, PersonaConfig, AiInsightResponse, NarrativeMilestone, TrainingObjective, ParsedNarrativePlan } from './types';
import DashboardHeader from './components/DashboardHeader';
import HeartRateDisplay from './components/HeartRateDisplay';
import HeartRateChart from './components/HeartRateChart';
import StatusBadge from './components/StatusBadge';
import DebugLog from './components/DebugLog';
import AggregatorPanel from './components/AggregatorPanel';
import { personalityData } from './personality';
import { TRAINING_OBJECTIVES } from './training_objectives';
import { generateMissionPlanTemplate } from './services/missionPlanGenerator';

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

function cleanJSONResponse(text: string): string {
    // Remove markdown code blocks if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```json')) {
        cleaned = cleaned.substring(7);
    } else if (cleaned.startsWith('```')) {
        cleaned = cleaned.substring(3);
    }
    
    if (cleaned.endsWith('```')) {
        cleaned = cleaned.substring(0, cleaned.length - 3);
    }
    
    return cleaned.trim();
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
  ABSTRACTION: 'aetheraegis_telemetry_abstraction',
  INTERVAL_TIME: 'aetheraegis_interval_time',
  INTERVAL_COUNT_GOAL: 'aetheraegis_interval_count_goal',
  ACTIVITY_VERBALIZATION: 'aetheraegis_activity_verbalization',
  SELECTED_ACTIVITY: 'aetheraegis_selected_activity',
  CUSTOM_ACTIVITY: 'aetheraegis_custom_activity',
  AI_MODEL: 'aetheraegis_ai_model'
};

const MAX_DATA_POINTS = 50;
const MAX_LOG_ENTRIES = 100;
const HR_MIN_VALID = 40;
const HR_MAX_VALID = 220;

const PERSONA_CONFIG: Record<string, PersonaConfig> = personalityData;

const TELEMETRY_ABSTRACTION_INSTRUCTION = `Telemetry Abstraction: Do NOT recite raw BPM values (e.g., "145 bpm") unless the Safety flag is present. Instead, use qualitative descriptors appropriate for your personality and the mission.`;

const MILESTONE_INSTRUCTION = `Milestones: The <milestone> block includes an important narrative update for this session and should be heavily incorporated into your response. The milestone should be extremely clear to the user and in character. Ensure milestone updates don't contradict coaching guidance. The primary function of the milestone is to provide the user an idea about where they are in their session with respect to time.`;

const BASE_SYSTEM_INSTRUCTION = `
You are an agent that provides feedback and milestone based time cues to a user doing an exercise using a specific, themed persona in order to make that feedback more entertaining.
Data Input: You will receive a <current_minute_packet> containing metrics about the user's effort, importance of the current update, and safety status.
{{TELEMETRY_CONSTRAINT}}
Anti-Repetition: Review <short_term_context> before writing. Vary on three levels: (1) sentence structure; (2) metaphor clusters; (3) catchphrases. Suspended when there is a Safety tag given in the <current_minute_packet>
Corrections: the input telemetry in <current_minute_packet> will show you the users coaching direction and urgency. Provide instructions to move their heart rate to the target zone by giving clear instructions in character to slow down, speed up or maintain current pace.
{{MILESTONE_CONSTRAINT}}
ABSOLUTE LIMIT: No more than two sentences or 45 words maximum. Less is more in this context so try to keep responses short and punchy.
Return only the persona narration text. Do not use JSON or markdown.
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

  const [intervalTime, setIntervalTime] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.INTERVAL_TIME) || '3'));
  const [intervalCountGoal, setIntervalCountGoal] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.INTERVAL_COUNT_GOAL) || '3'));

  // Activity Verbalization State
  const [isActivityVerbalizationEnabled, setIsActivityVerbalizationEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.ACTIVITY_VERBALIZATION) !== 'false');
  const [selectedActivity, setSelectedActivity] = useState(() => localStorage.getItem(STORAGE_KEYS.SELECTED_ACTIVITY) || 'walking');
  const [customActivity, setCustomActivity] = useState(() => localStorage.getItem(STORAGE_KEYS.CUSTOM_ACTIVITY) || '');
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem(STORAGE_KEYS.AI_MODEL) || 'gemma-4-26b-a4b-it');

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
  const lastStateTransitionTimeRef = useRef<number>(Date.now());
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
  const hasSentFirstMainActiveInsightRef = useRef(false);
  const lastMilestoneCheckSecondRef = useRef<number>(-1);
  const consecutiveMaintainCountRef = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);
  
  // Session Metrics Refs
  const runningMetricsRef = useRef<{ heartPoints: number; calories: number; compliantMinutes: number; performanceMinutes: number }>({ heartPoints: 0, calories: 0, compliantMinutes: 0, performanceMinutes: 0 });
  const processedObjectiveRef = useRef<TrainingObjective | null>(null);
  
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
  const stateSamplesInFrameRef = useRef<Map<SessionState, number>>(new Map());
  
  // Session Logging Ref (Stores full history for file export)
  const allSessionSummariesRef = useRef<MinuteSummary[]>([]);
  const sessionTransitionsRef = useRef<{ timestamp: string; message: string }[]>([]); // New Transition Log Ref
  const narrativeMilestonesRef = useRef<NarrativeMilestone[]>([]);

  const sessionIntroRef = useRef<{ prompt: string; text: string; tokenUsage?: TokenUsage } | null>(null);
  const missionProfileRef = useRef<{ prompt: string; text: string; tokenUsage?: TokenUsage } | null>(null);
  const narrativeMissionPlanRef = useRef<{ prompt: string; text: string; tokenUsage?: TokenUsage; parsedValue?: ParsedNarrativePlan } | null>(null);
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
            nextActiveTargetRef.current = 0; // Trigger immediate update at 0:00 active time
            addLog(`SYSTEM: Active Timer Engaged.`);
        }

        // Interval State Strategy: Increment count on MAIN_ACTIVE/BONUS_ACTIVE -> RECOVERY
        const strategy = (currentObjective as any).transitionStrategy || "normal state";
        if (strategy === "interval state" || strategy === "fixed interval state") {
            if ((currentSessionStateRef.current === SessionState.MAIN_ACTIVE || currentSessionStateRef.current === SessionState.BONUS_ACTIVE) && newState === SessionState.RECOVERY) {
                setIntervalCount(prev => prev + 1);
                addLog(`SYSTEM: Interval ${intervalCount + 1} completed.`);
            }
        }

        // Update Actual State
        currentSessionStateRef.current = newState;
        setCurrentSessionState(newState);
        lastStateTransitionTimeRef.current = Date.now();
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
              const isWarmupComplete = elapsedMinutes >= 6.0 || (currentBPM || 0) >= targetMinBPM;
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
          } else if (currentSessionState === SessionState.MAIN_ACTIVE || currentSessionState === SessionState.BONUS_ACTIVE) {
              // Main Active or Bonus Active to Recovery (Valley)
              const isDrop = (currentBPM || 0) < targetMinBPM;
              if (isDrop) {
                  if (!transitionTimersRef.current.mainToPause) {
                      transitionTimersRef.current.mainToPause = now;
                  } else if (now - transitionTimersRef.current.mainToPause > 6000) { // 6s debounce for interval drop
                      transitionState(SessionState.RECOVERY, "HR below target (Interval Valley)");
                      transitionTimersRef.current.mainToPause = null;
                  }
              } else {
                  transitionTimersRef.current.mainToPause = null;
              }
          } else if (currentSessionState === SessionState.RECOVERY) {
              // Recovery to Main Active or Bonus Active (Spike)
              const isSpike = (currentBPM || 0) >= targetMinBPM;
              if (isSpike) {
                  if (!transitionTimersRef.current.pauseToMain) {
                      transitionTimersRef.current.pauseToMain = now;
                  } else if (now - transitionTimersRef.current.pauseToMain > 6000) {
                      const targetState = intervalCount < intervalCountGoal ? SessionState.MAIN_ACTIVE : SessionState.BONUS_ACTIVE;
                      const reason = intervalCount < intervalCountGoal ? "HR recovered to target (Interval Spike)" : "HR recovered to target (Bonus Interval Spike)";
                      transitionState(targetState, reason);
                      transitionTimersRef.current.pauseToMain = null;
                  }
              } else {
                  transitionTimersRef.current.pauseToMain = null;
              }
          }
          return;
      }

      // 6b. Fixed Interval Strategy Logic
      if (strategy === "fixed interval state") {
          const now = Date.now();
          const elapsedMs = now - (sessionStartTime || now);
          const elapsedMinutes = elapsedMs / 60000;
          const timeInStateMs = now - lastStateTransitionTimeRef.current;
          const timeInStateMinutes = timeInStateMs / 60000;
          
          let targetMinBPM = 999;
          if (currentObjective.targetZones.length > 0) {
              const minZoneIdx = Math.min(...currentObjective.targetZones);
              const zone = minZoneIdx > 0 ? zones[minZoneIdx - 1] : zones[0];
              if (zone) targetMinBPM = zone.min;
          }

          if (currentSessionState === SessionState.INIT || currentSessionState === SessionState.WARMUP) {
              // Warmup to Main Active (Time or HR)
              const isWarmupComplete = elapsedMinutes >= 6.0 || (currentBPM || 0) >= targetMinBPM;
              if (isWarmupComplete) {
                  if (!transitionTimersRef.current.warmupToMain) {
                      transitionTimersRef.current.warmupToMain = now;
                  } else if (now - transitionTimersRef.current.warmupToMain > 5000) {
                      transitionState(SessionState.MAIN_ACTIVE, "Warmup targets met (Fixed Interval Strategy)");
                      transitionTimersRef.current.warmupToMain = null;
                  }
              } else {
                  transitionTimersRef.current.warmupToMain = null;
                  if (currentSessionState === SessionState.INIT && elapsedMinutes > 0.1) {
                      transitionState(SessionState.WARMUP, "Initialization complete");
                  }
              }
          } else if (currentSessionState === SessionState.MAIN_ACTIVE || currentSessionState === SessionState.BONUS_ACTIVE) {
              // Main Active or Bonus Active to Recovery (HR based)
              const isDrop = (currentBPM || 0) < targetMinBPM;
              if (isDrop) {
                  if (!transitionTimersRef.current.mainToPause) {
                      transitionTimersRef.current.mainToPause = now;
                  } else if (now - transitionTimersRef.current.mainToPause > 6000) {
                      const stateLabel = currentSessionState === SessionState.MAIN_ACTIVE ? "Fixed Interval" : "Bonus Interval";
                      transitionState(SessionState.RECOVERY, `${stateLabel} HR below target (Interval Valley)`);
                      transitionTimersRef.current.mainToPause = null;
                  }
              } else {
                  transitionTimersRef.current.mainToPause = null;
              }
          } else if (currentSessionState === SessionState.RECOVERY) {
              // Recovery to Main Active or Bonus Active (HR based)
              const isSpike = (currentBPM || 0) >= targetMinBPM;
              if (isSpike) {
                  if (!transitionTimersRef.current.pauseToMain) {
                      transitionTimersRef.current.pauseToMain = now;
                  } else if (now - transitionTimersRef.current.pauseToMain > 6000) {
                      if (intervalCount < intervalCountGoal) {
                          transitionState(SessionState.MAIN_ACTIVE, `Fixed Recovery HR recovered to target (Interval Spike)`);
                      } else {
                          // Goal met, but user wants more! Transition to BONUS_ACTIVE
                          transitionState(SessionState.BONUS_ACTIVE, `Bonus Recovery HR recovered to target (Bonus Interval Spike)`);
                      }
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
              // Transition Trigger: Time > 3.0 OR HR >= TargetMin
              const isWarmupComplete = elapsedMinutes >= 3.0 || (currentBPM || 0) >= targetMinBPM;

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

            // Safety: Never fire more than once every 25 seconds
            if (isAiTrigger && timeSinceLastUpdate < 25000) {
                if (showSystemLogs && isAiTrigger) {
                    addLog(`DEBUG: AI Update suppressed (Cooldown: ${Math.round(timeSinceLastUpdate/1000)}s)`);
                }
                isAiTrigger = false;
            }

            // Only trigger if we have data to analyze
            if (isAiTrigger) {
                const hasData = currentMinuteRef.current.length > 0;
                
                // Trigger calculation and AI call if we have data
                if (hasData && calcRef.current) {
                    lastUpdateWallTimeRef.current = now;
                    // Advance active target if we are in active mode
                    if (hasStartedActiveRef.current) {
                        nextActiveTargetRef.current = (Math.floor(currentActiveTime / 60000) + 1) * 60000;
                    }
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
    const strategy = (currentObjective as any).transitionStrategy || "normal state";
    let activeObjectiveStr = `Time ${sessionDurationGoal}m`;
    if (strategy === "interval state" || strategy === "fixed interval state") {
        activeObjectiveStr = `${intervalCountGoal} Intervals of ${intervalTime}m each`;
    }

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
    if (strategy === "interval state" || strategy === "fixed interval state") {
        contentDebug += `INTERVALS COMPLETED: ${intervalCount} / ${intervalCountGoal}\n`;
    }
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

    if (narrativeMilestonesRef.current && narrativeMilestonesRef.current.length > 0) {
        contentDebug += `[NARRATIVE MISSION PLAN READY | ${narrativeMilestonesRef.current.length} Milestones | Last Check Index: ${lastMilestoneCheckSecondRef.current}s]\n`;
        narrativeMilestonesRef.current.forEach(m => {
            contentDebug += `   - ${m.timeLabel} (${m.timeInSeconds}s) [${m.label}] || ${m.narrative}\n`;
        });
        contentDebug += `--------------------------------------------------\n\n`;
    } else if (narrativeMissionPlanRef.current) {
        contentDebug += `[NARRATIVE MISSION PLAN GENERATED BUT NO MILESTONES PARSED]\n--------------------------------------------------\n\n`;
    } else {
        contentDebug += `[NARRATIVE MISSION PLAN PENDING...]\n--------------------------------------------------\n\n`;
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
        const activeMM = Math.floor((s.activeTime || 0) / 60);
        const activeSS = Math.floor((s.activeTime || 0) % 60);
        contentDebug += `   > TIME       : Session ${Math.floor((index + 1))} min | Active ${activeMM}:${activeSS.toString().padStart(2, '0')}\n`;
        
        const displaySmoothed = (s.smoothedHR !== undefined && s.smoothedHR !== null) ? s.smoothedHR.toString() : "N/A";
        
        contentDebug += `   > HEART RATE : Avg ${s.avg} | Max ${s.max} | Min ${s.min} (Samples: ${s.sampleCount})\n`;
        contentDebug += `   > COACHING HR: ${displaySmoothed} BPM (Smoothed)\n`;
        contentDebug += `   > TARGET HR  : ${s.targetZoneInfo || "N/A"}\n`;
        contentDebug += `   > DIRECTION  : ${s.coachingDirection || "Maintain"}${s.safetyAlert ? " [SAFETY ALERT!]" : ""}\n`;
        contentDebug += `   > MILESTONE  : ${s.milestoneLabel && s.milestoneLabel !== "none" ? s.milestoneLabel : "none"}\n`;
        contentDebug += `   > IMPORTANCE : ${s.importance || 0}/10\n`;
        contentDebug += `   > METRICS    : ${s.calories.toFixed(1)} kcal | ${s.heartPoints} HP\n`;
        contentDebug += `   > AI PROMPT : \n${s.prompt || "N/A"}\n`;
        contentDebug += `   > AI ANALYST : ${s.insight || "Analysis pending or failed."}\n`;
        contentDebug += `   > AI JSON    : ${s.rawJson || "N/A"}\n`;
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
    if (strategy === "interval state" || strategy === "fixed interval state") {
        contentUser += `Intervals Completed: ${intervalCount} / ${intervalCountGoal}\n`;
    }
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
            contentUser += `Saliency Score: ${s.saliencyScore ?? "N/A"} | Coaching: ${s.coachingDirective || "N/A"}\n`;
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
  }, [age, weight, gender, currentObjective, sessionDurationGoal, deviceIdHex, selectedPersona, chattiness, isTelemetryAbstractionEnabled, addLog, intervalCount, intervalCountGoal, intervalTime]);

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
  const generateContentWithRetry = useCallback(async (model: string, contents: any, generationConfig: any, maxRetries: number, logPrefix: string) => {
      let attempt = 0;
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const startTime = performance.now();

      // Ensure thinking mode is off for models that support it
      // Default to MINIMAL thinking level to minimize latency and meet user request
      const configWithNoThinking = {
          ...generationConfig,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL }
      };

      while (true) {
          try {
              const response = await ai.models.generateContent({ 
                  model, 
                  contents, 
                  config: configWithNoThinking 
              });
              const durationMs = performance.now() - startTime;
              return { response, durationMs };
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

  const speakInsight = useCallback(async (text: string, customTtsInstruction?: string) => {
    if (!isVoiceEnabled) return;
    
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const voiceName = personaConfig.voiceName;
    
    // Use baseline TTS instruction or custom one from LLM
    const ttsBase = (typeof customTtsInstruction === 'string' ? customTtsInstruction : undefined) || personaConfig.ttsBaselineInstruction;

    // Clean instructions and payload: remove colons and semicolons
    const cleanTtsBase = ttsBase.replace(/[:;]/g, '');
    const cleanPayload = text.replace(/[:;]/g, '');

    // Ensure a single colon between instruction and payload
    const finalTtsPrompt = `${cleanTtsBase}: ${cleanPayload}`;

    const maxRetries = 1; // Total attempts = 1 initial + 1 retry
    let attempt = 0;
    const startTime = performance.now();

    while (attempt <= maxRetries) {
      try {
        const isRetry = attempt > 0;
        addLog(`VOICE: Synthesizing insight via Gemini TTS (${voiceName})...${isRetry ? ` (Attempt ${attempt + 1})` : ''}`);
        
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: finalTtsPrompt }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: voiceName },
              },
            },
          },
        });
        
        const networkTimeMs = performance.now() - startTime;
        const networkTimeStr = `[Network Time: ${(networkTimeMs/1000).toFixed(2)}s]`;
        console.log(`VOICE_TTS: ${networkTimeStr}`);

        // Log token usage for TTS if available
        const tokenUsage = extractUsage(response);
        
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

        const audioDurationStr = `[Audio Duration: ${audioBuffer.duration.toFixed(2)}s]`;
        console.log(`VOICE_TTS: ${audioDurationStr}`);

        const combinedMetrics = `${networkTimeStr} ${audioDurationStr}`;

        if (tokenUsage) {
            addLog(`VOICE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}] ${combinedMetrics}`);
        } else {
            addLog(`VOICE: ${combinedMetrics}`);
        }

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

    const replaceTemplates = (text: string) => {
      return text
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
        .replace(/{{MAX_VAR_MINS}}/g, maxVarMins.toString())
        .replace(/{{TIME}}/g, intervalTime.toString())
        .replace(/{{COUNT}}/g, intervalCountGoal.toString());
    };

    const profileText = replaceTemplates(currentObjective.mission);

    // Also process the helper goal fields for logging/UI
    processedObjectiveRef.current = {
      ...currentObjective,
      mission: profileText,
      warmupGoal: replaceTemplates(currentObjective.warmupGoal || ""),
      mainGoal: replaceTemplates(currentObjective.mainGoal || ""),
      recoveryGoal: replaceTemplates(currentObjective.recoveryGoal || "")
    };

    addLog(`SYSTEM: Mission Profile generated locally for "${currentObjective.title}"`);
    missionProfileRef.current = { prompt: "LOCAL_GENERATION", text: profileText, tokenUsage: undefined };
    addLog(`[MISSION_PROFILE] ${profileText}`);
    
    return profileText;
  }, [age, currentObjective, sessionDurationGoal, intervalTime, intervalCountGoal, zones, addLog]);

  const generateNarrativeMissionPlan = useCallback(async (profileText: string) => {
      const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
      const strategy = (currentObjective as any).transitionStrategy || "normal state";
      const exampleFormat = generateMissionPlanTemplate(strategy, sessionDurationGoal, intervalTime, intervalCountGoal);

      const isInterval = strategy === "interval state" || strategy === "fixed interval state";
      const sessionContext = isInterval 
        ? `Session Structure: ${intervalCountGoal} intervals of ${intervalTime} minutes each.`
        : `Session Duration: ${sessionDurationGoal} minutes.`;
      
      const activityContext = !isActivityVerbalizationEnabled 
        ? `\nActivity Context: The user is performing: ${selectedActivity === 'other' ? customActivity : selectedActivity}`
        : "";

      const taskSection = `<task>
[GENERAL INSTRUCTIONS]
You are an expert author/Narrative creator. Based on the following Persona, create a "Narrative Mission Plan" to guide a session story arc that will be used by an LLM tracking the users progress through a workout ensuring that they are staying in the desired heart rate zone and notifying them of session milestones. For this task, only consider the Persona characteristics for the theme and plan; don't literally interpret the persona instructions here. The format provided in the OUTPUT FORMAT section provides the main framework for the session. Replace the text in the last set of brackets [] in each line with a thematic interpretation of that milestone or goal. 

[REQUIREMENTS]
-Recontextualize the workout goals into the persona's thematic world. Use the persona's thematic world as inspiration for naming and narrative flavor, but write the plan in a neutral, third-person planning voice. 
-Preserve the Milestones provided in the OUTPUT FORMAT section. Don't add new milestones, simply make the provided milestones more thematic.   
-Define a "Mission Complete" narrative conclusion (Goals Met). 
-Generate a Maguffin for the persona to use narratively. 
-Define a "Bonus/Overtime" narrative context (BONUS_ACTIVE state) so the persona will be able to continue a little past the goal if desired. 

[CONSTRAINTS]
Hard Constraint: Output should match the OUTPUT FORMAT block - do not devaiate from this format. 
STRICT REPLACEMENT: You must keep the exact structural format of the timeline. ONLY replace the text inside the placeholder brackets (e.g., '[Insert description]'). 
PRESERVE TIMESTAMPS: Do NOT alter, add, or remove any 'M:SS' timestamps.
THIRD-PERSON TONE: Write in a neutral, cinematic, third-person voice. Describe the events like a dungeon master. Do NOT roleplay as the Persona (e.g., do not use the persona's slang or first-person pronouns).

[OUTPUT FORMAT]
${exampleFormat}
</task>`;

      const personaSection = `<persona>
Identity: ${personaConfig.systemInstruction}
Mission Instruction: ${personaConfig.missionProfile}
</persona>`;

      const sessionContextSection = `<session_context>
${sessionContext}${activityContext}
</session_context>`;

      const prompt = `${taskSection}\n\n${personaSection}\n\n${sessionContextSection}`;

      try {
          addLog(`AI_REQUEST: Generating Narrative Mission Plan...`);
          addLog(`[DEBUG_NARRATIVE_PLAN_PROMPT] ${prompt}`);

          const { response, durationMs } = await generateContentWithRetry(
              selectedModel,
              prompt,
              { maxOutputTokens: 1024 },
              2, // 2 retries
              'AI_NARRATIVE_PLAN'
          );

          const tokenUsage = extractUsage(response);
          const narrativeText = response.text || "Narrative generation failed.";
          addLog(`[NARRATIVE_PLAN] ${narrativeText}`);
          const networkTimeMs = durationMs;
          const networkTimeStr = `[Network Time: ${(networkTimeMs/1000).toFixed(2)}s]`;
          console.log(`AI_NARRATIVE_PLAN: ${networkTimeStr}`);
          if (tokenUsage) {
              addLog(`AI_USAGE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}] ${networkTimeStr}`);
          } else {
              addLog(`AI_USAGE: ${networkTimeStr}`);
          }

          // Parsing Narrative Milestones
          // Look for everything between [TIMELINE] and the next section header [ANY_HEADER] or end of string
          const timelineRegex = /\[TIMELINE\]:?\s*([\s\S]*?)(?=\n\[|$)/i;
          const timelineMatch = narrativeText.match(timelineRegex);
          const rawTimeline = timelineMatch ? timelineMatch[1].trim() : "";
          const lines = rawTimeline.split('\n').map(l => l.trim()).filter(l => l !== "");
          
          const parsedMilestones: NarrativeMilestone[] = [];
          
          lines.forEach(line => {
              // Regex for "M:SS [Label] || Narrative" or "M:SS Label || Narrative"
              // Supporting both bracketed and unbracketed labels, and multiple separators.
              const lineMatch = line.match(/^(\d+[:\d+]*)\s*(?:\[(.*?)\]|([^:|]+?))\s*(?::|\|+)\s*(.*)$/);
              if (lineMatch) {
                  const timeLabel = lineMatch[1].trim();
                  const label = (lineMatch[2] || lineMatch[3]).trim();
                  const narrative = lineMatch[4].trim();
                  
                  // Convert timeLabel to seconds
                  const parts = timeLabel.split(':').map(Number);
                  let timeInSeconds = 0;
                  if (parts.length === 1) { // Just minutes or seconds? Assume minutes if no colon
                      timeInSeconds = parts[0] * 60;
                  } else if (parts.length === 2) { // MM:SS
                      timeInSeconds = parts[0] * 60 + parts[1];
                  } else if (parts.length === 3) { // HH:MM:SS
                      timeInSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
                  }
                  
                  parsedMilestones.push({ timeInSeconds, timeLabel, label, narrative });
              }
          });
          
          narrativeMilestonesRef.current = parsedMilestones;
          
          // Parsing additional fields: Theme, Maguffin, Mission Complete, Bonus
          const themeMatch = narrativeText.match(/\[THEME\]:?\s*(.*)/i);
          const maguffinMatch = narrativeText.match(/\[MAGUFFIN\]:?\s*(.*)/i);
          const missionCompleteMatch = narrativeText.match(/\[MISSION COMPLETE\]:?\s*(.*)/i);
          const bonusMatch = narrativeText.match(/\[BONUS\]:?\s*(.*)/i);

          const parsedValue: ParsedNarrativePlan = {
              theme: themeMatch ? themeMatch[1].trim() : undefined,
              maguffin: maguffinMatch ? maguffinMatch[1].trim() : undefined,
              missionComplete: missionCompleteMatch ? missionCompleteMatch[1].trim() : undefined,
              bonus: bonusMatch ? bonusMatch[1].trim() : undefined
          };

          narrativeMissionPlanRef.current = { prompt, text: narrativeText, tokenUsage, parsedValue };
          
          if (parsedMilestones.length > 0) {
              addLog(`SYSTEM: --- PARSED NARRATIVE MILESTONES ---`);
              parsedMilestones.forEach(m => {
                  addLog(`  [${m.timeLabel}] (${m.timeInSeconds}s) ${m.label} || ${m.narrative}`);
              });
              if (parsedValue.theme) addLog(`  [THEME] ${parsedValue.theme}`);
              if (parsedValue.maguffin) addLog(`  [MAGUFFIN] ${parsedValue.maguffin}`);
              if (parsedValue.missionComplete) addLog(`  [COMPLETE] ${parsedValue.missionComplete}`);
              if (parsedValue.bonus) addLog(`  [BONUS] ${parsedValue.bonus}`);
              addLog(`SYSTEM: -----------------------------------------`);
          }

      } catch (e) {
          addLog(`AI_ERROR: Narrative Mission Plan generation failed. ${e instanceof Error ? e.message : ''}`);
          narrativeMissionPlanRef.current = null;
          narrativeMilestonesRef.current = [];
      }
  }, [selectedPersona, currentObjective, sessionDurationGoal, intervalTime, intervalCountGoal, addLog, generateContentWithRetry, isActivityVerbalizationEnabled, selectedActivity, customActivity, selectedModel]);

  const generateIntroMessage = useCallback(async () => {
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const personaIdentity = personaConfig.systemInstruction;
    
    const strategy = (currentObjective as any).transitionStrategy || "normal state";
    let objectivesContext = `Mission Parameter: Target Duration: ${sessionDurationGoal} minutes`;
    let examplePhrase = `"Let's make these ${sessionDurationGoal} minutes count"`;

    if (strategy === "interval state" || strategy === "fixed interval state") {
        objectivesContext = `Mission Parameter: Target Intervals: ${intervalCountGoal} cycles of ${intervalTime} minutes each.`;
        examplePhrase = `"Let's smash these ${intervalCountGoal} intervals"`;
    }
    
    let narrativeContext = "";
    if (narrativeMissionPlanRef.current) {
        narrativeContext = `\nNarrative Mission Plan:\n${narrativeMissionPlanRef.current.text}`;
    }

    // Conditionally include Telemetry Abstraction Instruction
    const abstractionInstruction = isTelemetryAbstractionEnabled ? TELEMETRY_ABSTRACTION_INSTRUCTION : "";

    const activityContext = !isActivityVerbalizationEnabled 
        ? `\nActivity Context: The user is performing: ${selectedActivity === 'other' ? customActivity : selectedActivity}`
        : "";

    const taskSection = `<task>
[GENERAL INSTRUCTIONS]
The user has just started a workout session. Generate an introduction to initiate the session.
You are encouraged to reference the Mission Parameter naturally to set the stage (e.g., ${examplePhrase}), but do not output it as a list. Speak to the user, don't read the settings back to them. If a Narrative Mission Plan is provided, incorporate the theme immediately. If there is a maguffin provided, be sure to mention it as the goal of the session. If there is an antagonist, be sure to mention them by name. 

[CONSTRAINTS]
- Strictly adhere to persona. 
- Four sentence maximum output.
- ${abstractionInstruction}
</task>`;

    const personaSection = `<persona>
Identity: ${personaIdentity}
</persona>`;

    const missionProfileSection = `<mission_profile>
Goal: ${currentObjective.title}
${activityContext}
</mission_profile>`;

    const narrativeMissionPlanSection = narrativeMissionPlanRef.current ? `
<narrative_mission_plan>
${narrativeMissionPlanRef.current.text}
</narrative_mission_plan>` : "";

    const objectiveTrackerSection = `<objective_tracker>
${objectivesContext}
</objective_tracker>`;

    const prompt = `${taskSection}\n\n${personaSection}\n\n${missionProfileSection}${narrativeMissionPlanSection}\n\n${objectiveTrackerSection}`;

    try {
      addLog(`AI_REQUEST: Generating intro for "${selectedPersona}"...`);
      addLog(`[DEBUG_INTRO_PROMPT] ${prompt}`); // Log to console

      const { response, durationMs } = await generateContentWithRetry(
          selectedModel,
          prompt,
          { maxOutputTokens: 1024 },
          1, // 1 Retry
          'AI_INTRO'
      );

      const tokenUsage = extractUsage(response);
      const introText = response.text || "Session initialized. AetherAegis monitoring active.";
      addLog(`AI_INTRO: "${introText}"`);
      const networkTimeMs = durationMs;
      const networkTimeStr = `[Network Time: ${(networkTimeMs/1000).toFixed(2)}s]`;
      console.log(`AI_INTRO: ${networkTimeStr}`);
      if (tokenUsage) {
          addLog(`AI_USAGE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}] ${networkTimeStr}`);
      } else {
          addLog(`AI_USAGE: ${networkTimeStr}`);
      }
      
      // Store in ref for file log
      sessionIntroRef.current = { prompt, text: introText, tokenUsage };
      setIntroText(introText);
      
      if (isVoiceEnabled) {
          // Small delay to ensure AudioContext is fully ready after user click
          const cleanIntro = cleanInsightText(introText);
          // Introduction uses baseline instruction
          setTimeout(() => speakInsight(cleanIntro), 500);
      }
    } catch (e) {
         addLog(`AI_ERROR: Intro generation failed. ${e instanceof Error ? e.message : ''}`);
    }
  }, [selectedPersona, currentObjective, sessionDurationGoal, intervalTime, intervalCountGoal, isVoiceEnabled, addLog, speakInsight, generateContentWithRetry, isTelemetryAbstractionEnabled, selectedModel]);

  const generateFinalSessionReport = useCallback(async (finalDuration: string) => {
    const summaries = allSessionSummariesRef.current;
    if (summaries.length === 0) return;

    const lastSummary = summaries[summaries.length - 1];
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

    const activityContext = !isActivityVerbalizationEnabled 
        ? `\nActivity Context: The user is performing: ${selectedActivity === 'other' ? customActivity : selectedActivity}`
        : "";

    const activeDurationStr = formatMMSS(activeDurationRef.current);
    const activeMinutes = (activeDurationRef.current / 60000).toFixed(1);

    const taskSection = `<task>
[GENERAL INSTRUCTIONS]
The workout session has ended. Generate a final session report based on the context below. Use only prose and don't include any markdown tags in the output. Output will be read by a TTS so ensure that it won't sound like "reading a phonebook". Four sentence maximum output. 

[CONSTRAINTS]
- State if the user has satisfied the workout requirements with respect to time spent and/or zone compliance. Don't be afraid to note if requirements have not been met. 
- Professional, summary-focused, and concluding. 
- Be generous with the ending workout stats. 
- Explicitly mention major milestones achieved (e.g., reaching target zones, completing objective time). Explicitly mention the boss and Maguffin. 
- Use the 'Active Duration' (${activeMinutes} mins) as the primary reference for workout intensity and milestone timing.
- Include a final word of encouragement.
- ${abstractionInstruction}
</task>`;

    const personaSection = `<persona>
Identity: ${personaIdentity}
</persona>`;

    const missionProfileSection = `<mission_profile>
Goal: ${currentObjective.title}
${activityContext}
Profile: ${missionProfileText}
Narrative Plan: ${narrativeMissionPlanText}
</mission_profile>`;

    const sessionStatsSection = `<session_stats>
Total Wall Time: ${finalDuration}
Active Workout Time: ${activeDurationStr} (${activeMinutes} mins)
Avg HR: ${avgHr} BPM
Peak HR: ${peakHr} BPM
Calories: ${totalCalories.toFixed(0)}
Heart Points: ${totalPoints}
${((currentObjective as any).transitionStrategy === "interval state" || (currentObjective as any).transitionStrategy === "fixed interval state") ? `Intervals Completed: ${intervalCount} / ${intervalCountGoal}` : ""}
</session_stats>`;

    const objectiveTrackerSection = `<objective_tracker>
Zone Compliance: ${runningMetricsRef.current.compliantMinutes}/${performanceMinutes} performance minutes matching target zones.
</objective_tracker>`;

    const transitionHistorySection = `<transition_history>
${transitionHistory}
</transition_history>`;

    const shortTermContextSection = `<short_term_context>
Last Minute Insight: ${lastSummary.insight || "N/A"}
</short_term_context>`;

    const prompt = `${taskSection}\n\n${personaSection}\n\n${missionProfileSection}\n\n${sessionStatsSection}\n\n${objectiveTrackerSection}\n\n${transitionHistorySection}\n\n${shortTermContextSection}`;

    try {
        addLog(`AI_REQUEST: Generating Final Session Report...`);
        addLog(`[DEBUG_FINAL_REPORT_PROMPT] ${prompt}`); 
        
        const { response, durationMs } = await generateContentWithRetry(
            selectedModel,
            prompt,
            { maxOutputTokens: 1536 },
            1, // 1 Retry
            'AI_FINAL_REPORT'
        );
        
        const tokenUsage = extractUsage(response);
        const llmModel = selectedModel;
        const ttsModel = 'gemini-2.5-flash-preview-tts';
        const reportText = response.text || "Session concluded. Data saved.";
        const networkTimeMs = durationMs;
        const networkTimeStr = `[Network Time: ${(networkTimeMs / 1000).toFixed(2)}s]`;
        console.log(`AI_FINAL_REPORT: ${networkTimeStr}`);
        const fullReportText = `${reportText}\n\nLLM Model: ${llmModel}\nTTS Model: ${ttsModel}\nReport Network Time: ${networkTimeStr}`;
        
        finalSessionReportRef.current = { prompt, text: fullReportText, tokenUsage };
        setFinalReportText(fullReportText); // Update State for UI
        addLog(`[FINAL_REPORT] ${reportText}`);
        if (tokenUsage) {
            addLog(`AI_USAGE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}] ${networkTimeStr}`);
        } else {
            addLog(`AI_USAGE: ${networkTimeStr}`);
        }

        // Trigger TTS for final report if voice is enabled
        if (isVoiceEnabled) {
            const cleanReport = cleanInsightText(reportText);
            // Final reports use baseline instruction
            speakInsight(cleanReport);
        }

    } catch (e) {
        addLog(`AI_ERROR: Final report generation failed.`);
    }
  }, [selectedPersona, currentObjective, addLog, isVoiceEnabled, speakInsight, generateContentWithRetry, isTelemetryAbstractionEnabled, intervalCount, intervalCountGoal, selectedModel]);

  const requestAiInsight = useCallback(async (summary: MinuteSummary) => {
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const personaIdentity = personaConfig.systemInstruction;

    // 0. Milestone Check (Conditional) - Needed for prompt instructions
    let milestoneSection = "";
    let milestoneInstruction = "";
    if (summary.milestoneLabel && summary.milestoneLabel !== "none") {
        const milestoneData = (narrativeMilestonesRef.current || []).find(m => m.label === summary.milestoneLabel);
        if (milestoneData) {
            milestoneSection = `<milestone>
[${milestoneData.timeLabel}] ${milestoneData.label}: ${milestoneData.narrative}
</milestone>`;
            milestoneInstruction = MILESTONE_INSTRUCTION;
        }
    }
    
    // Conditionally include Telemetry Abstraction Instruction
    const abstractionInstruction = isTelemetryAbstractionEnabled ? TELEMETRY_ABSTRACTION_INSTRUCTION : "";
    
    const activityContext = !isActivityVerbalizationEnabled 
        ? `\nActivity Context: The user is performing: ${selectedActivity === 'other' ? customActivity : selectedActivity}`
        : "";

    // 1. Task Section (Static)
    const taskSection = `<task>
[GENERAL INSTRUCTIONS]
${BASE_SYSTEM_INSTRUCTION
    .replace('{{TELEMETRY_CONSTRAINT}}', abstractionInstruction)
    .replace('{{MILESTONE_CONSTRAINT}}', milestoneInstruction)}

[OUTPUT FORMAT]
Return your response as plain text narration in the specified persona. Do not include any JSON, labels, or formatting characters.
</task>`;

    // 2. Persona Section (Static)
    const personaSection = `<persona>
Identity: ${personaIdentity}
Brevity Driver: ${personaConfig.iterationBrevityDriver}
</persona>`;

    // 3. Mission Profile Section (Static)
    const missionProfileSection = `<mission_profile>
Goal: ${currentObjective.title}
${activityContext}
${missionProfileRef.current ? `\nMISSION PROFILE (Baseline Targets):\n${missionProfileRef.current.text}` : ''}
${narrativeMissionPlanRef.current ? `\n\nNARRATIVE MISSION PLAN (Story Arc):\n${narrativeMissionPlanRef.current.text}` : ''}
</mission_profile>`;

    // --- HISTORY BUILDER START ---
    const allSummaries = allSessionSummariesRef.current;
    const currentIndex = allSummaries.findIndex(s => s.id === summary.id);
    
    let historyContext = "";
    
    // Last 3 summaries (insights only)
    const last3 = allSummaries.slice(Math.max(0, currentIndex - 3), currentIndex);
    last3.forEach(s => {
        if (s.insight) {
            historyContext += `-${s.insight}\n`;
        }
    });

    // Always include Intro for continuity
    if (sessionIntroRef.current) {
        historyContext += `-Intro: ${sessionIntroRef.current.text}`;
    }
    // --- HISTORY BUILDER END ---

    // 4. Objective Tracker Section (Semi-Volatile)
    const totalPerformanceMinutes = runningMetricsRef.current.performanceMinutes;
    const strategy = (currentObjective as any).transitionStrategy || "normal state";
    let objectiveStatus = `Time: ${totalPerformanceMinutes.toFixed(1)} / ${sessionDurationGoal} mins`;
    if (strategy === "interval state" || strategy === "fixed interval state") {
        objectiveStatus = `Intervals: ${intervalCount} / ${intervalCountGoal}\nInterval Time: ${intervalTime} mins`;
    }
    objectiveStatus += `\nCompliance: ${runningMetricsRef.current.compliantMinutes.toFixed(1)}/${totalPerformanceMinutes.toFixed(1)} performance minutes in target zone`;
    
    const objectiveTrackerSection = `<objective_tracker>
${objectiveStatus}
[CURRENT SESSION STATE]: ${summary.sessionState}
</objective_tracker>`;

    // 5. Transition History Section (Semi-Volatile)
    const transitionHistory = sessionTransitionsRef.current.map(t => `[${t.timestamp}] ${t.message}`).join('\n');
    const transitionHistorySection = `<transition_history>
${transitionHistory || "No state transitions recorded."}
</transition_history>`;

    // 6. Short-Term Context Section (Semi-Volatile)
    const shortTermContextSection = `<short_term_context>
${historyContext || "No recent history available."}
</short_term_context>`;

    // 7. Current Minute Packet Section (Volatile)
    const currentMinutePacketSection = `<current_minute_packet>
BPM: (cur/avg/max/min) ${summary.smoothedHR}/${summary.avg}/${summary.max}/${summary.min}
Coaching Direction: ${summary.coachingDirection}
Importance: ${summary.importance}${summary.safetyAlert ? "\nSafety Flag: ON" : ""}
</current_minute_packet>`;

    // 8. Milestone Section (Conditional) - already prepared earlier
    
    const prompt = `${taskSection}\n\n${personaSection}\n\n${shortTermContextSection}\n\n${currentMinutePacketSection}${milestoneSection ? `\n\n${milestoneSection}` : ""}`;

    try {
      addLog(`AI_REQUEST [${selectedModel}]: Analyzing for goal: "${currentObjective.title}" as "${selectedPersona}"...`);
      addLog(`[DEBUG_PROMPT_START]\n${prompt}\n[DEBUG_PROMPT_END]`);
      
      const { response, durationMs } = await generateContentWithRetry(
          selectedModel,
          prompt,
          { maxOutputTokens: 600 },
          1, // 1 Retry
          'AI_INSIGHT'
      );

      const tokenUsage = extractUsage(response);
      const insight = response.text || "";
      addLog(`AI_RESPONSE: Analysis complete.`);
      const networkTimeMs = durationMs;
      const networkTimeStr = `[Network Time: ${(networkTimeMs / 1000).toFixed(2)}s]`;
      console.log(`AI_INSIGHT: ${networkTimeStr}`);
      if (tokenUsage) {
          addLog(`AI_USAGE: [Tokens: In ${tokenUsage.input} / Out ${tokenUsage.output}] ${networkTimeStr}`);
      } else {
          addLog(`AI_USAGE: ${networkTimeStr}`);
      }

      // Update the log history ref with the new insight and prompt
      const logIndex = allSessionSummariesRef.current.findIndex(s => s.id === summary.id);
      if (logIndex !== -1) {
        allSessionSummariesRef.current[logIndex].insight = insight;
        allSessionSummariesRef.current[logIndex].prompt = prompt; // Store prompt for file log
        allSessionSummariesRef.current[logIndex].isAnalyzing = false;
        allSessionSummariesRef.current[logIndex].tokenUsage = tokenUsage;
      }

      setSummaries(prev => prev.map(s => 
        s.id === summary.id ? { 
            ...s, 
            insight, 
            isAnalyzing: false, 
            prompt, 
            tokenUsage 
        } : s
      ));

      // Speak the narrative if it meets the importance threshold
      const importance = summary.importance ?? 0;
      if (importance >= chattiness) {
          // Pre-pend baseline TTS instruction as requested
          speakInsight(insight, personaConfig.ttsBaselineInstruction);
      } else {
          addLog(`VOICE_SKIP: Importance (${importance}) < Threshold (${chattiness}).`);
      }
      
      // Update the user session log
      addLog(`AI_INSIGHT: Minute ${summary.id}: [Imp ${importance}] ${insight}`);
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
  }, [selectedPersona, selectedModel, currentObjective, sessionDurationGoal, intervalTime, intervalCountGoal, addLog, speakInsight, generateContentWithRetry, isTelemetryAbstractionEnabled, isActivityVerbalizationEnabled, selectedActivity, customActivity, hrTrend, chattiness]);

  const calculateMinuteSummary = useCallback(() => {
    const values = [...currentMinuteRef.current];
    currentMinuteRef.current = []; // Reset for next minute
    
    if (values.length === 0) return;
    
    const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // --- FRAME STATE CALCULATION ---
    const strategy = (currentObjective as any).transitionStrategy || "normal state";
    const isIntervalStrategy = strategy === "interval state" || strategy === "fixed interval state";
    
    let maxSamples = -1;
    let majorityState = currentSessionState;
    stateSamplesInFrameRef.current.forEach((count, state) => {
        if (count > maxSamples) {
            maxSamples = count;
            majorityState = state;
        }
    });
    let effectiveFrameState = majorityState;
    
    // Reset frame state tracker for the next minute, but seed it with the current state
    sessionStatesInFrameRef.current.clear();
    sessionStatesInFrameRef.current.add(currentSessionState);
    stateSamplesInFrameRef.current.clear();
    stateSamplesInFrameRef.current.set(currentSessionState, 0);

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

    if (strategy === "fixed state - MAIN_ACTIVE") {
        isCompliant = true;
    } else if (isIntervalStrategy && effectiveFrameState === SessionState.RECOVERY) {
        // For interval recovery, compliance means staying below the recovery ceiling
        // We use the zone below the lowest target zone as a proxy
        const minZoneIdx = Math.min(...currentObjective.targetZones);
        const targetZone = minZoneIdx > 0 ? zones[minZoneIdx - 1] : zones[0];
        if (targetZone) {
            // Compliance in recovery is being below the target zone floor (plus margin)
            isCompliant = avgHr < (targetZone.min + margin);
        }
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
    // For interval based objectives, time spent in the correct zone while in recovery phase should also count for compliance. 
    const isPerformanceState = effectiveFrameState === SessionState.MAIN_ACTIVE || 
                               effectiveFrameState === SessionState.BONUS_ACTIVE ||
                               (isIntervalStrategy && effectiveFrameState === SessionState.RECOVERY);
    
    if (isPerformanceState) {
        const minutesElapsed = values.length / 60;
        runningMetricsRef.current.performanceMinutes += minutesElapsed; // Increment denominator for active minutes
        if (isCompliant) runningMetricsRef.current.compliantMinutes += minutesElapsed;
    }

    // --- Target Zone Info for Logging ---
    let targetZoneInfo = "N/A";
    let coachingDirection = "Maintain";
    const smoothedHR = values.length >= 5 
        ? Math.round(values.slice(-5).reduce((a, b) => a + b, 0) / 5) 
        : avgHr;
    const safetyAlert = smoothedHR > (220 - age);

    const po = processedObjectiveRef.current;
    if (po) {
        let tMin = 0;
        let tMax = Infinity;

        if (effectiveFrameState === SessionState.WARMUP) {
            targetZoneInfo = `WARMUP: Target > ${po.warmupGoal} BPM`;
            tMin = parseInt(po.warmupGoal) || 0;
            tMax = Infinity;
        } else if (effectiveFrameState === SessionState.MAIN_ACTIVE || effectiveFrameState === SessionState.BONUS_ACTIVE) {
            targetZoneInfo = `ACTIVE: Target ${po.mainGoal} BPM`;
            const parts = po.mainGoal.split('-').map(p => parseInt(p));
            tMin = parts[0] || 0;
            tMax = parts[1] || Infinity;
        } else if (effectiveFrameState === SessionState.RECOVERY) {
            targetZoneInfo = `RECOVERY: Target ${po.recoveryGoal} BPM`;
            const parts = po.recoveryGoal.split('-').map(p => parseInt(p));
            tMin = parts[0] || 0;
            tMax = parts[1] || Infinity;
        } else if (effectiveFrameState === SessionState.PAUSE) {
            targetZoneInfo = "PAUSE: No Target";
            tMin = 0;
            tMax = Infinity;
        }

        // Apply Directional Logic
        const buffWidth = 5; // Matches calculation in generateMissionProfile
        if (effectiveFrameState !== SessionState.PAUSE) {
            if (smoothedHR < tMin) {
                const diff = tMin - smoothedHR;
                if (diff > 15) coachingDirection = "Large Increase";
                else if (diff > buffWidth) coachingDirection = "Increase";
                else coachingDirection = "Slight Increase";
            } else if (smoothedHR > tMax) {
                const diff = smoothedHR - tMax;
                if (diff > 15) coachingDirection = "Large Decrease";
                else if (diff > buffWidth) coachingDirection = "Decrease";
                else coachingDirection = "Slight Decrease";
            } else {
                coachingDirection = "Maintain";
            }
        }
    } else if (currentObjective.targetZones.length > 0) {
        // Fallback to zone-based calculation if processedObjective isn't ready
        const zoneLabels = currentObjective.targetZones.map(idx => {
            const z = idx > 0 ? zones[idx - 1] : zones[0];
            const maxLabel = z.max === Infinity ? "MAX" : Math.round(z.max);
            return `Zone ${idx} (${Math.round(z.min)}-${maxLabel})`;
        });
        targetZoneInfo = zoneLabels.join(", ");
    }

    // --- Narrative Milestone check ---
    let milestoneLabel = "none";
    const currentActiveSeconds = Math.round(activeDurationRef.current / 1000);
    
    // Milestones only fire if we have actually started active time. 
    // We allow them even if the majority state of this packet was Warmup, 
    // provided we crossed the 0:00 active time threshold during this window.
    if (activeDurationRef.current >= 0 && hasStartedActiveRef.current) {
        // Find any milestone in the range [lastChecked + 1, currentActiveSeconds]
        const startRange = lastMilestoneCheckSecondRef.current + 1;
        
        const relevantMilestones = narrativeMilestonesRef.current.filter(m => 
            m.timeInSeconds >= startRange && m.timeInSeconds <= currentActiveSeconds
        );

        if (relevantMilestones.length > 0) {
            const latest = relevantMilestones[relevantMilestones.length - 1];
            milestoneLabel = latest.label;
            lastMilestoneCheckSecondRef.current = Math.max(lastMilestoneCheckSecondRef.current, currentActiveSeconds);
        } else if (lastMilestoneCheckSecondRef.current === -1 && currentActiveSeconds >= 0) {
            const zeroStart = narrativeMilestonesRef.current.find(m => m.timeInSeconds === 0);
            if (zeroStart) {
                milestoneLabel = zeroStart.label;
                lastMilestoneCheckSecondRef.current = 0;
            }
        }
    }

    // --- Importance Calculation ---
    let importance = 3;
    if (coachingDirection === "Maintain") {
        consecutiveMaintainCountRef.current++;
        importance = Math.max(1, 3 - (consecutiveMaintainCountRef.current - 1));
    } else {
        // Reset counter for any non-maintain packet
        consecutiveMaintainCountRef.current = 0;
        if (coachingDirection.includes("Slight")) {
            importance = 4;
        } else {
            importance = 5;
        }
    }

    if (coachingDirection === "Decrease" || coachingDirection === "Large Decrease") {
        importance = Math.max(importance, 7);
    }

    if (milestoneLabel !== "none") {
        importance = Math.max(importance, 6);
    }

    if (safetyAlert && coachingDirection === "Large Decrease") {
        importance = Math.max(importance, 9);
    }

    if (smoothedHR >= (220 - age)) {
        importance = 10;
    }

    const newSummary: MinuteSummary = {
      id: String(allSessionSummariesRef.current.length + 1),
      timestamp,
      avg: avgHr,
      max: maxVal,
      min: minVal,
      sampleCount: values.length,
      values,
      isAnalyzing: true,
      heartPoints: points,
      calories: calories,
      sessionState: effectiveFrameState, // Use calculated frame state
      targetZoneInfo,
      coachingDirection,
      safetyAlert,
      milestoneLabel,
      importance,
      activeTime: currentActiveSeconds,
      smoothedHR,
      rawJson: JSON.stringify({ smoothedHR })
    };

    // Store in full session log history
    allSessionSummariesRef.current.push(newSummary);

    setSummaries(prev => [newSummary, ...prev].slice(0, 3));
    addLog(`AGGREGATOR: Minute Packet [${timestamp}] generated.`);
    addLog(`METRICS: +${points} HP | +${calories.toFixed(1)} kcal | Compliance: ${isCompliant ? 'PASS' : 'FAIL'} | Importance: ${importance}/10`);
    console.log(`METRICS: Minute Packet [${timestamp}] | HR: (Avg ${avgHr} / Smoothed ${smoothedHR}) | Target Zone: ${targetZoneInfo} | Coaching: ${coachingDirection} | Importance: ${importance}/10`);
    addLog(`STATE_FRAME: ${effectiveFrameState} (Current: ${currentSessionState})`);
    
    // Trigger standard analysis
    requestAiInsight(newSummary);

  }, [addLog, trainingGoal, isVoiceEnabled, selectedPersona, speakInsight, chattiness, requestAiInsight, age, weight, gender, zones, currentObjective, currentSessionState, intervalCount, intervalCountGoal]);

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

    const isLocal = wsUrl.includes('localhost') || 
                   wsUrl.includes('127.0.0.1') || 
                   wsUrl.includes('0.0.0.0') ||
                   wsUrl.includes('::1') ||
                   wsUrl.includes('192.168.') || 
                   wsUrl.includes('10.') || 
                   wsUrl.includes('172.') || 
                   wsUrl.includes('.local');

    if (showSystemLogs) {
      addLog(`DEBUG: Local detection for ${wsUrl}: ${isLocal}`);
    }

    const startWs = () => {
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
                  sessionStatesInFrameRef.current.add(currentSessionStateRef.current);
                  const currentCount = stateSamplesInFrameRef.current.get(currentSessionStateRef.current) || 0;
                  stateSamplesInFrameRef.current.set(currentSessionStateRef.current, currentCount + 1);
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
    };

    if (isLocal && (navigator as any)?.permissions?.query) {
      if (showSystemLogs) {
        addLog("DEBUG: Initiating navigator.permissions.query for 'local-network-access'...");
      }
      try {
        const pQuery = (navigator as any).permissions.query({ name: "local-network-access" });
        
        if (!pQuery || typeof pQuery.then !== 'function') {
          if (showSystemLogs) addLog("DEBUG: permissions.query did not return a valid promise.");
          startWs();
          return;
        }

        pQuery.then((result: any) => {
          if (showSystemLogs) {
            addLog(`DEBUG: Permission query resolved. State: ${result.state}`);
          }
          if (result.state === "granted") {
            addLog("SYSTEM: Local network access allowed; open WebSocket");
          } else if (result.state === "prompt") {
            addLog("SYSTEM: Requesting local network permission...");
          }
          startWs();
        })
        .catch((e: any) => {
          if (showSystemLogs) {
            addLog(`DEBUG: Permission query promise rejected: ${e.message || e}`);
          }
          startWs();
        });
      } catch (err: any) {
        if (showSystemLogs) {
          addLog(`DEBUG: Permission query threw synchronously: ${err.message || err}`);
        }
        startWs();
      }
    } else {
      if (isLocal && showSystemLogs && !((navigator as any)?.permissions?.query)) {
        addLog("DEBUG: Browser does not support navigator.permissions.query; skipping check.");
      }
      startWs();
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
    localStorage.setItem(STORAGE_KEYS.INTERVAL_TIME, String(intervalTime));
    localStorage.setItem(STORAGE_KEYS.INTERVAL_COUNT_GOAL, String(intervalCountGoal));
    localStorage.setItem(STORAGE_KEYS.VOICE, String(isVoiceEnabled));
    localStorage.setItem(STORAGE_KEYS.PERSONA, selectedPersona);
    localStorage.setItem(STORAGE_KEYS.CHATTINESS, String(chattiness));
    localStorage.setItem(STORAGE_KEYS.SHOW_SYS, String(showSystemLogs));
    localStorage.setItem(STORAGE_KEYS.SHOW_USER, String(showUserLogs));
    localStorage.setItem(STORAGE_KEYS.ABSTRACTION, String(isTelemetryAbstractionEnabled));
    localStorage.setItem(STORAGE_KEYS.ACTIVITY_VERBALIZATION, String(isActivityVerbalizationEnabled));
    localStorage.setItem(STORAGE_KEYS.SELECTED_ACTIVITY, selectedActivity);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_ACTIVITY, customActivity);
    localStorage.setItem(STORAGE_KEYS.AI_MODEL, selectedModel);
    
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
    finalSessionReportRef.current = null; // Clear final report
    setFinalReportText(null); // Clear UI report
    setSummaries([]);
    setIsSessionActive(false);
    setCurrentSessionState(SessionState.IDLE);
    transitionTimersRef.current = { warmupToMain: null, bonusToRecovery: null, mainToPause: null, pauseToMain: null };
    setIntroText(null);
    setElapsedTime("00:00:00");
    setActiveTime("00:00");
    lastStateTransitionTimeRef.current = Date.now();
    performanceDurationRef.current = 0; // Reset Performance Duration
    activeDurationRef.current = 0;
    hasStartedActiveRef.current = false;
    hasSentFirstMainActiveInsightRef.current = false;
    lastUpdateWallTimeRef.current = 0;
    lastMilestoneCheckSecondRef.current = -1;
    nextActiveTargetRef.current = 60000;
    setTimeout(connect, 300);
  }, [connect, addLog, wsUrl, deviceIdHex, age, weight, gender, trainingGoal, sessionDurationGoal, isVoiceEnabled, selectedPersona, chattiness, showSystemLogs, showUserLogs, isTelemetryAbstractionEnabled, isActivityVerbalizationEnabled, selectedActivity, customActivity, selectedModel]);

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
      narrativeMissionPlanRef.current = null; // Clear narrative plan on start

      // Log initial transition away from IDLE
      transitionState(SessionState.INIT, "User manually started session");

      setSessionStartTime(now);
      setElapsedTime("00:00:00");
      setActiveTime("00:00");
      setSummaries([]);
      setFinalReportText(null);
      finalSessionReportRef.current = null;
      runningMetricsRef.current = { heartPoints: 0, calories: 0, compliantMinutes: 0, performanceMinutes: 0 }; // Reset metrics
      performanceDurationRef.current = 0; // Reset performance duration
      activeDurationRef.current = 0;
      hasStartedActiveRef.current = false;
      hasSentFirstMainActiveInsightRef.current = false;
      lastUpdateWallTimeRef.current = now;
      nextActiveTargetRef.current = 60000;
      lastMilestoneCheckSecondRef.current = -1;
      setIntroText(null);
      transitionTimersRef.current = { warmupToMain: null, bonusToRecovery: null, mainToPause: null, pauseToMain: null };
      
      // Reset Frame Tracking
      sessionStatesInFrameRef.current.clear();
      sessionStatesInFrameRef.current.add(SessionState.INIT);
      stateSamplesInFrameRef.current.clear();
      stateSamplesInFrameRef.current.set(SessionState.INIT, 0);

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
    
    // If we are in an active state but have no summaries yet, don't show the intro text
    // as it makes it look like the system is stuck on the intro.
    const isActive = [SessionState.MAIN_ACTIVE, SessionState.RECOVERY, SessionState.BONUS_ACTIVE].includes(currentSessionState);
    if (isActive && summaries.length === 0) return undefined;

    if (introText) return cleanInsightText(introText);
    return undefined;
  }, [summaries, introText, finalReportText, currentSessionState]);

  // Filter logs for display based on category toggle state
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // System categories regex
      const isSystem = log.message.match(/^(SYSTEM|ERROR|WARNING|AUDIO|VOICE_WARN|VOICE_ERROR|AI_USAGE|AI_REQUEST|AI_INSIGHT_JSON|TELEMETRY|STATE_CHANGE|\[)/);
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
                  {trainingGoal === "Fixed Anaerobic Interval" ? (
                    <>
                      <div className="flex items-center gap-1">
                        <div className="bg-black border border-white/10 text-cyan-400 font-mono text-[9px] px-1.5 py-1.5 w-16 flex items-center justify-center">
                          Int. Time
                        </div>
                        <div className="relative">
                          <input type="number" value={intervalTime} onChange={(e) => setIntervalTime(Math.max(1, parseInt(e.target.value) || 1))} className="bg-black border border-white/10 text-white font-mono text-xs px-2 py-1.5 w-14 focus:outline-none focus:border-cyan-400/50 transition-colors text-right pr-4" />
                          <span className="absolute right-1 top-1.5 text-[8px] text-slate-500">m</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="bg-black border border-white/10 text-cyan-400 font-mono text-[9px] px-1.5 py-1.5 w-16 flex items-center justify-center">
                          Count
                        </div>
                        <div className="relative">
                          <input type="number" value={intervalCountGoal} onChange={(e) => setIntervalCountGoal(Math.max(1, parseInt(e.target.value) || 1))} className="bg-black border border-white/10 text-white font-mono text-xs px-2 py-1.5 w-12 focus:outline-none focus:border-cyan-400/50 transition-colors text-right" />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bg-black border border-white/10 text-cyan-400 font-mono text-xs px-2 py-1.5 w-24 flex items-center justify-center">
                        Duration
                      </div>
                      
                      <div className="relative">
                        <input type="number" value={sessionDurationGoal} onChange={(e) => setSessionDurationGoal(Math.max(1, parseInt(e.target.value) || 20))} className="bg-black border border-white/10 text-white font-mono text-xs px-2 py-1.5 w-20 focus:outline-none focus:border-cyan-400/50 transition-colors text-right pr-6" />
                        <span className="absolute right-2 top-1.5 text-[10px] text-slate-500">m</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="h-10 w-px bg-white/5 hidden md:block" />

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Personality</label>
                <select value={selectedPersona} onChange={(e) => setSelectedPersona(e.target.value)} className="bg-black border border-white/10 text-amber-500 font-mono text-xs px-3 py-1.5 focus:outline-none focus:border-amber-500/50 transition-colors appearance-none cursor-pointer w-32">
                  {Object.keys(PERSONA_CONFIG).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>

              <div className="flex flex-col">
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">AI Model</label>
                <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} className="bg-black border border-white/10 text-indigo-400 font-mono text-xs px-3 py-1.5 focus:outline-none focus:border-indigo-400/50 transition-colors appearance-none cursor-pointer w-48">
                  <option value="gemma-4-26b-a4b-it">Gemma 4 26b a4b it</option>
                  <option value="gemma-4-31b-it">Gemma 4 31b it</option>
                  <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                  <option value="gemini-3.1-flash">Gemini 3.1 Flash</option>
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
                <label className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">Activity Verbalization</label>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsActivityVerbalizationEnabled(!isActivityVerbalizationEnabled)}
                    className={`px-3 py-1.5 border font-bold rounded-sm transition-all uppercase text-[9px] tracking-widest ${isActivityVerbalizationEnabled ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/40 shadow-[0_0_10px_rgba(99,102,241,0.1)]' : 'bg-slate-900/50 text-slate-500 border-white/10 hover:border-white/20'}`}
                  >
                    {isActivityVerbalizationEnabled ? 'Abstract: ON' : 'Abstract: OFF'}
                  </button>
                  {!isActivityVerbalizationEnabled && (
                    <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                      <select 
                        value={selectedActivity} 
                        onChange={(e) => setSelectedActivity(e.target.value)}
                        className="bg-black border border-white/10 text-indigo-400 font-mono text-[10px] px-2 py-1.5 focus:outline-none focus:border-indigo-500/50 transition-colors appearance-none cursor-pointer"
                      >
                        <option value="walking">Walking</option>
                        <option value="running">Running</option>
                        <option value="biking">Biking</option>
                        <option value="vr rythym">VR Rhythm</option>
                        <option value="eliptical">Eliptical</option>
                        <option value="other">Other</option>
                      </select>
                      {selectedActivity === 'other' && (
                        <input 
                          type="text" 
                          value={customActivity} 
                          onChange={(e) => setCustomActivity(e.target.value)}
                          placeholder="Specify activity..."
                          className="bg-black border border-white/10 text-indigo-400 font-mono text-[10px] px-2 py-1.5 w-32 focus:outline-none focus:border-indigo-500/50 transition-colors"
                        />
                      )}
                    </div>
                  )}
                </div>
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