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

### 1.3 Session Management
*   **Workout Timer**: Allow the user to Start and Stop a workout session.
*   **Duration Tracking**: Display the elapsed time of the current active session in `HH:MM:SS` format.
*   **Data Recording**: Data accumulation for "Minute Packets" must only occur while a session is active.

### 1.4 AI Coaching & Aggregation
*   **Minute Packets**: Aggregate telemetry data into 60-second summaries containing:
    *   Average BPM
    *   Max BPM
    *   Min BPM
    *   Sample Count
    *   Raw value array
*   **AI Analysis**: Send the Minute Packet to the **Google Gemini API** (`gemini-3-flash-preview`) to generate a concise, goal-oriented coaching insight.
*   **Persona**: The AI must adopt the "Bio-Analyst" persona, tailoring advice to the user's specific "Training Objective".
*   **Text-to-Speech (TTS)**: If enabled, synthesize the AI's textual insight into speech using the **Gemini TTS API** (`gemini-2.5-flash-preview-tts`) and play it via the browser's AudioContext.

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
