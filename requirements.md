
# AetherAegis Biometric Dashboard - Application Requirements

## 1. Functional Requirements

### 1.1 Connectivity & Telemetry
*   **WebSocket Client**: The application must connect to a configurable WebSocket endpoint (default: `ws://localhost:8080`).
*   **Protocol Handling**: The app must send a handshake message upon connection in the format `connect:{DEVICE_ID}`.
*   **Data Parsing**: The app must parse incoming JSON messages containing heart rate data (key: `hr` or `data.hr`).
*   **Signal Validation**: Incoming heart rate values must be validated against a physiological range (40 - 220 BPM) to filter noise.
*   **Connection Status**: The UI must display the current connection state (Connecting, Connected, Disconnected, Error).

### 1.2 Real-Time Monitoring & Visualization
*   **Current Value Display**: Display the most recent validated heart rate in large typography.
*   **Zone Calculation**: Calculate 5 heart rate zones dynamically based on the user's input Age (Max HR = 220 - Age).
    *   Zone 1: 50-60%
    *   Zone 2: 60-70%
    *   Zone 3: 70-80%
    *   Zone 4: 80-90%
    *   Zone 5: 90%+
*   **Dynamic Visual Feedback**: The UI styling (borders, glow effects, text colors) must change immediately to reflect the user's current heart rate zone.
*   **Live Charting**: Render a real-time Area Chart displaying the last 50 data points.
    *   The chart Y-axis must scale dynamically based on the data range and age-predicted max.
    *   The chart must render markers indicating points where AI synchronization occurred.
*   **Full Screen Mode**: A toggleable view mode that isolates the critical biometric display (Heart Rate & Zones), hiding configuration controls, target zone list, and historical charts. The remaining display must maximize to fill the available screen space.
    *   **Return Mechanism**: Must include a visible overlay button to revert to the standard dashboard view.

### 1.3 Session Management
*   **Workout Timer**: Allow the user to Start and Stop a workout session.
*   **Duration Tracking**:
    *   **Wall Clock**: Display the total elapsed time of the session in `HH:MM:SS` format.
    *   **Performance Duration**: Internally track time specifically spent in `MAIN_ACTIVE` or `BONUS_ACTIVE` states. This value is used for **Time Goal** progress and **Compliance** calculations. Time spent in `WARMUP` or `PAUSE` must not count towards the Time Objective. *For Interval Strategies, `RECOVERY` periods are included in Performance Duration.*
*   **Metric Tracking**:
    *   **Heart Points**: Calculated every minute. +1 point for Zone 2 or 3. +2 points for Zone 4 or 5. *Accumulates during ALL states (including Warmup/Recovery).*
    *   **Calories Burned**: Calculated every minute using the Keytel Equation (Factors: HR, Age, Weight, Gender). *Accumulates during ALL states.*
    *   **Zone Compliance**: Calculated as `Minutes in Target Zone / Total Performance Minutes`. This ensures users are not penalized for non-performance states (Warmup/Recovery). *For Interval Strategies, compliance includes Recovery periods where HR is below the target zone floor.*
    *   **Gender Input**: Added selector (Male/Female) to support accurate calorie calculation.
*   **Data Recording**: Data accumulation for "Minute Packets" must only occur while a session is active.
*   **Mission Profile**: Upon session initialization, the system must generate a baseline "Mission Profile" based on Age, **Session Duration Goal**, and Training Goal (including **Interval Count** and **Interval Time** if applicable).
    *   This profile must explicitly calculate Max HR, Primary Zone, Recovery Ceiling, and Zone Ranges.
    *   The Mission Profile text must be appended to the user's goal in all subsequent periodic AI analysis calls.
*   **Narrative Mission Plan**: Upon session initialization, the system must generate a "Narrative Mission Plan" using the selected Persona.
    *   **Persona Customization**: The generation prompt incorporates the persona's specific `missionProfile` instructions to tailor the story arc.
    *   **State Transitions**: Explicitly define narrative triggers for "Warmup Completion" and "Mission Completion".
    *   **Narrative Events**: Create distinct plot points spaced at least 1 minute apart.
    *   **Integration**: The generated plan serves as the narrative arc for the AI Coach to follow during the session.
*   **Final Session Report**: Upon stopping a session, the system must generate a 2-sentence summary report using the session duration, average HR, **peak HR**, Total Calories, and Total Heart Points.
    *   **Compliance Data**: The report must cite compliance based on Performance Minutes (e.g., "15/20 performance minutes compliant").
    *   **Interval Data**: For interval sessions, the report must include the number of intervals completed versus the goal.
    *   **Audio**: If the voice profile is enabled, this final report must be read aloud via TTS.
*   **Session Export**: Automatically generate and download **two** local text files when a session is stopped.
    1.  **Full Log** (`session_YYYYMMDDHHMM.txt`):
        *   Contains full debug details, prompts, raw telemetry, mission profile, **narrative mission plan**, mid-term memory, and final report diagnostics.
        *   Header must include Subject Age, **Subject Weight**, **Subject Gender**, Training Objective, **Session Objectives** (Time, HP, Kcal, **Intervals**).
        *   Body must include per-minute breakdown of Calories and Heart Points.
    2.  **User Summary** (`usersession_YYYYMMDDHHMM.txt`):
        *   A concise summary suitable for long-term memory systems.
        *   Contains only the Header (including Weight/Duration/Metrics), Session Intro, Periodic Heart Rate Meta Values (Avg/Max), and the Coaching Insight text for each minute.
        *   Devoid of raw prompts, raw telemetry arrays, and system debug info.

### 1.4 AI Coaching & Aggregation
*   **Minute Packets**: Aggregate telemetry data into 60-second summaries.
    *   **Frame State Priority**: The "State" of a minute is determined by the highest priority state observed during that minute: `ERROR` > `PAUSE` > `RECOVERY` > `BONUS_ACTIVE` > `MAIN_ACTIVE` > `WARMUP`.
    *   **Majority State**: For Interval Strategies, the "State" of a minute is determined by the majority state observed during that minute to ensure accurate labeling of transitions.
    *   **Packet Contents**: Average BPM, Max BPM, Min BPM, **Calories Burned** (Minute), **Heart Points** (Minute), Sample Count, Frame State, Raw value array.
*   **Mid-Term Memory**: After the second periodic update, the system must generate a "Mid-Term Memory" summary of the session's trend so far.
    *   **Context Depth**: This summary must be **2-3 sentences long** to preserve context about zone adherence and effort consistency.
    *   This summary must be injected into the context of all subsequent AI analysis calls to ensure continuity.
    *   **Real-Time Objective Injection**: Every minute, the system must append a block to this context containing the live status of the user's progress against their defined goals:
        *   **Performance Time** / Target Time
        *   **Interval Progress** (Current / Goal) and **Interval Time** (if applicable)
        *   Current Heart Points / Target Heart Points
        *   Current Calories / Target Calories
        *   Compliance: X/Y **Performance Minutes**
*   **AI Analysis**: Send the Minute Packet (plus History, Mid-Term Context, Mission Profile, and **Narrative Plan**) to the **Google Gemini API** (`gemini-3-flash-preview`) to generate a concise, goal-oriented coaching insight.
    *   **Update Frequency**: Insights are requested every 60 seconds.
    *   **Active Time Reporting**:
        *   During `INIT` or `WARMUP`, `Active_Time` is reported as **'WARMING UP'**. The first update is at 1:00.
        *   Upon entering `MAIN_ACTIVE`, `Active_Time` resets to **'0:00'**.
    *   **Cooldown & Delay**: A **25-second cooldown** is enforced between updates. If a `MAIN_ACTIVE` transition update (0:00) occurs too soon after a warmup update, it is delayed but preserves the '0:00' timestamp for narrative continuity.
    *   **Mission Weighting**: The prompt includes the persona's `missionWeight` (0.0-1.0) to instruct the AI on how heavily to incorporate narrative elements versus raw performance data in its response.
    *   **Saliency Scoring**: The AI must provide a Saliency Score (1-10) with each insight to indicate urgency/novelty (e.g., "Score: [X] | [Insight]").
*   **Persona**: The AI must adopt one of the configurable personas, tailoring advice to the user's specific "Training Objective". Supported Personas:
    *   **Arlie** (Tactical/Military, Voice: Zebenelgenubi)
    *   **Chad** (Competitive/Gym Bro, Voice: Algieba)
    *   **Ginger-Chan** (Anime/Gamer, Voice: Leda)
    *   **Friday** (Gothic/Nihilist, Voice: Kore)
    *   **Kaelen** (Fantasy/Noble, Voice: Sulafat)
*   **Text-to-Speech (TTS)**: If enabled, synthesize the AI's textual insight into speech using the **Gemini TTS API** (`gemini-2.5-flash-preview-tts`).
    *   **Audio Queueing**: The system must implement an audio queue to play TTS segments sequentially, preventing overlap.
    *   **Retry Logic**: The system must attempt one retry on synthesis failure.
    *   **Quota Handling**: If a `429` (Resource Exhausted) error is received, the retry mechanism must be aborted immediately.
    *   **Chattiness Threshold**: Allow the user to set a threshold (1-10, default 4). Only AI insights with a Saliency Score greater than or equal to this threshold will trigger TTS.
    *   **Salience-Based Delivery**: TTS instructions are split into three tiers based on the Saliency Score:
        *   **Score 1-3**: Low intensity/routine delivery.
        *   **Score 4-6**: Mid intensity/notable trend delivery.
        *   **Score 7-10**: High intensity/critical alert delivery.
        *   **System Reports**: Introduction and Final Session Reports always use the mid-intensity (Score 4-6) delivery style.

### 1.5 Configuration & Persistence
*   **User Settings**: Allow users to configure:
    *   Subject Age (determines Heart Rate Zones)
    *   **Subject Weight** (default 150 lbs)
    *   **Subject Gender** (Male/Female)
    *   Training Objective:
        *   Wellness
        *   Low Intensity Weight Loss
        *   Mid Intensity Weight Loss
        *   General Weight Loss
        *   Strength Training
        *   High Intensity
    *   **Session Targets**:
        *   **Time** (default 20 mins)
        *   **Intervals** (Count and Time per interval)
        *   **Heart Points** (default 30)
        *   **Calories** (default 100)
    *   **UI Config**: The configuration UI for Session Targets must use a selector to toggle between editing Time, Intervals, Heart Points, or Calories, ensuring a clean interface while preserving all values for tracking.
    *   WebSocket URL
    *   Device ID (Hex)
    *   Audio/Voice Toggle
    *   Voice Threshold (Chattiness)
    *   **Telemetry Abstraction** (Default: On) - Toggle between abstract descriptors and raw BPM recitation. This setting must apply globally to **Session Intro**, **Periodic Coaching Insights**, and the **Final Session Report**.
*   **Persistence**: All configuration settings must be saved to `localStorage` and restored upon page reload.

### 1.6 System Logging
*   **Debug Console**: Provide a toggleable panel displaying system events, raw telemetry logs, and API interactions.
    *   **Narrative Plan** generation events must be visually distinct.
    *   **Mid-Term Memory** updates should be visually distinct (e.g., Purple).
    *   **Mission Profile** events should be visually distinct (e.g., Cyan).
    *   **Final Report** events should be visually distinct (e.g., Emerald/Amber).
    *   **Metric Updates** must be logged every minute.
*   **Telemetry Stream**: Provide a toggle to show/hide raw high-frequency data logging to reduce visual noise.

### 1.7 Session State Machine
The application implements a state machine to track the user's workout phase. Transitions are driven by **Elapsed Time** and **Heart Rate (HR)** relative to the Target Zone minimum (defined by the Mission Profile/Objective).

*   **State Definitions**:
    *   **IDLE**: Session is stopped or has not started.
    *   **INIT**: Session started; performing initial AI handshakes, loading mission profile, and **generating narrative plan**.
    *   **WARMUP**: Early phase; HR is below target, or session duration is < 2 minutes. Time does *not* count towards Performance Duration.
    *   **MAIN_ACTIVE**: Primary workout phase; HR is within or above target. Time counts towards Performance Duration.
    *   **PAUSE**: Intensity drop during the main phase (HR < Target for > 30s). Time does *not* count towards Performance Duration.
    *   **BONUS_ACTIVE**: Session Duration Goal met, but user is maintaining target intensity. Time counts towards Performance Duration.
    *   **RECOVERY**: Session Duration Goal met, user has cooled down (HR < Target). Time does *not* count towards Performance Duration.
    *   **ERROR**: System or Connection failure.

*   **Strategies**:
    1.  **Fixed Strategy** (Used for: Wellness, Strength Training, High Intensity):
        *   Transitions immediately from `INIT` to `MAIN_ACTIVE`.
        *   Bypasses `WARMUP` and `PAUSE` logic to support interval-based or low-intensity targets where "drops" are expected.
    2.  **Normal Strategy** (Used for: Low/Mid/General Weight Loss):
        *   **Warmup Phase**: Starts in `WARMUP`. Transitions to `MAIN_ACTIVE` if Duration >= 2 mins OR HR >= Target Min (Debounce: 5s).
        *   **Active Phase**: Transitions from `MAIN_ACTIVE` to `PAUSE` if HR drops below Target Min for > 30 seconds.
        *   **Resume**: Transitions from `PAUSE` back to `MAIN_ACTIVE` if HR recovers to >= Target Min (Debounce: 5s).
        *   **Goal Completion**: Once Session Duration Goal is met:
            *   If HR >= Target Min -> `BONUS_ACTIVE`.
            *   If HR < Target Min -> `RECOVERY` (Debounce: 5s).
    3.  **Interval Strategy**:
        *   Alternates between `MAIN_ACTIVE` and `RECOVERY` based on HR thresholds.
        *   Transitions to `RECOVERY` when HR exceeds a ceiling or after a set time.
        *   Transitions back to `MAIN_ACTIVE` when HR drops below a recovery floor.
    4.  **Fixed Interval Strategy**:
        *   Alternates between `MAIN_ACTIVE` and `RECOVERY` based on fixed time durations.
        *   Increments interval count upon transition from `MAIN_ACTIVE` to `RECOVERY`.

## 2. Non-Functional Requirements

### 2.1 Performance & Latency
*   **Rendering**: The dashboard must handle high-frequency updates (1Hz or higher) without UI freezing.
*   **Audio Queueing**: Audio buffers for TTS must be queued and played sequentially. The system must wait for the current segment to finish before playing the next to prevent audio overlap.
*   **Resource Management**: Data arrays (charts, logs) must be capped (e.g., max 50 chart points, max 100 log entries) to prevent memory leaks over long sessions.

### 2.2 User Interface & Experience (UI/UX)
*   **Aesthetic**: The application must adhere to a "High-Fidelity Sci-Fi" theme (Dark mode, neon accents, monospaced fonts, grid backgrounds).
*   **Responsiveness**: The layout must adapt to different screen sizes (Desktop vs. Mobile).
*   **Accessibility**: Use high-contrast colors for critical data (BPM, Warnings).

### 2.3 Reliability
*   **Error Handling**: The application must gracefully handle WebSocket disconnects and API failures without crashing the UI.
*   **Input Sanitization**: Numeric inputs (Age) must be clamped to realistic values (1-120).

### 2.4 Technical Constraints
*   **Browser Support**: Must utilize modern Web APIs (AudioContext, WebSocket).
*   **Security**: API Keys must be loaded via environment variables (`process.env.API_KEY`) and not hardcoded in the source.
*   **Network**: Requires a local network connection for WebSocket telemetry and an internet connection for Gemini API calls.
