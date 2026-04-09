# LLM Final Report Prompt Abstraction

This document describes the structure and elements of the final session report LLM prompt used to conclude a workout.

## 1. Persona and Goal Definition
The final report is generated in the persona's voice to provide closure.

- **Persona Identity**: The core character traits and background of the selected AI coach.
- **User Goal**: The title of the selected training objective.
- **Activity Context (Conditional)**:
    - *If Disabled*: Explicit mention of the activity the user is performing (e.g., "Cycling", "Running").
- **Mission Plan / Profile**: The baseline targets and narrative story arc used during the session.

## 2. Session Stats Block
The raw performance data for the entire session.

- **Total Wall Time**: The total time elapsed from start to finish.
- **Active Workout Time**: The total time spent in active workout states (excluding pauses/warmup).
- **Avg/Peak HR**: The average and peak heart rate recorded during the session.
- **Calories/Heart Points**: Total calories burned and heart points earned.
- **Intervals Completed (Conditional)**:
    - *If Interval Strategy*: The number of intervals completed vs. the goal count.
- **Zone Compliance**: The ratio of performance minutes spent in target zones vs. total performance minutes.

## 3. Context and Timeline Block
The historical context of the session.

- **Session State Timeline**: A chronological list of all state transitions (e.g., `WARMUP` -> `MAIN_ACTIVE` -> `RECOVERY`).
- **Mid-Term Trend**: The final recursive summary of the overall session performance.
- **Last Minute Insight**: The specific analysis from the final minute of the workout.

## 4. Telemetry Abstraction (Conditional)
- **Instruction**: If enabled, the LLM is instructed to use qualitative descriptors instead of raw BPM values in the report.

## 5. Task and Constraints
The specific instructions for generating the final report.

- **Task**: Generate a final session report.
- **Constraints**:
    - Professional, summary-focused, and concluding.
    - Generous with ending workout stats.
    - Explicitly mention major milestones achieved, the "Boss", and the "Maguffin".
    - Use "Active Duration" as the primary reference for intensity and timing.
    - Include a final word of encouragement.
    - Maximum of four sentences.
    - Output strictly in prose (no markdown tags) for TTS compatibility.
