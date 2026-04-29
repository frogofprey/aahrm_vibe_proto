# Training Objectives Schema

The `TRAINING_OBJECTIVES` array defines the different workout goals available to the user. Each objective is represented by a `TrainingObjective` object with the following properties:

- **`title`** (`string`): The display name of the training objective (e.g., "Wellness", "High Intensity").
- **`targetZones`** (`number[]`): An array of integers representing the primary heart rate zones targeted by this objective (1-indexed, e.g., `[2]` for Zone 2).
- **`mission`** (`string`): The baseline mission profile text containing placeholders (e.g., `{{MHR}}`, `{{Z1_MIN}}`) that are resolved at session initialization.
- **`transitionStrategy`** (`string`): Defines how the session state transitions should be handled during the workout.
  - `"normal state"`: Follows standard state transitions.
  - `"fixed state - MAIN_ACTIVE"`: The session remains primarily in the `MAIN_ACTIVE` state.
  - `"interval state"`: Handles dynamic transitions between high-intensity spikes and recovery valleys.
  - `"fixed interval state"`: Handles time-based interval cycles.
- **`warmupGoal`** (`string`): The target HR/Zone for the warmup phase, supporting template placeholders.
- **`mainGoal`** (`string`): The target HR/Range for the performance (Main/Bonus Active) phase.
- **`recoveryGoal`** (`string`): The target HR/Range for the recovery phase.
