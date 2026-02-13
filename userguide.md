
# AetherAegis Biometric Dashboard - User Guide

AetherAegis is a high-fidelity, sci-fi themed biometric dashboard designed to gamify and analyze your fitness sessions using real-time heart rate telemetry and Generative AI coaching.

## Table of Contents
1. [Getting Started](#getting-started)
2. [Interface Overview](#interface-overview)
3. [Configuration](#configuration)
4. [Running a Session](#running-a-session)
5. [AI Personas](#ai-personas)
6. [Data & Logs](#data--logs)
7. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites
1.  **Telemetry Source**: You need a device or script broadcasting Heart Rate (BPM) data via WebSocket. The default endpoint is `ws://localhost:8080`.
    *   *Note: Ensure your data source sends JSON messages formatted as `{"hr": 120}` or `{"data": {"hr": 120}}`.*
2.  **API Key**: The application must be running in an environment where a valid Google GenAI API Key is configured via `process.env.API_KEY`.
3.  **Modern Browser**: Chrome, Edge, or Firefox is recommended for AudioContext and WebSocket support.

---

## Interface Overview

The dashboard is divided into three main zones:

1.  **Top Control Bar**: Contains all configuration inputs, toggles for logs/audio, and session control buttons.
2.  **Main Display (Left)**:
    *   **Live Heart Rate**: Huge digital readout of current BPM.
    *   **Zone Indicator**: Changes color and visual intensity based on your heart rate zone.
    *   **Session Timer**: Elapsed wall-clock time.
    *   **Zone Legend**: Reference list of heart rate zones calculated based on your age.
3.  **Visualization & Analysis (Right)**:
    *   **Live Chart**: A scrolling area chart showing the last 50 data points. Markers indicate moments where the AI analyzed your performance.
    *   **Aggregator Panel**: A feed of "Minute Packets" showing per-minute stats (Avg/Max HR, Calories, Heart Points) and the AI Coach's analysis.
4.  **Debug Console (Bottom)**: A collapsible panel showing raw system logs, state transitions, and AI prompts (useful for debugging).

---

## Configuration

Before starting, configure your profile in the top bar. Click **"Apply & Persist"** on the far right to save settings and reload the connection.

### Biometrics
*   **Subject Age**: Critical. Determines your Max Heart Rate (220 - Age) and Zone thresholds.
*   **Weight (lbs)**: Used for calorie burn calculations.
*   **Gender**: Used to refine the calorie burn formula.

### Mission Parameters
*   **Training Objective**: Selects the strategy the AI uses to judge you (e.g., "Weight Loss" prioritizes Zone 2, "High Intensity" prioritizes Zone 4/5).
*   **Session Target Config**:
    *   **Duration (m)**: Target length of workout in minutes.
    *   **Heart Points (pt)**: Alternative goal. +1 pt/min for Zone 2-3, +2 pts/min for Zone 4-5.
    *   **Calories (kc)**: Alternative calorie burn goal.
*   **Personality**: Selects the AI Coach persona (see [AI Personas](#ai-personas)).
*   **Voice Threshold**: A number from 1-10.
    *   The AI assigns a "Saliency Score" to every insight.
    *   If `Score >= Threshold`, the AI speaks via Text-to-Speech.
    *   *Lower* values make the coach chattier; *Higher* values restrict voice to urgent alerts only.

### Connection
*   **WS Endpoint**: The address of your WebSocket server (e.g., `ws://192.168.1.50:8080`).
*   **Device Hex**: A unique ID sent to the server during handshake (format: `XX:XX:XX:XX:XX:XX`).

---

## Running a Session

1.  **Connect**: Ensure the Status Badge reads **CONNECTED** (Green). If it reads **CONNECTING** (Amber) or **ERROR** (Red), check your WebSocket server.
2.  **Start**: Click the **START SESSION** button.
    *   The AI will generate a **Mission Profile** and **Narrative Plan**.
    *   The AI Coach will speak an intro message.
    *   The Timer will begin counting.
3.  **During Session**:
    *   **Monitor**: Watch the Heart Rate Display and Chart.
    *   **Listen**: The AI will analyze your performance every minute. If it detects a trend or issue (and meets the Voice Threshold), it will speak to you.
    *   **Full Screen**: Click "Full Screen" to hide controls and focus on the biometrics.
4.  **Stop**: Click **STOP SESSION**.
    *   The AI will generate a **Final Report**.
    *   Two log files will automatically download to your computer.

---

## AI Personas

The dashboard features distinct AI personalities to keep you motivated:

*   **Arlie**: *Tactical Combat Trainer.* Treats your workout as a military defense operation. Aggressive, disciplined, hates weakness.
    *   *Voice*: Enceladus (Deep, Authoritative)
*   **Chad**: *Competitive Gym Bro.* Treats the session as a "kill-count" competition. Uses gym slang, arrogant, dry wit.
    *   *Voice*: Algieba (Smug, Dismissive)
*   **Ginger-Chan**: *Anime Idol.* Treats the workout as a "Boss Battle" or game. Hyper-energetic, uses gaming slang, "meow/nya" verbal tics.
    *   *Voice*: Leda (High-pitched, Manic)
*   **Amelia**: *Nihilist Researcher.* Views your exertion as a biological curiosity. Clinical, morbid, detached.
    *   *Voice*: Kore (Monotone, Clinical)
*   **Kaelen**: *Gothic Fantasy.* Treats the session as a dungeon crawl or blood pact. Formal, archaic, epic metaphors.
    *   *Voice*: Sulafat (Solemn, Resonant)

---

## Data & Logs

When you stop a session, AetherAegis generates two text files:

1.  **Session Log** (`session_YYYYMMDD...txt`):
    *   The "Black Box" recording.
    *   Contains full debug traces, raw telemetry arrays per minute, AI prompt chains, token usage, and the full Narrative Mission Plan.
2.  **User Summary** (`usersession_YYYYMMDD...txt`):
    *   A concise, readable summary.
    *   Contains the timestamp, stats (Avg/Max HR, Calories), and the Coach's feedback text for each minute. Perfect for keeping a training diary.

---

## Troubleshooting

*   **No Audio?**: Browsers block audio from playing automatically. You must interact with the page (click anywhere) after loading for the Audio Context to resume. Toggle the "Audio: Active" button off and on to force a resume.
*   **Status: ERROR**:
    *   Verify your WebSocket server is running.
    *   Check if the `WS Endpoint` IP address is correct (use `localhost` if on the same machine, or your LAN IP if on a phone).
    *   Ensure the port (default `:8080`) is not blocked by a firewall.
*   **"Quota Exceeded" in Logs**: This means the Gemini API rate limit has been reached. The system will automatically stop retrying audio synthesis until the quota resets.
