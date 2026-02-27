# Personality Data Schema

This document describes the schema used for defining AI coaching personas for the AetherAegis dashboard. This schema applies to both the active TypeScript configuration (`personality.ts`) and potential future JSON exports.

## Data Structure

The root object is a Dictionary (Key-Value pair) where:
*   **Key**: The display name of the Persona (e.g., "Arlie", "Chad").
*   **Value**: A `PersonaConfig` object containing the behavior instructions.

## Schema Definition

```typescript
interface PersonaConfig {
  /**
   * The core system instruction defining the AI's personality, backstory, 
   * and attitude towards the user and the workout data.
   */
  systemInstruction: string;

  /**
   * Instructions for how the persona should interpret and structure the 
   * narrative mission plan based on the baseline mission profile.
   */
  missionProfile: string;

  /**
   * A weight (0.0 to 1.0) indicating how strongly the persona should 
   * prioritize narrative elements in its minute-by-minute updates.
   */
  missionWeight: number;

  /**
   * The specific Google Cloud Text-to-Speech voice model name to be used.
   * Examples: "Zebenelgenubi", "Algieba", "Leda", "Kore", "Sulafat".
   */
  voiceName: string;

  /**
   * TTS instructions for low-saliency responses (Score 1-3).
   */
  tts13Instruction: string;

  /**
   * TTS instructions for mid-saliency responses (Score 4-6).
   */
  tts46Instruction: string;

  /**
   * TTS instructions for high-saliency responses (Score 7-10).
   */
  tts70Instruction: string;
}
```

## Example Entry

```json
"Arlie": {
  "systemInstruction": "You are Arlie, a hardened space marine combat trainer...",
  "missionProfile": "You consider this session a military defense...",
  "missionWeight": 0.4,
  "voiceName": "Zebenelgenubi",
  "tts13Instruction": "Use a deep, gravelly delivery...",
  "tts46Instruction": "Use a deep, authoritative delivery...",
  "tts70Instruction": "Use an explosively loud delivery..."
}
```