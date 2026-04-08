import { TokenUsage } from '../types';

// --- Audio Decoding Utilities ---
export function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function decodeAudioData(
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
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatMMSS(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// --- Text Cleaning Utility ---
export function cleanInsightText(text: string): string {
  // Removes "Score: [X] | " or "Score: X | " prefix case-insensitively
  // AND removes any trailing [debug info] blocks in brackets
  return text
    .replace(/^Score:\s*\[?[\d.]+\]?\s*\|\s*/i, '')
    .replace(/(\s*\[[^\]]*\]\s*)+$/, '')
    .trim();
}

// --- Token Usage Extraction Utility ---
export function extractUsage(response: any): TokenUsage | undefined {
    if (response.usageMetadata) {
        return {
            input: response.usageMetadata.promptTokenCount || 0,
            output: response.usageMetadata.candidatesTokenCount || 0,
            total: response.usageMetadata.totalTokenCount || 0
        };
    }
    return undefined;
}
