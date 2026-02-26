# Training Objectives Schema

The `TRAINING_OBJECTIVES` array defines the different workout goals available to the user. Each objective is represented by a `TrainingObjective` object with the following properties:

- **`title`** (`string`): The display name of the training objective (e.g., "Wellness", "High Intensity").
- **`targetZones`** (`number[]`): An array of integers representing the primary heart rate zones targeted by this objective (0-indexed, where 0 is Zone 1, 1 is Zone 2, etc.).
- **`prompt`** (`string`): Specific instructions given to the AI persona regarding how to guide the user for this objective. It dictates the focus, compliance margins, and how to handle deviations or rest periods.
- **`transitionStrategy`** (`string`): Defines how the session state transitions should be handled during the workout.
  - `"normal state"`: Follows standard state transitions (e.g., Warmup -> Main Active -> Recovery).
  - `"fixed state - MAIN_ACTIVE"`: The session remains primarily in the `MAIN_ACTIVE` state, bypassing or altering standard transitions.
