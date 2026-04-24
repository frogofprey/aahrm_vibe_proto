# LLM Periodic Prompt Abstraction

This document describes the structure and elements of the periodic LLM prompt used for real-time workout analysis and coaching. The prompt is structured hierarchically using XML-like tags, ordered from static to volatile data.

## 1. Task Section (`<task>`)
Defines the core logic and output requirements. This is the most static part of the prompt.
**Constraint**: 600 `maxOutputTokens` in `generationConfig`.

- **General Instructions**: 
    - **Data Input**: How to interpret the telemetry in `<current_minute_packet>`.
    - **PII Isolation**: Prohibition on guessing user identity.
    - **Signal Noise**: Prioritization of trends over individual telemetry spikes.
    - **Telemetry Abstraction (Conditional)**: Instruction to use qualitative descriptors if enabled.
    - **Anti-Repetition**: Rules for varying responses based on `<short_term_context>`.
    - **Corrections**: Logic for pace steering based on `<current_minute_packet>` and target zones.
    - **Milestones**: Instructions for incorporating narrative events from `<mission_profile>` based on `<current_timers>`.
    - **Goal**: Instructions to remark on state changes in `<objective_tracker>`.
    - **Context Usage**: Guidance on using `<objective_tracker>` and `<transition_history>` for tone calibration.
    - **Saliency Scoring**: Requirements for the 1-10 urgency score.
- **Output Format (JSON)**: Strict requirement to return a JSON object (see Section 9).
- **Markdown Constraint**: Hard constraint to NOT use markdown in the final output.

## 2. Persona Section (`<persona>`)
Defines the AI's identity and communication style.

- **Identity**: The core character traits and background.
- **Brevity Driver**: Instruction to drive the length and style of responses.
- **Mission Weight**: Scale (0-1) for narrative incorporation.
- **Baseline TTS Instruction**: The default direction for audio synthesis.

## 3. Mission Profile Section (`<mission_profile>`)
Establishes the "Ground Truth" and story arc for the session.

- **Goal**: The selected training objective.
- **Activity Context**: The specific activity being performed.
- **Mission Profile**: Baseline HR targets and phase protocols.
- **Narrative Mission Plan**: The fictional story arc and timeline of milestones.

## 4. Objective Tracker Section (`<objective_tracker>`)
Provides real-time progress against goals.

- **Progress**: Current time vs. Goal duration OR Current intervals vs. Goal count.
- **Compliance**: Ratio of performance minutes spent in target zones.
- **Current Session State**: The functional state (e.g., `WARMUP`, `MAIN_ACTIVE`, `RECOVERY`).

## 5. Transition History Section (`<transition_history>`)
Log of all state changes within the session (e.g., `WARMUP -> MAIN_ACTIVE`).

## 6. Short-Term Context Section (`<short_term_context>`)
Maintains continuity by providing the immediate past (previous 3 minutes of metrics and feedback).

## 7. Current Minute Packet Section (`<current_minute_packet>`)
The volatile telemetry data for the current minute.

- **Metrics**: Average, Maximum, and Minimum BPM.
- **HR Trend**: Qualitative descriptor of recent movement.
- **Performance Data**: Calories burned and Heart Points earned.
- **Raw Telemetry Stream**: The full array of individual BPM samples.

## 8. Current Timers Section (`<current_timers>`)
The most volatile temporal data.

- **Wall Time**: Current local time.
- **Active Time**: Total time spent in performance states, used for milestone synchronization.

## 9. Output Format (JSON)
The LLM must return a JSON object with the following schema:

```json
{
  "saliency_score": number,  
  "milestone_tag_id": string, // relevant milestone name (the value in brackets). if none, return "none".
  "coaching_directive": "MAINTAIN_PACE" | "INCREASE_EFFORT" | "DECREASE_EFFORT" | "EMERGENCY_STOP" | "PREPARE_TRANSITION",
  "persona_narrative": string, // The flavor text, constrained by the persona element.
  "tts_instruction": string, // Modification of Baseline TTS Instruction to direct output.
  "perceived_state": "warmup" | "main_active" | "recovery" | "bonus_active" | "pause" | "error"
}
```
