# LLM Periodic Prompt Abstraction

This document describes the structure and elements of the periodic LLM prompt used for real-time workout analysis and coaching. The prompt is structured hierarchically using explicit category headers with colons, ordered from static to volatile data.

## 1. Task Section (`task:`)
Defines the core logic and output requirements. This is the most static part of the prompt.
**Constraint**: 600 `maxOutputTokens` in `generationConfig`.
**Model**: User-selected (Gemma/Gemini) with `ThinkingLevel.MINIMAL`.

- **General Instructions**: 
    - **Data Input**: How to interpret the telemetry, importance, and safety metrics in `current_minute_packet`.
    - **PII Isolation**: Prohibition on guessing user identity.
    - **Signal Noise**: Prioritization of trends over individual telemetry spikes.
    - **Telemetry Abstraction (Conditional)**: Instruction to use qualitative descriptors if enabled.
    - **Anti-Repetition**: Rules for varying responses based on `short_term_context`.
    - **Corrections**: Guidance on using the provided Coaching Direction.
    - **Milestones**: Instructions for incorporating narrative events from the `milestone` section when present.
    - **Warmup State Specific Instruction (Conditional)**: Active only in the `WARMUP` state, prompting the coach to acknowledge and encourage warming up.
    - **Goal**: Instructions to focus on pace steering and milestone updates.
    - **Saliency Scoring**: Requirements for the 1-10 urgency score.
- **Output Format**: Strict requirement to return ONLY the persona narration text as plain text. No JSON or markdown.
- **Markdown Constraint**: Hard constraint to NOT use markdown in the final output.

## 2. Persona Section (`persona:`)
Defines the AI's identity and communication style.

- **Identity**: The core character traits and background.
- **Brevity Driver**: Instruction to drive the length and style of responses.

## 3. Narrative Mission Plan Section (`narrative_mission_plan:`)
Provides a randomized selection of narrative context elements extracted from the step-1 generation to foster more varied and unique responses, governed by the importance score of the current packet.

- **[PROTAGONIST]**: The user's thematic role (always present, 100% of the time).
- Other elements are conditionally included based on the **Importance Score Probability Matrix**:
    - **Importance 1-3 (Low Stress)**: [THEME] 40%, [ANTAGONIST] 20%, [MAGUFFIN] 30%
    - **Importance 4-6 (Moderate Stress)**: [THEME] 10%, [ANTAGONIST] 45%, [MAGUFFIN] 10%
    - **Importance 7-8 (High Stress)**: [THEME] 0%, [ANTAGONIST] 15%, [MAGUFFIN] 0%
    - **Importance 9-10 (Critical Danger)**: [THEME] 0%, [ANTAGONIST] 0%, [MAGUFFIN] 0% (All omitted except Protagonist to focus purely on instruction/coaching)

## 4. Milestone Section (`milestone:`)
Conditional block populated only when a narrative event is active for the current packet. Placed directly after the `narrative_mission_plan` section. Includes the event title and narrative context (excludes the timing/timestamp). If this represents the final milestone of the main session, an explicit instruction is appended: "Final Milestone: acknowledge the end of the main session and give the user the option of continuing or slowing down towards recovery."

## 5. Short-Term Context Section (`short_term_context:`)
Maintains continuity by providing the immediate past (previous 3 minutes of feedback/insights) and the initial session intro narrative.

## 6. Current Minute Packet Section (`current_minute_packet:`)
Streamlined real-time telemetry and coaching direction.

- **BPM**: Current smoothed HR value.
- **Coaching Direction**: The calculated directive for the user.
- **Importance**: The calculated urgency for this update, formatted as a fraction of 10 (e.g., 5/10).
- **Safety Flag**: Explicit alert if safety limits are breached.

## 7. Output Processing
The LLM returns plain text which is pre-pended with the baseline TTS instruction and sent to the TTS engine. Voice trigger is gated by the a priori importance score assigned to the telemetry packet.
