# Personality Data Schema

This document describes the schema used for defining AI coaching personas for the AetherAegis dashboard. This schema applies to both the active TypeScript configuration (`personality.ts`) and potential future JSON exports.

## Data Structure

The root object is a Dictionary (Key-Value pair) where:
*   **Key**: The display name of the Persona (e.g., "Arlie", "Chad").
*   **Value**: A `PersonaConfig` object containing the behavior instructions.

## Schema Definition

```typescript
export const PERSONALITY_DATA_VERSION = "1.0.0";

interface VerbalTicOption {
  value: string;
  weight: number;              // Dynamic variant weighting relative to each other (e.g. 0.8 for "Meow", 0.2 for "Nyaa")
}

interface VerbalTicConfig {
  id: string;
  label: string;
  instruction: string;
  probability?: number;         // Occurrence probability (0 to 1), if omitted or 1.0 it is "always on"
  variants?: VerbalTicOption[]; // Dynamic options weighted relative to each other for randomized outputs
  critProbability?: number;     // Active crit chance (0 to 1), e.g. 0.05 for 5% double cast probability
}

interface PersonaConfig {
  /**
   * Version of the persona definition (e.g., "1.0.0").
   */
  version?: string;

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

  /**
   * Optional list of dynamic triggers/sound configurations loaded for the persona.
   */
  verbalTics?: VerbalTicConfig[];
}
```

## Active Personas

* **Arlie** (`v1.0.0`, Voice: `Zubenelgenubi`): Hardened space marine combat trainer.
* **Chad** (`v1.0.0`, Voice: `Algieba`): Arrogant gym-bro locked in a one-sided pride competition.
* **Ginger-Chan** (`v1.0.0`, Voice: `Leda`): AI Cat-Girl vtuber treating the workout as an action MMO boss battle.
* **Friday** (`v1.0.0`, Voice: `Kore`): Gothic researcher / poet of the void speaking in rhythmic prose.
* **Kaelen** (`v1.0.0`, Voice: `Sulafat`): Gothic-noble half-vampire bound by an ancient pact in a dungeon crawl.

## Example Entry

```json
"Ginger-Chan": {
  "version": "1.0.0",
  "systemInstruction": "You are Ginger-Chan, an AI Cat-Girl vtuber...",
  "missionProfile": "You view the session as a video game boss battle...",
  "missionWeight": 0.7,
  "voiceName": "Leda",
  "ttsBaselineInstruction": "Use a high-pitched, bubbly, and hyper-energetic delivery...",
  "iterationBrevityDriver": "Every update MUST be a rapid, single-breath callout...",
  "verbalTics": [
    {
      "id": "ginger_meow_nya",
      "label": "Meow/Nya Sounds",
      "instruction": "Include happy cat-girl verbal sounds in your response.",
      "probability": 1.0,
      "critProbability": 0.05,
      "variants": [
        { "value": "Meow", "weight": 0.8 },
        { "value": "Nyaa", "weight": 0.2 }
      ]
    },
    {
      "id": "ginger_cat_puns",
      "label": "Cat Puns",
      "instruction": "Incorporate feline/cat puns naturally.",
      "probability": 0.80
    }
  ]
}
```