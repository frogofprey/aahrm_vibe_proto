# Session Log Schema (`session_*.txt`)

The **Session Log** is a comprehensive "Black Box" recording of the entire workout session. It contains every piece of data available to the system, including raw telemetry, full prompt chains, token usage metrics, and internal state transitions.

**Filename Format**: `session_YYYYMMDDHHMM.txt`

## 1. Header & Configuration
Contains the static configuration and final aggregated stats for the session.

*   **Subject Data**: Age, Weight, Gender, **Activity** (e.g., "Running").
*   **Mission Config**: Training Goal, Strategy, Target Objectives (Time/Intervals).
*   **Final Aggregates**: Total Calories, Total Heart Points, **Intervals Completed** (if applicable), Zone Compliance (Performance Minutes / Active Minutes).
*   **System Config**: Device ID, Personality, Voice Profile, Chattiness Threshold, **Telemetry Abstraction** (Enabled/Disabled).
*   **Final Report**: The text of the final spoken summary + Token Usage.
*   **State Transition History**: A timestamped log of every state change (e.g., `INIT -> WARMUP -> MAIN_ACTIVE -> PAUSE -> BONUS_ACTIVE -> RECOVERY`) and the triggering reason. Transitions are driven by heart rate thresholds with a 6-second debounce.

## 2. LLM Generation Logs
Each major AI generation event includes the **Prompt** sent to the model, the **Response** received, and the **Token Usage** (Input/Output/Total).

*   **Mission Profile**: The "Ground Truth" protocol generated at start.
*   **Narrative Mission Plan**: The story arc generated based on the profile.
*   **Session Intro**: The opening line spoken by the coach.

## 3. Minute Packets (Timeline)
A detailed breakdown of every minute recorded during the session.

For each minute `N`:
*   **Timestamp**: Wall clock time.
*   **Active Time**: Time spent in performance states (MM:SS).
*   **State**: The dominant session state (e.g., `MAIN_ACTIVE`).
*   **Biometrics**: Avg BPM, Max BPM, Min BPM, Sample Count.
*   **Targets**: Target Zone Info, **Coaching Direction**, **Safety Flag**, **Milestone Event**.
*   **Metrics**: Calories burned (minute), Heart Points earned (minute).
*   **Context Memory**: The "Mid-Term Memory" context available to the AI at this moment (Text + Prompt + Tokens).
*   **AI Analysis**:
    *   **Prompt**: The exact prompt sent to the LLM, including history, telemetry, and **Activity Context**.
    *   **Insight**: The persona narrative text.
    *   **AI JSON**: The full raw JSON response from the LLM.
    *   **Token Usage**: Input/Output tokens for this specific call.
*   **Raw Values**: The array of raw heart rate integer samples collected during this minute.

## 4. Final Diagnostics
*   **Final Report Prompt**: The prompt used to generate the conclusion.
*   **Raw Response**: The raw text output.
