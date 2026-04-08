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
   * The baseline TTS instruction for the persona.
   */
  ttsBaselineInstruction: string;

  /**
   * A string instruction to drive the brevity and style of the AI's 
   * responses during the session.
   */
  iterationBrevityDriver: string;
}
```

## Example Entry

```json
"Arlie": {
  "systemInstruction": "You are Arlie, a hardened space marine combat trainer...",
  "missionProfile": "You consider this session a military defense...",
  "missionWeight": 0.4,
  "voiceName": "Zebenelgenubi",
  "ttsBaselineInstruction": "Use a deep, gravelly, authoritative delivery...",
  "iterationBrevityDriver": "Keep reports tactical and brief. Focus on mission status."
}
```