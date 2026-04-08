# User Session Summary Schema (`usersession_*.txt`)

The **User Session Summary** is a concise, human-readable log designed for training diaries or ingestion into long-term memory systems. It strips away technical debug data (prompts, raw arrays, tokens) to focus on performance and coaching feedback.

**Filename Format**: `usersession_YYYYMMDDHHMM.txt`

## 1. Header
*   **Timestamp**: Date and time of generation.
*   **Subject Config**: Age, Weight, **Activity**.
*   **Goals**: Training Goal, specific Objectives (e.g., "Time 20m" or "3 Intervals").
*   **Totals**: Total Calories, Total Heart Points, **Intervals Completed** (if applicable).
*   **Compliance**: X/Y Active Minutes in target zone.
*   **Personality**: The persona used (e.g., "Arlie").

## 2. Session Start
*   **Coach Intro**: The opening motivational line spoken by the AI.

## 3. Timeline
A chronological list of minute-by-minute performance.

For each minute:
*   **Index**: Minute number.
*   **Time**: Wall clock timestamp.
*   **Active Time**: Time spent in performance states (MM:SS).
*   **Heart Rate**: Average and Max BPM.
*   **Metrics**: Calories and Heart Points accumulated in that minute.
*   **State**: The session state (e.g., `WARMUP`, `MAIN_ACTIVE`).
*   **Saliency Score**: Urgency level (1-10).
*   **Coaching Directive**: Short, actionable instruction (e.g., "SPEED UP").
*   **Coach**: The specific feedback/insight provided by the AI for that minute.

## 4. Session End
*   **Final Report**: The concluding summary spoken by the coach.
