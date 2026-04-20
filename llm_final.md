# LLM Final Report Prompt Abstraction

This document describes the structure and elements of the final session report LLM prompt. The prompt is structured hierarchically using XML-like tags, ordered from static to volatile data.

## 1. Task Section (`<task>`)
Defines the core logic and constraints for the report.
**Constraint**: 1,536 `maxOutputTokens` in `generationConfig`.

- **General Instructions**: Generate a final session report based on the provided context.
- **Constraints**: 
    - Use prose only (no markdown).
    - Four sentence maximum.
    - State if requirements were satisfied.
    - Professional and summary-focused.
    - Mention major milestones, the "Boss," and the "Maguffin."
    - Use 'Active Duration' as the primary reference for intensity.
    - Include a final word of encouragement.
    - Telemetry abstraction rules (if enabled).

## 2. Persona Section (`<persona>`)
- **Identity**: Core character traits.

## 3. Mission Profile Section (`<mission_profile>`)
- **Goal**: The training objective.
- **Activity**: The specific activity being performed.
- **Profile**: HR targets and phase protocols.
- **Narrative Plan**: The story arc and timeline.

## 4. Session Stats Section (`<session_stats>`)
- **Metrics**: Wall time, active workout time, average/peak HR, calories, and heart points.
- **Intervals**: Cycles completed (if applicable).

## 5. Objective Tracker Section (`<objective_tracker>`)
- **Compliance**: Performance minutes matching target zones.

## 6. Transition History Section (`<transition_history>`)
- **Timeline**: Log of all state changes throughout the session.

## 7. Short-Term Context Section (`<short_term_context>`)
- **Last Minute Insight**: The final piece of feedback given before the session ended.
