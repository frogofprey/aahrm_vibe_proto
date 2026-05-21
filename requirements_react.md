# AHRC Frontend & UI Design Requirements (`requirements_react.md`)

This document outlines the visual structure, layout aesthetics, component groupings, and presentation specifications of the **Adaptive Heart Rate Coaching (AHRC) Dashboard**. It serves as a modular blueprint for the client-side implementation of the system.

---

## 1. Design System, Theme & Typography

To evoke an immersive, professional athletic-tactical feel, the interface uses a dark, data-dense control console design.

*   **Color Palette**:
    *   **Backgrounds**: Pitch blacks (`#000000`), deep grays (`#0a0a0a` to `#161616`), and subtle borders (`rgba(255, 255, 255, 0.08)`).
    *   **Default Accent**: High-viz indigo (`#6366f1`) and violet (`#8b5cf6`) to signify tactical AI connectivity.
    *   **Zone Colors**:
        *   **Zone 1 (Warmup/Recovery)**: Calm Teal / Cyan (`#06b6d4`, 50-60% Max HR)
        *   **Zone 2 (Fat Burn)**: Emerald Green (`#10b981`, 60-70% Max HR)
        *   **Zone 3 (Cardio)**: Amber Yellow (`#f59e0b`, 70-80% Max HR)
        *   **Zone 4 (Anaerobic)**: Tangerine Orange (`#f97316`, 80-90% Max HR)
        *   **Zone 5 (Peak/Redline)**: Crimson Red (`#ef4444`, 90-100% Max HR)
*   **Typography**:
    *   **Primary Sans-Serif**: `Inter` for highly legible stats, descriptions, and structural labels.
    *   **Display / Tech Mono**: `JetBrains Mono` or `Fira Code` for telemetry indicators, live clocks, raw BPM units, log lines, and state-machine transitions.
*   **Grid Structure**:
    *   **Bento Control Board Layout**: A modular, multi-column grid that scales fluidly from desktop monitors down to tablets. Large elements (like the chart or live narrative output) take up wide spans, while technical telemetry widgets sit in compact adjacent tiles.

---

## 2. Setting & Preference Configurations (Settings Panel)

Settings are organized into functional groups, easily accessible via a unified **System Setup & Preferences Panel** (or collapsible drawers) to prevent screen clutter during training.

### A. Biometrics Profile
*   **Age Input (Number)**: Directly determines the Max Heart Rate (`220 - Age`) and subsequent target zone limits.
*   **Weight Input (Number)**: Used to calculate calorie burned estimates (using standard MET formulas or HR formulas).
*   **Gender Selection (Dropdown/Radio)**: Male, Female, or other, for precise BMR modifier mapping.

### B. Session and Workout Parameters
*   **Training Objective Strategy**:
    *   *Normal Time State*: Time-based workout focusing on maintaining a target zone.
    *   *Interval State*: Sequence-based alternates of high and recovery intensity.
    *   *Fixed Interval State*: Standard structured interval workouts.
*   **Session Duration Goal**: Total requested time (in minutes).
*   *For Interval Sessions*:
    *   **Interval Time**: Configurable minutes per intensity phase.
    *   **Interval Count Goal**: Number of cycles.

### C. Large Language Model & Voice Config
*   **Model Selector**: Pull-down containing user-level choices:
    *   `Gemma 4 26b a4b it` (Default, low-latency)
    *   `Gemma 4 31b it`
    *   `Gemini 3.1 Flash Lite`
    *   `Gemini 3.1 Flash`
    *   `Gemma 4 e2b (Local)` (Workstation Ollama offline engine)
    *   `Gemma 4 e4b (Local)` (Workstation Ollama offline engine)
    *   *Inputs*: Choosing a local model renders a network address text input to calibrated endpoint connections.
*   **TTS Model Selector**: Allows custom configuration of speech engines:
    *   `Gemini 3.1 Flash TTS Preview`, `Gemini 2.5 Flash Preview TTS`, or `Gemini 2.5 Pro Preview TTS` (high-fidelity cloud options).
    *   `PocketTTS` (offline, local OpenAI-compliant `/v1/audio/speech` layout utilizing the custom address input; default voice is `'ginger-chan'`).
*   **Chattiness Level Slider**: Controls AI frequency and narrative length (Low, Medium, High).
*   **Voice Toggle**: Enable/disable TTS engine speech output directly.

### D. Uplink & Telemetry Decoupling Controls
*   **WebSocket/Bluetooth URL Input**: Direct server string target.
*   **Simulation Controls**: Toggle button to inject synthetic, realistic HR fluctuation waveforms when a physical sensor is unavailable. Shows simulated vs. raw incoming hardware status.

---

## 3. High-Frequency Telemetry & State Visualization

Workout metrics require instantaneous presentation, utilizing responsive micro-animations for feedback.

### A. Core Telemetry Board
*   **Live Heart Rate Widget**:
    *   Focal, ultra-large text displaying Current Heart Rate (smoothed BPM).
    *   An animated heart icon or subtle background radial ring that pulses at a frequency directly synchronized to the current BPM.
    *   Background and text color shifts fluidly matching the active Heart Rate Zone (Teal $\rightarrow$ Crimson).
*   **Live Chronometer**:
    *   Displays current session time (e.g., `12:45`), active phase (Warmup, Main, Cooldown), and total structured progression.
*   **Activity Metric Badges**:
    *   *Calorie counter*: Real-time accumulated calories burned.
    *   *Heart Points*: Gamified metric showing minutes spent in highly active zones.
    *   *Compliance Indicator*: Performance minutes tracking zone adherence.

### B. Dynamic Interval Visualizer
*   Renders active and upcoming intervals as a segmented horizontal track.
*   Provides clear countdowns showing how many seconds remain inside the high-intensity phase or recovery phase.
*   Highlights current segment with an active pulse overlay.

---

## 4. Interactive Performance Graph (Recharts / D3)

A central multi-overlay line chart visualizing biometric history against the workout map.

*   **Target Zones Shading**: Behind the active HR plot, horizontal background bands are colored to represent Zone 1 through Zone 5 thresholds, matching their respective design-system color profiles at low opacity.
*   **Biometric Curve**: A smoothed bezier curve showing the raw/smoothed telemetry data collected up to the current session minute.
*   **Milestone Annotation Flags**: Inject visual pins or vertical markers at points in the timeline where a narrative milestone event was triggered. Clicking the flag allows the user to re-read the triggered narrative message.

---

## 5. Diagnostic Handshake Consol & System Logs

To provide developers and enthusiasts with complete telemetry audit capabilities, these components are fully interactive:

*   **Biometric Map Profile Feed**: Visualizes the active Calculated Max HR, target ranges, safety boundaries, and the raw text output from the initial *Mission Profile* prompt.
*   **Console Log Stream**:
    *   *System Logs tab*: Displays handshakes, websocket data packet frames, latency timers, and status codes.
    *   *AI Workspace tab*: Displays full raw prompt payloads sent to the LLMs, response JSON mappings, and actual generated token counts to observe prompt performance.

---

## 6. Voice and Narrative Synthesis Console

The central hub representing the "Coaching Voice":

*   **Persona Avatar Node**: Renders a dedicated stylized icon or symbol representing the selected Persona (Tactical-Military Arlie, Sci-Fi Eara, Playful Pounce, Zen Sage).
*   **Dialogue Bubble / Text Subtitles**: Displays the latest persona narrative script cleanly with prominent quotation markings.
*   **Audio Status Feedback**: Interactive waveform visualizer indicating when TTS synthesized lines are active or queued up. Includes a manual skip button for long narratives.
