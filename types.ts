
export interface HeartRateData {
  hr: number;
  timestamp: string;
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
