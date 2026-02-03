
# AetherAegis Biometric Dashboard - Application Requirements

## 1. Functional Requirements

### 1.1 Connectivity & Telemetry
*   **WebSocket Client**: The application must connect to a configurable WebSocket endpoint (default: `ws://localhost:8765`).
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
*   **Full Screen Mode**: A toggleable view mode that isolates the critical biometric display (Heart Rate & Zones), hiding configuration controls, target zone list, and historical charts. The remaining display must maximize to fill the available screen space. Must include a mechanism to revert to the standard dashboard view.

### 1.3 Session Management
*   **Workout Timer**: Allow the user to Start and Stop a workout session.
*   **Duration Tracking**: Display the elapsed time of the current active session in `HH:MM:SS` format.
*   **Data Recording**: Data accumulation for "Minute Packets" must only occur while a session is active.
*   **Mission Profile**: Upon session initialization, the system must generate a baseline "Mission Profile" based on Age and Goal.
    *   This profile must explicitly calculate Max HR, Primary Zone, Recovery Ceiling, and Zone Ranges.
    *   The Mission Profile text must be appended to the user's goal in all subsequent periodic AI analysis calls.
*   **Final Session Report**: Upon stopping a session, the system must generate a 2-sentence summary report using the session duration, average HR, and mid-term trends.
    *   **Audio**: If the voice profile is enabled, this final report must be read aloud via TTS.
*   **Session Export**: Automatically generate and download a local text file (`session_YYYYMMDDHHMM.txt`) when a session is stopped.
    *   The file must contain session configuration, **Voice Profile**, and the **Final Session Report** in the header.
    *   The file must include the **Mission Profile** (Prompt and Response).
    *   The file must include a chronological record of all "Minute Packets" (Avg/Max/Min HR), including the **Mid-Term Memory context** used for that minute.
    *   The file must include the specific AI Analyst insight generated for each packet.
    *   The file must include the raw telemetry value arrays for post-analysis.
    *   The file must append full diagnostics (Prompt & Response) for the Final Report at the end of the log.

### 1.4 AI Coaching & Aggregation
*   **Minute Packets**: Aggregate telemetry data into 60-second summaries containing:
    *   Average BPM
    *   Max BPM
    *   Min BPM
    *   Sample Count
    *   Raw value array
*   **Mid-Term Memory**: After the second periodic update, the system must generate a "Mid-Term Memory" summary of the session's trend so far. This summary must be injected into the context of all subsequent AI analysis calls to ensure continuity.
*   **AI Analysis**: Send the Minute Packet (plus History, Mid-Term Context, and Mission Profile) to the **Google Gemini API** (`gemini-3-flash-preview`) to generate a concise, goal-oriented coaching insight.
*   **Persona**: The AI must adopt one of the configurable personas (AetherAegis, TacticalMinimalist, Drill Sergeant, ChadGPT, Zen), tailoring advice to the user's specific "Training Objective".
*   **Text-to-Speech (TTS)**: If enabled, synthesize the AI's textual insight into speech using the **Gemini TTS API** (`gemini-2.5-flash-preview-tts`) and play it via the browser's AudioContext.
    *   **Retry Logic**: The system must attempt one retry on synthesis failure.
    *   **Quota Handling**: If a `429` (Resource Exhausted) error is received, the retry mechanism must be aborted immediately to prevent API throttling.

### 1.5 Configuration & Persistence
*   **User Settings**: Allow users to configure:
    *   Subject Age (determines Heart Rate Zones)
    *   Training Objective (e.g., Cardio, Weight Loss, Strength)
    *   WebSocket URL
    *   Device ID (Hex)
    *   Audio/Voice Toggle
*   **Persistence**: All configuration settings must be saved to `localStorage` and restored upon page reload.

### 1.6 System Logging
*   **Debug Console**: Provide a toggleable panel displaying system events, raw telemetry logs, and API interactions.
    *   **Mid-Term Memory** updates should be visually distinct (e.g., Purple).
    *   **Mission Profile** events should be visually distinct (e.g., Cyan).
    *   **Final Report** events should be visually distinct (e.g., Emerald/Amber).
*   **Telemetry Stream**: Provide a toggle to show/hide raw high-frequency data logging to reduce visual noise.

## 2. Non-Functional Requirements

### 2.1 Performance & Latency
*   **Rendering**: The dashboard must handle high-frequency updates (1Hz or higher) without UI freezing.
*   **Audio Latency**: Audio buffers for TTS must be decoded and played immediately upon receipt to ensure coaching relevance.
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
