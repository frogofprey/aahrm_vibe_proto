<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/18ho9JSgluAtHFc3AEuMwkFuuUgj4JbuD

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

   
# AetherAegis Vibe Prototype

### What is this?
This is a logic sandbox for **AetherAegis**, a DIY heart rate monitor project. Instead of just showing a graph, I'm using LLMs to turn biometric data into an active "Mission Controller" that actually talks to you while you work out.

The goal is to move past the "AI as a chatbot" phase and figure out how to make it act like a real-time OS.

### The Focus
* **Objective Land:** I’m pulling the math out of the AI's hands and hard-coding it. The AI doesn't get to guess if I'm in Zone 2; the Android code tells it the "Objective Truth," and the AI just handles the personality.
* **Persona Testing:** Swapping between different "Vibes" (like a Drill Sergeant or a Gamer-Girl) to see which one actually keeps me motivated in VR.
* **State Machine Logic:** Moving from a simple timer to a structured session: Warmup → Main Mission → Victory Lap → Recovery.
* **No "Participation Trophies":** If the goal is 10 Heart Points and I hit 9, the system flags it as a failure. I'm trying to build a coach that actually holds me to the numbers.

### Repos
* **Vibe Prototype (This repo):** Where I test the prompts and persona responses.
* **[Vibe Sim](https://github.com/frogofprey/vibesim):** A tool to feed fake heart rate data into the system so I don't have to jump on a bike every time I want to test a line of code.
