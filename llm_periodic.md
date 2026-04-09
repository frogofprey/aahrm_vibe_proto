# LLM Periodic Prompt Abstraction

This document describes the structure and elements of the periodic LLM prompt used for real-time workout analysis and coaching.

## 1. System Instruction Block
The system instruction defines the persona and the core logic for the analysis.

- **Persona Identity**: The core character traits and background of the selected AI coach.
- **Mission Weight**: A scale (0-1) determining how heavily to incorporate narrative elements into the coaching.
- **Core Constraints**:
    - **Data Input**: Instructions on how to interpret "Minute Packets" (BPM samples, averages, trends).
    - **PII Isolation**: Prohibition on guessing user identity; reliance on "Zone" context.
    - **Signal Noise**: Prioritization of trends over individual telemetry spikes.
    - **Telemetry Abstraction (Conditional)**: 
        - *If Enabled*: Instruction to use qualitative descriptors instead of raw BPM values unless for safety.
    - **Anti-Repetition**: Rules for varying sentence structure, metaphors, and avoiding catchphrase fatigue.
    - **Corrections**: Logic for providing pace steering (speed up/slow down) based on target zones and "redline" (MHR) proximity.
    - **Milestones**: Instructions for incorporating narrative events from the Mission Plan based on active session time.
    - **Context Usage**: Guidance on using the Objective Status Tracker and Session State to calibrate motivational tone without reciting raw stats.
    - **Saliency Scoring**: Requirements for providing a 1-10 score based on data urgency (1-3: Routine, 4-6: Notable/Narrative, 7-10: Critical/Safety).
    - **Output Format**: Strict requirement to start with `Score: [X] | [Analysis Text]`.

## 2. Session Context Block
Provides the "Mid-Term Memory" and current progress.

- **Wall Time**: The current local time for temporal grounding.
- **Mid-Term Session Context**: A recursive summary of the overall session trend updated every minute.
- **Objective Status Tracker**:
    - **Progress**: Current time vs. Goal duration OR Current intervals vs. Goal count.
    - **Compliance**: Ratio of performance minutes spent in target zones vs. total performance minutes.
- **Current Session State**: The current functional state (e.g., `WARMUP`, `MAIN_ACTIVE`, `RECOVERY`, `PAUSE`, `BONUS_ACTIVE`).

## 3. History Block (Short-Term Context)
Maintains continuity by providing the immediate past.

- **Recent History**: 
    - Metrics (Avg/Max BPM) and Coach Feedback from the previous 2 minutes.
    - *Initial Packet*: Includes the Coach's initial session introduction.

## 4. Current Minute Packet (Telemetry)
The raw data for the current minute.

- **Metrics**: Average, Maximum, and Minimum BPM for the last 60 seconds.
- **HR Trend**: A qualitative descriptor of the heart rate movement over the last 10 seconds.
- **Activity Verbalization (Conditional)**:
    - *If Disabled*: Explicit mention of the activity the user is performing (e.g., "Cycling", "Running").
- **Performance Data**: Calories burned and Heart Points earned in the last minute.
- **Raw Telemetry Stream**: The full array of individual BPM samples collected during the minute.
- **Current Timers**: The total "Active Time" (excluding pauses/warmup if applicable) used for milestone synchronization.
