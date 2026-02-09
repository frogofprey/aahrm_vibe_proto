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
  sessionContextSummary?: SessionContext;
  heartPoints: number;
  calories: number;
  tokenUsage?: TokenUsage;
  sessionState?: SessionState;
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