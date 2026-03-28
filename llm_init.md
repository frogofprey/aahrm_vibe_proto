# LLM Initialization Prompt Abstraction

This document describes the structure and elements of the initialization LLM prompt used to start a workout session.

## 1. Persona and Goal Definition
The initialization prompt sets the stage for the session by defining the AI's identity and the user's objectives.

- **Persona Identity**: The core character traits and background of the selected AI coach.
- **User Goal**: The title of the selected training objective (e.g., "Fat Burn", "Endurance").
- **Activity Context (Conditional)**:
    - *If Disabled*: Explicit mention of the activity the user is performing (e.g., "Cycling", "Running").
- **Objectives Context**:
    - **Time-Based**: "Mission Parameter: Target Duration: [mins]"
    - **Interval-Based**: "Mission Parameter: Target Intervals: [cycles] of [mins] each."

## 2. Narrative Mission Plan (Conditional)
If a Narrative Mission Plan was generated, it is provided to the LLM to ensure the introduction incorporates the theme immediately.

- **Theme**: The recontextualized workout goal (e.g., "Operation Laser-Pointer").
- **Timeline**: A list of milestones and narrative events triggering throughout the session.
- **Mission Complete**: The narrative conclusion and Maguffin (e.g., "Golden Yarn Trophy").
- **Bonus/Overtime**: The narrative context for continuing past the goal.

## 3. Telemetry Abstraction (Conditional)
- **Instruction**: If enabled, the LLM is instructed to use qualitative descriptors instead of raw BPM values (e.g., "Your pulse is steady" instead of "145 bpm").

## 4. Task and Instructions
The specific instructions for generating the introduction.

- **Task**: Generate an introduction to initiate the session.
- **Instruction**: 
    - Reference the Mission Parameter naturally.
    - Speak to the user directly, avoiding reading settings back as a list.
    - Incorporate the theme from the Narrative Mission Plan immediately.
- **Constraint**: Strictly adhere to the persona.
