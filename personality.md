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
   * The specific Google Cloud Text-to-Speech voice model name to be used.
   * Examples: "Enceladus", "Puck", "Kore".
   */
  voiceName: string;

  /**
   * Instructions for the Text-to-Speech generation engine to influence 
   * the delivery style (tone, speed, emotion) of the synthesized audio.
   * This is prepended to the text sent to the TTS model.
   */
  ttsInstruction: string;
}
```

## Example Entry

```json
"Arlie": {
  "systemInstruction": "You are Arlie, a combat trainer with a corrupt logic core...",
  "voiceName": "Enceladus",
  "ttsInstruction": "Use a deep, authoritative, and staccato delivery..."
}
```