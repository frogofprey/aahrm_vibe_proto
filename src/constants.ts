import { PersonaConfig } from './types';
import { personalityData } from './personality';

export const STORAGE_KEYS = {
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
  CUSTOM_ACTIVITY: 'aetheraegis_custom_activity'
};

export const MAX_DATA_POINTS = 50;
export const MAX_LOG_ENTRIES = 100;
export const HR_MIN_VALID = 40;
export const HR_MAX_VALID = 220;

export const PERSONA_CONFIG: Record<string, PersonaConfig> = personalityData;

export const ZONES_TEMPLATE = [
  { label: 'Zone 1: Warm Up', color: '#64748b', glowClass: 'shadow-[0_0_30px_rgba(100,116,139,0.15)]', borderClass: 'border-slate-500/40', textClass: 'text-slate-400' },
  { label: 'Zone 2: Fat Burn', color: '#3b82f6', glowClass: 'shadow-[0_0_30px_rgba(59,130,246,0.25)]', borderClass: 'border-blue-500/40', textClass: 'text-blue-400' },
  { label: 'Zone 3: Aerobic', color: '#22c55e', glowClass: 'shadow-[0_0_30px_rgba(34,197,94,0.25)]', borderClass: 'border-green-500/40', textClass: 'text-green-400' },
  { label: 'Zone 4: Anaerobic', color: '#f59e0b', glowClass: 'shadow-[0_0_30px_rgba(245,158,11,0.25)]', borderClass: 'border-orange-500/40', textClass: 'text-orange-400' },
  { label: 'Zone 5: Red Line', color: '#ef4444', glowClass: 'shadow-[0_0_40px_rgba(239,68,68,0.35)]', borderClass: 'border-red-500/40', textClass: 'text-red-500' },
];

export const TELEMETRY_ABSTRACTION_INSTRUCTION = `Telemetry Abstraction: Do NOT recite raw BPM values (e.g., "145 bpm") unless critically necessary for safety (Score 7+). Instead, use qualitative descriptors appropriate for your personality and the mission.`;

export const BASE_SYSTEM_INSTRUCTION = `
Data Input: You will receive "Minute Packets" containing an array of raw BPM samples, an average, and a Max/Min.
Core Constraints:
PII Isolation: Do not attempt to guess the user's age or identity. Use the provided "Zone" context as the absolute truth for intensity.
Signal Noise: Prioritize trends over individual samples.
{{TELEMETRY_CONSTRAINT}}
Anti-Repetition: Review [HISTORY] and [MID-TERM CONTEXT] before writing. Vary on three levels: (1) sentence structure — avoid defaulting to the same grammatical frame across consecutive responses; (2) metaphor clusters — retire any concept (not just term) used in the last 3 responses, even if expressed with different words; (3) catchphrases — signature tics defined in the persona profile are permitted; other repeated phrases should be used sparingly. Suspended for critical safety warnings (Score 7+).
Corrections: the input telemetry will show you the users current heart rate and past trends. Provide the user instructions to move their heart rate to the target zone by giving clear instructions in character to slow down, speed up or maintain current pace. Be very clear and highlight cases where the heart rate is above the specified redline or maximum heart rate (MHR) Note that target heart rates may change depending on the state of the session. If the user is more than one zone away from the target, increase the urgency of the instruction. 
Milestones: Narrative Milestones are noted by a time tag and a narrative block (0:00 [Instance Loading]) followed by flavor text you can use to increase immersion. Use the active_time provided in the message to note when a narrative milestone is relevant to the current update. The milestone should only be noted when the current active_time exactly matches the time in the narrative block, but subsequent updates can still use it for flavor or immersion. The milestone should be clear to the user and in character. Do not attempt to create new milestones. HARD CONSTRAINT: Do NOT process milestones during warmup state. 
Goal: The current state is shown in the objective block. Be sure to remark on state changes when appropriate. In general an update will consiste of a Correction followed by a Milestone if the active_time matches the narrative milestone exactly. If both are relevant the correction should come first and be clear to the user and then be followed by a milestone update. If a milestone is relevant for this update, ensure that the nature of the milestone is made extremely clear to the user - use a separate sentence to enforce this. Ensure that pace steering advice is not contradicted by milestone updates.  
Mission Plan: {{GOAL}}
Context Usage: You will receive an [OBJECTIVE STATUS TRACKER] and [CURRENT SESSION STATE]. These are purely contextual inputs for your awareness. DO NOT recite these stats in your output. Use them only to calibrate your motivational tone (e.g., if behind, encourage; if ahead, praise).
Saliency Scoring: At the end of every analysis, provide a Saliency Score (1-10) based on the urgency or novelty of the data.
1-3: Routine data, no significant change. The user is in the target zone and no corrections or mission milestones are relevant. 
4-6: Notable trend shift or minor zone boundary approach. Any mission milestones should be rated a minimum of 6 in order to ensure that the user will hear them. User is under target zone and needs instruction to increase towards the target. Reserve score 6 for narrative only updates. 
7-10: Critical breach or safety alert. The user is well over the target zone, the score should reach 10 if the user has exceeded his MHR for more than 10 seconds. 
`;

export const ENV_WS_URL = (process.env as any).WS_URL || 'ws://localhost:8080';
export const ENV_DEVICE_HEX = (process.env as any).DEVICE_ID || '00:00:00:00:00:00';
export const ENV_DEFAULT_AGE = parseInt((process.env as any).DEFAULT_AGE || '30');
export const ENV_DEFAULT_WEIGHT = parseInt((process.env as any).DEFAULT_WEIGHT || '150');
export const ENV_DEFAULT_DURATION = parseInt((process.env as any).DEFAULT_DURATION || '20');
export const ENV_DEFAULT_CHATTINESS = parseInt((process.env as any).DEFAULT_CHATTINESS || '4');
