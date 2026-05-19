# LLM Periodic Prompt Abstraction

This document describes the structure and elements of the periodic LLM prompt used for real-time workout analysis and coaching. The prompt is structured hierarchically using XML-like tags, ordered from static to volatile data.

## 1. Task Section (`<task>`)
Defines the core logic and output requirements. This is the most static part of the prompt.
**Constraint**: 600 `maxOutputTokens` in `generationConfig`.
**Model**: User-selected (Gemma/Gemini) with `ThinkingLevel.MINIMAL`.

- **General Instructions**: 
    - **Data Input**: How to interpret the telemetry, importance, and safety metrics in `<current_minute_packet>`.
    - **PII Isolation**: Prohibition on guessing user identity.
    - **Signal Noise**: Prioritization of trends over individual telemetry spikes.
    - **Telemetry Abstraction (Conditional)**: Instruction to use qualitative descriptors if enabled.
    - **Anti-Repetition**: Rules for varying responses based on `<short_term_context>`.
    - **Corrections**: Guidance on using the provided Coaching Direction.
    - **Milestones**: Instructions for incorporating narrative events from the `<milestone>` block when present.
    - **Goal**: Instructions to focus on pace steering and milestone updates.
    - **Saliency Scoring**: Requirements for the 1-10 urgency score.
- **Output Format**: Strict requirement to return ONLY the persona narration text as plain text. No JSON or markdown.
- **Markdown Constraint**: Hard constraint to NOT use markdown in the final output.

## 2. Persona Section (`<persona>`)
Defines the AI's identity and communication style.

- **Identity**: The core character traits and background.
- **Brevity Driver**: Instruction to drive the length and style of responses.

## 3. Short-Term Context Section (`<short_term_context>`)
Maintains continuity by providing the immediate past (previous 3 minutes of feedback/insights) and the initial session intro narrative.

## 4. Current Minute Packet Section (`<current_minute_packet>`)
Streamlined real-time telemetry and coaching direction.

- **BPM**: (cur/avg/max/min) slash-separated values.
- **Coaching Direction**: The calculated directive for the user.
- **Importance**: The calculated urgency for this update.
- **Safety Flag**: Explicit alert if safety limits are breached.

## 5. Milestone Section (`<milestone>`)
Conditional block populated only when a narrative event is active for the current packet. Includes time label, event title, and narrative context.

## 6. Output Processing
The LLM returns plain text which is pre-pended with the baseline TTS instruction and sent to the TTS engine. Voice trigger is gated by the a priori importance score assigned to the telemetry packet.
