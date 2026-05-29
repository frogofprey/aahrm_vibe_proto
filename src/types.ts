export interface HeartRateData {
  hr: number;
  timestamp: string;
  isAiRequest?: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  total: number;
}

export interface SessionContext {
  text: string;
  prompt: string;
  tokenUsage?: TokenUsage;
}

export enum SessionState {
  IDLE = 'IDLE',
  INIT = 'INIT',
  WARMUP = 'WARMUP',
  MAIN_ACTIVE = 'MAIN_ACTIVE',
  PAUSE = 'PAUSE',
  BONUS_ACTIVE = 'BONUS_ACTIVE',
  RECOVERY = 'RECOVERY',
  ERROR = 'ERROR'
}

export interface AiInsightResponse {
  saliency_score: number;
  milestone_tag_id: string;
  coaching_directive: string;
  persona_narrative: string;
  tts_instruction: string;
  perceived_state: string;
}

export interface MinuteSummary {
  id: string;
  timestamp: string;
  avg: number;
  max: number;
  min: number;
  sampleCount: number;
  values: number[];
  insight?: string;
  isAnalyzing?: boolean;
  prompt?: string;
  heartPoints: number;
  calories: number;
  tokenUsage?: TokenUsage;
  sessionState?: SessionState;
  saliencyScore?: number;
  milestoneTagId?: string;
  coachingDirective?: string;
  ttsInstruction?: string;
  perceivedState?: string;
  rawJson?: string;
  targetZoneInfo?: string;
  coachingDirection?: string;
  safetyAlert?: boolean;
  milestoneLabel?: string;
  importance?: number;
  activeTime?: number;
  smoothedHR?: number;
  llmLatency?: number;
  ttsLatency?: number;
}

export enum ConnectionStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR'
}

export interface ZoneConfig {
  min: number;
  max: number;
  label: string;
  color: string;
  glowClass: string;
  borderClass: string;
  textClass: string;
}

export interface NarrativeMilestone {
  timeInSeconds: number;
  timeLabel: string;
  label: string;
  narrative: string;
}

export interface ParsedNarrativePlan {
  theme?: string;
  maguffin?: string;
  antagonist?: string;
  protagonist?: string;
  missionComplete?: string;
  bonus?: string;
}

export interface TrainingObjective {
  title: string;
  targetZones: number[];
  mission: string;
  transitionStrategy: string;
  warmupGoal: string;
  mainGoal: string;
  recoveryGoal: string;
}

export interface VerbalTicOption {
  value: string;
  weight: number; // e.g. 0.8 for Meow, 0.2 for Nyaa
}

export interface VerbalTicConfig {
  id: string;
  label: string;
  instruction: string;
  probability?: number;         // Occurrence probability (0 to 1), if omitted or 1.0 it is "always on"
  variants?: VerbalTicOption[]; // Dynamic options weighted relative to each other
  critProbability?: number;     // Active crit chance (0 to 1), e.g. 0.05 for 5% double cast
}

export interface PersonaConfig {
  systemInstruction: string;
  missionProfile: string;
  missionWeight: number;
  voiceName: string;
  ttsBaselineInstruction: string;
  iterationBrevityDriver: string;
  verbalTics?: VerbalTicConfig[];
}
