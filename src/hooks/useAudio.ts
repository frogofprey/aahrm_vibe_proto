import { useCallback, useRef, useEffect } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { PERSONA_CONFIG } from '../constants';
import { decodeBase64, decodeAudioData, extractUsage } from '../lib/utils';

export function useAudio(isVoiceEnabled: boolean, selectedPersona: string, addLog: (msg: string) => void) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isAudioPlayingRef = useRef<boolean>(false);
  const activeSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const processAudioQueueRef = useRef<() => void>(() => {});

  const processAudioQueue = useCallback(async () => {
    if (isAudioPlayingRef.current || audioQueueRef.current.length === 0) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    const ctx = audioContextRef.current;
    
    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch (e) {
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
        processAudioQueueRef.current();
    };

    source.start();
  }, []);

  useEffect(() => {
    processAudioQueueRef.current = processAudioQueue;
  }, [processAudioQueue]);

  const speakInsight = useCallback(async (text: string, customTtsInstruction?: string) => {
    if (!isVoiceEnabled) return;
    
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const voiceName = personaConfig.voiceName;
    const ttsBase = (typeof customTtsInstruction === 'string' ? customTtsInstruction : undefined) || personaConfig.ttsBaselineInstruction;

    const cleanTtsBase = ttsBase.replace(/[:;]/g, '');
    const cleanPayload = text.replace(/[:;]/g, '');
    const finalTtsPrompt = `${cleanTtsBase}: ${cleanPayload}`;

    const maxRetries = 1;
    let attempt = 0;

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
        const audioBuffer = await decodeAudioData(
          decodeBase64(base64Audio),
          ctx,
          24000,
          1,
        );

        audioQueueRef.current.push(audioBuffer);
        addLog(`VOICE: Segment buffered. Queue size: ${audioQueueRef.current.length}`);
        processAudioQueue();
        return;

      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        addLog(`VOICE_WARN: Attempt ${attempt + 1} failed: ${errorMsg}`);
        attempt++;
        if (attempt > maxRetries) break;
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }, [isVoiceEnabled, selectedPersona, addLog, processAudioQueue]);

  const stopAudio = useCallback(() => {
    if (activeSourceNodeRef.current) {
        try { activeSourceNodeRef.current.stop(); } catch (e) {}
        activeSourceNodeRef.current = null;
    }
    audioQueueRef.current = [];
    isAudioPlayingRef.current = false;
  }, []);

  const resumeAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    }
    if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  return { speakInsight, stopAudio, resumeAudioContext };
}
