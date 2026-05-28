# App Requirements - Adaptive Heart Rate Coaching (AHRC) Dashboard

## Project Goals
* Provide a real-time, immersive exercise dashboard that uses heart rate data to drive AI-powered narrative coaching.
* Use a "Mission-Based" approach where workouts are treated as narrative events (e.g., Tactical Infiltration, Space Exploration).
* Implement a robust system for handling telemetry, state transitions, and high-frequency AI feedback.

## Core Pillars

### 1. Biometric Mapping & Safety
*   **User Profile**: Upon initial load (or retrieved from `localStorage`), users provide:
    *   `Age` (used for Max HR calculation).
    *   `Weight` (used for calorie estimation).
    *   `Gender` (used for BMR/Calorie precision).
    *   `Training Objective` (Warmup, Cardio, Fat Burn, HIIT).
*   **Safety Thresholds**:
    *   **Max HR**: 220 - Age.
    *   **Redline**: 95% of Max HR.
    *   **Emergency Buffer**: If HR stays above 100% of Max HR for >10 seconds, the AI triggers an `EMERGENCY_STOP` directive.
*   **Zone Logic**:
    *   **Zone 1 (Recovery/Warmup)**: 50–60% Max HR.
    *   **Zone 2 (Fat Burn)**: 60–70% Max HR.
    *   **Zone 3 (Aerobic/Cardio)**: 70–80% Max HR.
    *   **Zone 4 (Anaerobic)**: 80–90% Max HR.
    *   **Zone 5 (Performance/Peak)**: 90–100% Max HR.

### 2. Narrative Engine
*   **Mission Profile**:
    *   The user selects a "Training Objective" (Goal).
    *   This profile must explicitly calculate Max HR, Primary Zone, Recovery Ceiling, and Zone Ranges.
    *   The Training Objective must include state-specific target goals (`warmupGoal`, `mainGoal`, `recoveryGoal`) that dynamically resolve based on the user's Biometric Map.
    *   The Mission Profile text must be appended to the user's goal in all subsequent periodic AI analysis calls.
*   **Narrative Mission Plan**: Upon session initialization, the system generates a structured mission template programmatically (via `missionPlanGenerator.ts`) and then fills it with narrative flavor using the **selected LLM model** (defaulting to `gemma-4-26b-a4b-it`).
    *   **Programmatic Core**: Intervals and milestones are strictly calculated based on `sessionDurationGoal`, `intervalTime`, and `intervalCountGoal`.
    *   **Flavoring Layer**: The LLM acts as a "thematic interpreter." It receives the programmatic template as an `OUTPUT FORMAT` and is constrained to preserve the timestamps and structure exactly. It must only replace placeholders (e.g., `[Event Name]`, `[Thematic description]`) with persona-appropriate flavor.
    *   **Narrative Tone**: The LLM must adopt a neutral, cinematic, third-person "Dungeon Master" voice. It is strictly forbidden from roleplaying as the persona in the first person or altering calculated timestamps.
    *   **Persona Customization**: The generation prompt uses the persona's `missionProfile` for inspiration but no longer requires the technical `mission_profile` (biometric targets) to simplify the task and prevent AI drifting.
    *   **State Transitions**: Narrative triggers align with calculated programmatic milestones for "Warmup Completion" and "Mission Completion".
    *   **Timeline Parsing**: The system extracts structured data from the generation response (parsing the `[TIMELINE]` block for milestones, plus `[THEME]`, `[MAGUFFIN]`, `[ANTAGONIST]`, `[PROTAGONIST]`, `[MISSION COMPLETE]`, and `[BONUS]` fields). This metadata is stored for narrative continuity and transition triggering.

### 3. Session State Machine
*   **INIT**: Initial configuration and mission briefing.
*   **WARMUP**: Initial movement, target Zone 1. Transitions to `MAIN_ACTIVE` after 3-5 minutes (configurable or AI-triggered).
*   **MAIN_ACTIVE**: The core exercise phase. Targets vary by "Training Objective".
*   **RECOVERY/COOLDOWN**: Active recovery, target Zone 1. Ends after 5 minutes or HR < Recovery Ceiling.
*   **PAUSE**: Session halted, timers suspended.

### 4. AI Coaching Loop (Periodic Analysis)
*   **Trigger**: Every 60 seconds (1 minute), the system compiles a **Minute Packet**.
*   **Minute Packet Construction**:
    *   Current Timestamp
    *   Average/Max/Min BPM for the last 60 seconds
    *   Raw Telemetry Stream (all samples collected in that minute)
    *   Current Calories Burned
    *   Heart Points Earned
    *   Calculated Urgency/Importance (1-10)
    *   Compliance: X/Y **Performance Minutes**
        *   **History Precision**: The `<short_term_context>` maintains the last **3 minutes** of feedback/insights and the initial session intro for continuity and token efficiency.
        *   **Live Telemetry**: Include the **Current BPM** (Smoothed) at the time of trigger alongside minute metrics.
*   **AI Analysis**: Send the Minute Packet (plus Short-Term History context) to the selected LLM model (defaulting to `gemma-4-26b-a4b-it`) to generate a concise, goal-oriented coaching insight. The prompt is streamlined to focus on immediate telemetry and narrative immersion:
    *   **Model Selection**: Users can select from several models including Gemma 4 (26b/31b) and Gemini 3.1 Flash (Lite/Full) via a UI selector.
    *   **Thinking Mode**: For models that support "Thinking", the level is forced to **MINIMAL** to minimize latency and focus on direct instruction.
    *   **Context Removal**: Redundant blocks like `mission_profile`, `objective_tracker`, `transition_history`, and `current_timers` are omitted from periodic updates to minimize latency and focus the LLM on current telemetry. However, a clean `narrative_mission_plan` section remains to supply key narrative components: the [THEME], [MAGUFFIN], [ANTAGONIST], and [PROTAGONIST] (with the non-protagonist components dynamically randomized/omitted according to the current packet's importance to maximize response variety).
    *   **Current Minute Restructuring**: The `current_minute_packet` provides current coaching HR (Smoothed BPM), coaching direction, and an importance score (e.g., 5/10).
    *   **Conditional Milestones**: A dedicated `milestone` section is injected only when an active narrative event matches the current packet time, providing the AI with the specific story beat to verbalize. If this is the final milestone of the session, a specific override instruction is appended to notify the user of session completion and offer optional pacing routes (slowing down vs. continuation).
    *   **Response Handling**: The system extracts the plain text persona narration and prepends the persona's baseline TTS instruction before synthesis.
    *   **Update Frequency**: Insights are requested every 60 seconds.
    *   **Active Time Reporting**:
        *   During `INIT` or `WARMUP`, `Active_Time` is reported as **'WARMING UP'**. The first update is at 1:00.
        *   Upon entering `MAIN_ACTIVE`, `Active_Time` resets to **'0:00'**.
    *   **Cooldown & Delay**: A **25-second cooldown** is enforced between updates. If a `MAIN_ACTIVE` transition update (0:00) occurs too soon after a warmup update, it is delayed but preserves the '0:00' timestamp for narrative continuity.
    *   **Saliency Scoring**: The AI must provide a Saliency Score (1-10) with each insight to indicate urgency/novelty (e.g., "Score: [X] | [Insight]").
*   **Persona**: The AI must adopt one of the configurable personas, tailoring advice to the user's specific "Training Objective". Supported Personas:
    *   **Arlie** (Tactical/Military, Voice: Zebenelgenubi)
    *   **Eara** (Space/Sci-Fi, Voice: Charon)
    *   **Pounce** (Playful/Cat-like, Voice: Puck)
    *   **Sage** (Zen/Focus, Voice: Fenrir)

### 5. Frontend Presentation Layer
*   **Decoupled UI Specification**: The full system presentation architecture, visual guidelines, bento layout grid, dynamic telemetry visualizations, interactive charting, settings groupings, and debug log views are moved to the dedicated **[requirements_react.md](./requirements_react.md)** file.
*   **Visual Highlights**: Refer to `requirements_react.md` for specific guidance on:
    *   Dark Mode, High Contrast Data-Grid aesthetics.
    *   Dynamic Heart Rate Zone color coding (Zone 1 to 5 mapping).
    *   Smooth React Motion transitions for heartbeats and charts.
    *   Unified Settings Panel design for user/workout customization.
    *   Uplink websocket / Bluetooth statuses and diagnostic handshakes logs.

## Constraints & Infrastructure
*   **Port**: Must bind to 3000.
*   **Runtime**: Node.js 20+.
*   **Frontend**: React (Vite) + Tailwind CSS.
*   **Backend**: Express (for serving and proxying if needed).
*   **WebSocket**: Primary protocol for HR telemetry input.
*   **AI SDK**: @google/generative-ai.
