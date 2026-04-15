# LLM Initialization Prompt Abstraction

This document describes the structure and elements of the initialization LLM prompts used to start a workout session.

## 1. Narrative Mission Plan Prompt
Used to establish the story arc for the session. Structured using XML-like tags, ordered from static to volatile.

### `<task>`
- **General Instructions**: Role definition (expert author/narrative creator).
- **Requirements**: 
    - Recontextualization of workout goals.
    - Milestone definition (every 5 mins).
    - Mission Complete/Maguffin definition.
    - Bonus/Overtime context.
    - Structural matching (Intervals vs. Time).
- **Constraints**: Hard constraint against markdown.
- **Output Format**: Template for the mission plan.

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
