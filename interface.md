# Adaptive Heart Rate Coaching (AHRC) Dashboard Interface Spec (`interface.md`)

This document inventories, maps, and characterizes the layout architecture, modular component structure, state variables, styling parameters, and decorative assets currently comprising the AHRC Web Application interface in React.

---

## 1. Visual Style & Theme Guidelines

The user interface follows a **tactical-cyberpunk military athletic aesthetic**, reminiscent of field diagnostic gear or a pilot's heads-up terminal.

### A. Color Palette & States
*   **Base Theme**:
    *   `Background (Deep)`: `#000000` (Pure Black) or `#050505` to `#0B0B0C` (Off-black gradient bases).
    *   `Card Container Background`: `#0F0F10` with matching border lines of `#1F2023` (`border-white/10` or `border-neutral-800`).
    *   `Accent Highlight`: Tactical deep purples (`#6366f1` / `#8b5cf6`) and high-energy greens for positive statuses.
*   **Heart Rate Zone Coding**:
    *   **Zone 1 (Warmup/Recovery)**: Deep Teal/Cyan (`#06b6d4`, 50-60% Max HR)
    *   **Zone 2 (Fat Burn)**: Forest/Emerald Green (`#10b981`, 60-70% Max HR)
    *   **Zone 3 (Cardio)**: Amber Gold (`#f59e0b`, 70-80% Max HR)
    *   **Zone 4 (Anaerobic)**: Tangerine Orange (`#f97316`, 80-90% Max HR)
    *   **Zone 5 (Peak/Redline)**: Red Alert (`#ef4444`, 90-100% Max HR)

### B. Typography Styles
*   **Interface Controls & Body**: `Inter` (Sans-Serif)
    *   Headings benefit from modern tracking-tight letters (`tracking-tight font-medium`).
*   **Telemetry Displays & Logs**: `JetBrains Mono` / `Fira Code` (Monospace font)
    *   All raw numbers, clocks, timestamps, network payloads, and command status messages are rendered in monospace text to resemble technical equipment readings.

---

## 2. Layout Grid Map (The "Bento Console")

The default screen uses a multi-faceted **Bento Grid** designed to fill a standard landscape desktop monitor or tablet without vertical scroll overflow where possible.

```
+---------------------------------------------------------------------------------+
|                               [ 1. Dashboard Header ]                           |
|  Identity, Setup Configuration (Age, Gender, Weight, Goal, Model, Simulation)  |
+---------------------------------------+-----------------------------------------+
|                                       |                                         |
|         [ 2. Heart Rate Display ]     |          [ 3. Aggregator Panel ]        |
|  - Realtime Smoothed Biometric BPM    |  - Session state, elapsed time, phase   |
|  - Dynamic Pulsing Zone Rings         |  - Calories, Active Points, Compliance  |
|                                       |                                         |
+---------------------------------------+-----------------------------------------+
|                                                                                 |
|                      [ 4. Performance Chart (Recharts/D3) ]                     |
|  - Continuous overlay curve with targeted color bands & narrative milestones    |
|                                                                                 |
+---------------------------------------+-----------------------------------------+
|                                       |                                         |
|       [ 5. Persona Voice Console ]    |         [ 6. Systems Log Console ]      |
|  - Avatar node illustration           |  - Syslog frame logs, web sockets info  |
|  - Text script/Speech bubbles         |  - AI Workspace payloads & token counts |
|                                       |                                         |
+---------------------------------------+-----------------------------------------+
```

---

## 3. UI Components Inventory

### Component A: DashboardHeader
*   **File Origin**: `/src/components/DashboardHeader.tsx`
*   **Characterization**: Serves as the central administration and calibration rig.
*   **Input Controls**:
    *   `Age` Input: Numeric value (range: 10-120), triggers zone recomputation instantly.
    *   `Weight` Input: Numeric decimal, drives metabolic calorie burn calculations.
    *   `Gender` Selector: Dropdown setting modifiers for basal profiles.
    *   `Model` Selector: Dropdown containing available models (`Gemma 4 26b`, `Gemma 4 31b`, `Gemini 3.1 Flash Lite`, `Gemini 3.1 Flash`, plus local Ollama `Gemma 4 e2b` and `Gemma 4 e4b`). If a local OLLAMA model is chosen, a customizable base URL endpoint field displays.
    *   `TTS Model` Selector: Dropdown containing available TTS models (`Gemini 3.1 Flash TTS Preview`, `Gemini 2.5 Flash Preview TTS`, `Gemini 2.5 Pro Preview TTS`, and `PocketTTS`). If `PocketTTS` is selected, a customizable URL endpoint field displays (defaulting to `http://localhost:8000/`).
    *   `Objective` Configurator: Handles training strategy target goals, duration limits, and interval counts.
    *   `Uplink Simulator Toggle`: Injects telemetry data packet sequences when a live heart rate sensor is absent.

### Component B: HeartRateDisplay
*   **File Origin**: `/src/components/HeartRateDisplay.tsx`
*   **Characterization**: The psychological focal point of the workout.
*   **Visual Indicators**:
    *   Animated SVG or SVG background heart outline running at an SVG pulse speed linked to current BPM frequency.
    *   Color spectrum animations representing transitions between different heart rate zones.
    *   Min/Max boundary overlays showing safety metrics and zone transition ceilings.

### Component C: AggregatorPanel
*   **File Origin**: `/src/components/AggregatorPanel.tsx`
*   **Characterization**: Analytical snapshot showing current progress.
*   **Metrics Tracked**:
    *   `Elapsed Session Clock` (Minutes:Seconds).
    *   `Session State` indicators (`INIT`, `WARMUP`, `ACTIVE`, `BONUS`, `COOLDOWN`, `COMPLETE`).
    *   `Compliance Minutes`: Realtime tracker checking how long the user remains within the prescribed zones.
    *   `Active Heart Points` (gamified effort markers) and `Calories Burned`.

### Component D: HeartRateChart
*   **File Origin**: `/src/components/HeartRateChart.tsx`
*   **Characterization**: Interactive visual summary of the biometric graph.
*   **Interactive Details**:
    *   Solid shaded regions representing Heart Rate Zones.
    *   Continuous plot line tracking biometric data.
    *   Event flags pinned to the vertical timestamp lines showing where milestone dialogues occurred.

### Component E: PersonaVoiceConsole
*   **File Origin**: Embedded in main `/src/App.tsx` container layout.
*   **Characterization**: Represents the artificial coach's interactive presence.
*   **Visual Elements**:
    *   Portrait avatar representing active Coach Persona.
    *   Dialog text box with custom typewriting effects or fade transitions.
    *   Audio progress bar displaying active speech queues and sound playback toggles.

### Component F: SystemsLogConsole
*   **File Origin**: `/src/components/DebugLog.tsx`
*   **Characterization**: Split technical dashboard for diagnostic telemetry tracking.
*   **Visual Subsections**:
    *   *System Logs*: Displays connection handshakes, live telemetry frame rates, hardware device addresses, and socket latency.
    *   *AI Workspace Payload Log*: Outputs raw prompts sent to Gemma/Gemini APIs side-by-side with token counters to facilitate prompt calibration.

---

## 4. Current State Variables & Handlers

To transition the app cleanly to alternative environments (Kotlin Native, PC, desktop companion), the primary React logical hooks and variables from `/src/App.tsx` are mapped below:

| UI Control / State Object | Data Type | Default Value | React Hook | Description |
| :--- | :--- | :--- | :--- | :--- |
| `selectedModel` | `string` | `"gemma-4-26b-a4b-it"` | `useState` | Determines current model path for content generation. |
| `selectedTtsModel` | `string` | `"gemini-2.5-flash-preview-tts"` | `useState` | Determines current TTS model path for voice synthesis output. |
| `pocketTtsUrl` | `string` | `"http://localhost:8000/"` | `useState` | Client-side base URL pointing to the local PocketTTS service instance. |
| `age` | `number` | `30` | `useState` | Basis for Maximum Heart Rate (`220 - age`). |
| `weight` | `number` | `70` | `useState` | Drives calorie calculation formulas. |
| `gender` | `string` | `"neutral"` | `useState` | Influences calorie and basal rate modifiers. |
| `selectedPersona` | `string` | `"Arlie"` | `useState` | Changes system prompt, styling overrides, and TTS voice ID. |
| `currentSessionState` | `SessionState` | `"INIT"` | `useState` | Guides state-machine transitions (Warmup, Active, Cooldown, Complete). |
| `simulatedTelemetry` | `boolean` | `false` | `useState` | Dictates if input is fake wave or actual sensor. |
| `parsedMilestones` | `array` | `[]` | `useRef` | Parsed items extracted from `[TIMELINE]` block in Narrative generation. |
| `parsedNarrative` | `ParsedNarrativePlan`| `{}` | `useRef` | Stores extracted `[THEME]`, `[MAGUFFIN]`, `[MISSION COMPLETE]`, etc. |

---

## All Relevant Design and Style Tokens (Vite/Tailwind)
To ease re-implementation in native engines, the styling variables correspond directly to common layouts:
*   **Layout Grid Elements**: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4`
*   **Cards Styling Class**: `bg-[#0A0A0C] border border-white/5 rounded-none p-4 font-mono shadow-[0_0_20px_rgba(0,0,0,0.8)]`
*   **Terminal Outputs**: `text-xs font-mono text-zinc-400 bg-black/40 overflow-y-auto max-h-[220px] scrollbar-thin`
*   **Font Import Strings**: Pre-imported `Inter` and `JetBrains Mono` from Google Fonts to set matching styles.
