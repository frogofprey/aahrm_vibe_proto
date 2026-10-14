# LLM Initialization Prompt Abstraction

This document describes the structure and elements of the initialization LLM prompts used to start a workout session.

## 1. Narrative Mission Plan Prompt
Used to establish the story arc for the session. Structured using XML-like tags, ordered from static to volatile.
**Constraint**: 1,024 `maxOutputTokens` in `generationConfig`.

### `<task>`
- **General Instructions**: Role definition (expert author/narrative creator).
- **Requirements**: 
    - Recontextualization of workout goals.
    - Milestone definition with **dual Pass/Fail branches**:
      - `Pass: [Thematic victory narrative]` (used when cumulative compliance is met).
      - `Fail: [Humorous/ironic complication narrative]` (used when cumulative compliance is missed).
    - Mission Complete/Maguffin/Antagonist/Protagonist definition.
    - Bonus/Overtime context (`[BONUS]` tag parsed as a bonus milestone scheduled 5 minutes after session target duration without overlap).
    - Structural matching (Intervals vs. Time).
- **Constraints**: 
    - Hard constraint against markdown in final values.
    - Strict adherence to output format `M:SS [Label] || Pass: [...] || Fail: [...]`.
- **Output Format**: Template for the mission plan generated via `missionPlanGenerator.ts`.

### `<persona>`
- **Identity**: Core character traits.
- **Mission Instruction**: Specific narrative guidance.

### `<mission_profile>`
- **Ground Truth**: HR targets and phase protocols.

### `<session_context>`
- **Parameters**: Target duration or interval structure.
- **Activity**: The specific activity being performed.

---

## 2. Session Intro Prompt
Used to generate the first interaction with the user.
**Constraint**: 1,024 `maxOutputTokens` in `generationConfig`.

### `<task>`
- **General Instructions**: Generate an introduction referencing parameters naturally.
- **Constraints**: 
    - Persona adherence.
    - Four sentence maximum.
    - Telemetry abstraction rules.

### `<persona>`
- **Identity**: Core character traits.

### `<mission_profile>`
- **Goal**: The training objective.
- **Activity**: The specific activity being performed.

### `<narrative_mission_plan>` (Conditional)
- **Story Arc**: The theme and timeline generated in the previous step.

### `<objective_tracker>`
- **Parameters**: Target duration or interval structure.
