import { useCallback } from 'react';
import { GoogleGenAI, Modality } from "@google/genai";
import { 
  PersonaConfig, 
  MinuteSummary, 
  TokenUsage, 
  SessionContext, 
  SessionState, 
  TrainingObjective,
  ZoneConfig
} from '../types';
import { 
  PERSONA_CONFIG, 
  BASE_SYSTEM_INSTRUCTION, 
  TELEMETRY_ABSTRACTION_INSTRUCTION 
} from '../constants';
import { extractUsage, cleanInsightText, formatMMSS } from '../lib/utils';

interface UseAiProps {
  age: number;
  sessionDurationGoal: number;
  intervalTime: number;
  intervalCountGoal: number;
  currentObjective: TrainingObjective;
  selectedPersona: string;
  isVoiceEnabled: boolean;
  isTelemetryAbstractionEnabled: boolean;
  isActivityVerbalizationEnabled: boolean;
  selectedActivity: string;
  customActivity: string;
  chattiness: number;
  zones: ZoneConfig[];
  addLog: (msg: string) => void;
  speakInsight: (text: string, customTtsInstruction?: string) => Promise<void>;
}

export function useAi({
  age,
  sessionDurationGoal,
  intervalTime,
  intervalCountGoal,
  currentObjective,
  selectedPersona,
  isVoiceEnabled,
  isTelemetryAbstractionEnabled,
  isActivityVerbalizationEnabled,
  selectedActivity,
  customActivity,
  chattiness,
  zones,
  addLog,
  speakInsight
}: UseAiProps) {

  const generateContentWithRetry = useCallback(async (model: string, contents: any, config: any, maxRetries: number, logPrefix: string) => {
    let attempt = 0;
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    while (true) {
      try {
        return await ai.models.generateContent({ model, contents, config });
      } catch (e: any) {
        const errStr = String(e);
        if (errStr.includes('400') || errStr.includes('401') || errStr.includes('403') || errStr.includes('429') || errStr.includes('ResourceExhausted')) {
          throw e;
        }
        if (attempt >= maxRetries) throw e;
        attempt++;
        addLog(`${logPrefix}: 5xx/Network Error. Retrying (${attempt}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }, [addLog]);

  const generateMissionProfile = useCallback(async () => {
    const mhr = 220 - age;
    const buffWidth = 5;
    const sessionLength = sessionDurationGoal;
    const minTizMins = Math.round(0.8 * sessionLength);
    const maxVarMins = sessionLength - minTizMins;

    const z1_min = Math.round(mhr * 0.5);
    const z1_max = Math.round(mhr * 0.6);
    const z2_min = Math.round(mhr * 0.6);
    const z2_max = Math.round(mhr * 0.7);
    const z3_min = Math.round(mhr * 0.7);
    const z3_max = Math.round(mhr * 0.8);
    const z4_min = Math.round(mhr * 0.8);
    const z4_max = Math.round(mhr * 0.9);
    const z5_min = Math.round(mhr * 0.9);
    const z5_max = mhr;

    const targetZoneIndices = currentObjective.targetZones.map(z => z - 1);
    const targetMin = Math.min(...targetZoneIndices.map(i => zones[i].min));
    const targetMax = Math.max(...targetZoneIndices.map(i => zones[i].max));
    
    const buffMin = Math.round(targetMin - buffWidth);
    const buffMax = targetMax === Infinity ? mhr : Math.round(targetMax + buffWidth);

    let profileText = currentObjective.mission
      .replace(/{{MHR}}/g, mhr.toString())
      .replace(/{{Z1_MIN}}/g, z1_min.toString())
      .replace(/{{Z1_MAX}}/g, z1_max.toString())
      .replace(/{{Z2_MIN}}/g, z2_min.toString())
      .replace(/{{Z2_MAX}}/g, z2_max.toString())
      .replace(/{{Z3_MIN}}/g, z3_min.toString())
      .replace(/{{Z3_MAX}}/g, z3_max.toString())
      .replace(/{{Z4_MIN}}/g, z4_min.toString())
      .replace(/{{Z4_MAX}}/g, z4_max.toString())
      .replace(/{{Z5_MIN}}/g, z5_min.toString())
      .replace(/{{Z5_MAX}}/g, z5_max.toString())
      .replace(/{{BUFF_WIDTH}}/g, buffWidth.toString())
      .replace(/{{BUFF_MIN}}/g, buffMin.toString())
      .replace(/{{BUFF_MAX}}/g, buffMax.toString())
      .replace(/{{MIN_TIZ_MINS}}/g, minTizMins.toString())
      .replace(/{{MAX_VAR_MINS}}/g, maxVarMins.toString())
      .replace(/{{TIME}}/g, intervalTime.toString())
      .replace(/{{COUNT}}/g, intervalCountGoal.toString());

    addLog(`SYSTEM: Mission Profile generated locally for "${currentObjective.title}"`);
    return profileText;
  }, [age, currentObjective, sessionDurationGoal, intervalTime, intervalCountGoal, zones, addLog]);

  const generateNarrativeMissionPlan = useCallback(async (profileText: string) => {
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const strategy = (currentObjective as any).transitionStrategy || "normal state";
    const isInterval = strategy === "interval state" || strategy === "fixed interval state";
    const sessionContext = isInterval 
      ? `Session Structure: ${intervalCountGoal} intervals of ${intervalTime} minutes each.`
      : `Session Duration: ${sessionDurationGoal} minutes.`;
    
    const activityContext = !isActivityVerbalizationEnabled 
      ? `\nActivity Context: The user is performing: ${selectedActivity === 'other' ? customActivity : selectedActivity}`
      : "";

    let exampleFormat = "";
    if (strategy === "interval state") {
        exampleFormat = `
    [THEME]: Operation Laser-Pointer: The high-intensity interval chase against the "Chubby-Chonk" Boss!
    [TIMELINE]:
     0:00 [Interval 1 - The First Pounce]: The Boss engages full laser-chase mode! User must push into the target heart rate zone (135+) to evade the barrage.
     3:00 [Recovery 1 - The Grooming Break]: The Boss retreats to aggressively groom a paw. User must drop back to the recovery zone (115) to shed heat and regroup.
     6:00 [Interval 2 - The Midnight Zoomies]: Unprovoked Phase Two! The Boss initiates the midnight zoomies. Push back into the target heart rate zone (135+) to match the chaos.
     9:00 [Recovery 2 - The Cardboard Box]: The Boss is temporarily distracted by a high-value cardboard box. Maintain the recovery zone (115) and catch your breath.
    12:00 [Interval 3 - The Final Stand]: The Boss goes berserk and summons the red-dot swarm! Final push into the target heart rate zone (135+) to break the sisal shield.
    15:00 [Recovery 3 - The Nap]: The Boss's stamina is broken; the beast demands a nap. Spin down safely to baseline.
    18:00 [Boss Defeated]: The Boss is fully asleep. Encounter survived. 

    [Mission Complete]: VICTORY! The Golden Yarn Trophy is safely secured while the beast slumbers!
    [Maguffin]: Golden Yarn Trophy
    [BONUS]: SECRET STAGE UNLOCKED! You kept pedaling while the boss slept. The Golden Yarn Trophy is enhanced, and your laser pointer is upgraded to a prismatic beam.
    `;
    } else if (strategy === "normal state") {
        exampleFormat = `
    [THEME]: Operation Laser-Pointer: The steady-state siege against the "Chubby-Chonk" Boss to unlock the Golden Yarn Trophy!
    [TIMELINE]:
     0:00 [Warmup Complete]: Boss fight has begun in earnest; user should be in the target heart rate zone now until recovery. 
     5:00 [Engagement Phase]: Boss engages secret weapon laser pointer to distract the user; user should be in the target heart rate zone now until recovery. 
    10:00 [Encounter Midpoint]: Boss at half health - stamina check 
    15:00 [Five Minute Warning]: Boss desperate and uses his sisal shield
    18:00 [Two Minute Warning]: Boss on last legs and desperate, more power to the laser; maintain current effort to defeat the boss. 
    20:00 [Boss Down]: Boss defeated; time to celebrate the victory. User can either recover or go for bonus points. 
    [Mission Complete]:	VICTORY! the Golden Yarn Trophy is yours!
    [Maguffin]: Golden Yarn Trophy
    [BONUS]:	SECRET STAGE UNLOCKED! the Golden Yarn Trophy is enhanced by your extra effort. The laser pointer glows even more brightly. 
    `;
    } else {
        exampleFormat = `
    [THEME]: Operation Laser-Pointer: The fixed-state mission to secure the Golden Yarn Trophy!
    [TIMELINE]:
    (Timeline is blank for fixed state objectives)

    [Mission Complete]: VICTORY! The Golden Yarn Trophy is yours!
    [Maguffin]: Golden Yarn Trophy
    [BONUS]: SECRET STAGE UNLOCKED! The Golden Yarn Trophy is enhanced by your extra effort.
    `;
    }

    const prompt = `
    You are an expert author/Narrative creator. Based on the following Mission Profile and Persona, create a "Narrative Mission Plan" to guide a session story arc that will be used by an LLM tracking the users progress through a workout ensuring that they are staying in the desired heart rate zone and notifying them of session milestones. For this task, only consider the Persona characteristics for the theme and plan; don't literally interpret the persona instructions here. 
    
    Persona: ${personaConfig.systemInstruction}
    Persona Mission Instruction: ${personaConfig.missionProfile}
    Mission Profile: ${profileText}
    ${sessionContext}${activityContext}
    
    Requirements:
    1. Recontextualize the workout goals into the persona's thematic world. Use the persona's thematic world as inspiration for naming and narrative flavor, but write the plan in a neutral, third-person planning voice. 
    2. Define specific Milestones/Narrative events triggering at least every 5 minutes (e.g., at 5m, 10m, 15m...). If expected time for the session is more than 5 minutes, give a 2 minute warning as well. Condense the timeline if needed for shorter sessions. the model is only called on 1 minute intervals so any events occurring more quickly than that will be lost. Incorporate planned state transitions into the plan as best as is possible. 
    3. Define a "Mission Complete" narrative conclusion (Goals Met). Generate a Maguffin for the persona to use narratively. 
    4. Define a "Bonus/Overtime" narrative context (BONUS_ACTIVE state) so the persona will be able to continue a little past the goal if desired. 
    5. Ensure that you match the structure of the session. If the session is based on intervals, ensure that you capture each interval transition and try to theme each transition using the persona's instructions. Focus on the transitions. Note that the interval time provided will be for both interval and recovery as well (so a 3 minute interval time will produce a 6 minute cycle).  If the session is time based, try to create reasonable milestones based on the template. In both cases it may be neccessary to adjust timing to match user parameters. Don't include milestones or sections for warmup as they will be handled outside of the mission script. 
    
    Output Format:
    ${exampleFormat}
    `;

    addLog(`AI_REQUEST: Generating Narrative Mission Plan...`);
    const response = await generateContentWithRetry(
        'gemini-3-flash-preview',
        prompt,
        undefined,
        2,
        'AI_NARRATIVE_PLAN'
    );

    const tokenUsage = extractUsage(response);
    const narrativeText = response.text || "Narrative generation failed.";
    return { prompt, text: narrativeText, tokenUsage };
  }, [selectedPersona, currentObjective, sessionDurationGoal, intervalTime, intervalCountGoal, isActivityVerbalizationEnabled, selectedActivity, customActivity, addLog, generateContentWithRetry]);

  const generateIntroMessage = useCallback(async (narrativePlan?: string) => {
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const personaIdentity = personaConfig.systemInstruction;
    
    const strategy = (currentObjective as any).transitionStrategy || "normal state";
    let objectivesContext = `Mission Parameter: Target Duration: ${sessionDurationGoal} minutes`;
    let examplePhrase = `"Let's make these ${sessionDurationGoal} minutes count"`;

    if (strategy === "interval state" || strategy === "fixed interval state") {
        objectivesContext = `Mission Parameter: Target Intervals: ${intervalCountGoal} cycles of ${intervalTime} minutes each.`;
        examplePhrase = `"Let's smash these ${intervalCountGoal} intervals"`;
    }
    
    const narrativeContext = narrativePlan ? `\nNarrative Mission Plan:\n${narrativePlan}` : "";
    const abstractionInstruction = isTelemetryAbstractionEnabled ? TELEMETRY_ABSTRACTION_INSTRUCTION : "";
    const activityContext = !isActivityVerbalizationEnabled 
        ? `\nActivity Context: The user is performing: ${selectedActivity === 'other' ? customActivity : selectedActivity}`
        : "";

    const prompt = `
    Persona: ${personaIdentity}
    User Goal: ${currentObjective.title}${activityContext}
    ${objectivesContext}
    ${narrativeContext}
    
    ${abstractionInstruction}

    Task: The user has just started a workout session. Generate an introduction to initiate the session.
    Instruction: You are encouraged to reference the Mission Parameter naturally to set the stage (e.g., ${examplePhrase}), but do not output it as a list. Speak to the user, don't read the settings back to them. If a Narrative Mission Plan is provided, incorporate the theme immediately. If there is a maguffin provided, be sure to mention it as the goal of the session. 
    Constraint: Strictly adhere to persona. Four sentence maximum output.
    `;

    addLog(`AI_REQUEST: Generating intro for "${selectedPersona}"...`);
    const response = await generateContentWithRetry(
        'gemini-3-flash-preview',
        prompt,
        undefined,
        1,
        'AI_INTRO'
    );

    const tokenUsage = extractUsage(response);
    const introText = response.text || "Session initialized. AetherAegis monitoring active.";
    addLog(`AI_INTRO: "${introText}"`);
    
    if (isVoiceEnabled) {
        const cleanIntro = cleanInsightText(introText);
        setTimeout(() => speakInsight(cleanIntro), 500);
    }

    return { prompt, text: introText, tokenUsage };
  }, [selectedPersona, currentObjective, sessionDurationGoal, intervalTime, intervalCountGoal, isVoiceEnabled, isTelemetryAbstractionEnabled, isActivityVerbalizationEnabled, selectedActivity, customActivity, addLog, speakInsight, generateContentWithRetry]);

  const generateSessionSummary = useCallback(async (summaries: MinuteSummary[], previousMemoryText: string, transitionHistory: string) => {
    if (summaries.length === 0) return null;
    const latestPacket = summaries[summaries.length - 1];

    const prompt = `
    User Goal: ${currentObjective.title}

    Task: You are maintaining a structured "Mid-Term Memory" log of a workout session. 
    Update the EXISTING SUMMARY using the NEW TELEMETRY and TRANSITION HISTORY.

    FORMATTING RULES:
    1. Output strictly in the format: "[STATE_NAME] summary of performance in this state".
    2. Review the RECENT STATE TRANSITIONS. Ensure EVERY state that has occurred (e.g., [WARMUP], [MAIN_ACTIVE]) has a corresponding summary line.
    3. If a state appears in the transitions but not in the existing summary (e.g. short-lived WARMUP), create a new entry for it summarizing that phase was completed.
    4. If the state exists in the previous summary, update its description with the new data.
    5. Keep summaries objective, concise, and technical. No personality or fluff. Do not use markdown bolding.
    
    RECENT STATE TRANSITIONS (Context):
    ${transitionHistory || "(No transitions yet)"}

    EXISTING SUMMARY:
    ${previousMemoryText || "(No history yet)"}

    NEW TELEMETRY (Minute ${summaries.length}):
    - State: ${latestPacket.sessionState}
    - Avg HR: ${latestPacket.avg} BPM
    - Max HR: ${latestPacket.max} BPM
    - Insight: "${latestPacket.insight || 'N/A'}"

    Output the updated state-based summary block:
    `;

    addLog(`AI_REQUEST: Recursive Mid-Term Memory Update...`);
    const response = await generateContentWithRetry(
        'gemini-3-flash-preview',
        prompt,
        undefined,
        1,
        'AI_MID_TERM_MEMORY'
    );
    
    const tokenUsage = extractUsage(response);
    const summaryText = response.text || "Trends processing...";
    return { text: summaryText, prompt, tokenUsage };
  }, [currentObjective, addLog, generateContentWithRetry]);

  const generateFinalSessionReport = useCallback(async (
    summaries: MinuteSummary[], 
    finalDuration: string, 
    midTermContext: string, 
    missionProfileText: string, 
    narrativeMissionPlanText: string,
    runningMetrics: { heartPoints: number; calories: number; compliantMinutes: number; performanceMinutes: number },
    transitionHistory: string,
    activeDurationMs: number,
    intervalCount: number
  ) => {
    if (summaries.length === 0) return null;

    const lastSummary = summaries[summaries.length - 1];
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const personaIdentity = personaConfig.systemInstruction;
    
    const avgHr = Math.round(summaries.reduce((a,b)=>a+b.avg,0)/summaries.length);
    const peakHr = Math.max(...summaries.map(s => s.max));
    const totalCalories = runningMetrics.calories;
    const totalPoints = runningMetrics.heartPoints;
    const performanceMinutes = runningMetrics.performanceMinutes;

    const abstractionInstruction = isTelemetryAbstractionEnabled ? TELEMETRY_ABSTRACTION_INSTRUCTION : "";
    const activityContext = !isActivityVerbalizationEnabled 
        ? `\nActivity Context: The user is performing: ${selectedActivity === 'other' ? customActivity : selectedActivity}`
        : "";

    const activeDurationStr = formatMMSS(activeDurationMs);
    const activeMinutes = (activeDurationMs / 60000).toFixed(1);

    const prompt = `
    Persona: ${personaIdentity}
    User Goal: ${currentObjective.title}${activityContext}
    Mission Plan / Profile: ${missionProfileText}
    Narrative Mission Plan: ${narrativeMissionPlanText}

    ${abstractionInstruction}

    Task: The workout session has ended. Generate a final session report based on the context below. Use only prose and don't include any markdown tags in the output. Output will be read by a TTS so ensure that it won't sound like "reading a phonebook". Four sentence maximum output. 
    
    Constraints: 
    - State if the user has satisfied the workout requirements with respect to time spent and/or zone compliance. Don't be afraid to note if requirements have not been met. 
    - Professional, summary-focused, and concluding. 
    - Be generous with the ending workout stats. 
    - Explicitly mention major milestones achieved (e.g., reaching target zones, completing objective time). Explicitly mention the boss and Maguffin. 
    - Use the 'Active Duration' (${activeMinutes} mins) as the primary reference for workout intensity and milestone timing.
    - Include a final word of encouragement.
    
    Session Stats: 
    - Total Wall Time: ${finalDuration}
    - Active Workout Time: ${activeDurationStr} (${activeMinutes} mins)
    - Avg HR: ${avgHr} BPM
    - Peak HR: ${peakHr} BPM
    - Calories: ${totalCalories.toFixed(0)}
    - Heart Points: ${totalPoints}
    ${((currentObjective as any).transitionStrategy === "interval state" || (currentObjective as any).transitionStrategy === "fixed interval state") ? `- Intervals Completed: ${intervalCount} / ${intervalCountGoal}` : ""}
    
    Zone Compliance: ${runningMetrics.compliantMinutes}/${performanceMinutes} performance minutes matching target zones.
    
    Session State Timeline:
    ${transitionHistory}

    Mid-Term Trend: ${midTermContext}
    Last Minute Insight: ${lastSummary.insight || "N/A"}
    `;

    addLog(`AI_REQUEST: Generating Final Session Report...`);
    const response = await generateContentWithRetry(
        'gemini-3-flash-preview',
        prompt,
        undefined,
        1,
        'AI_FINAL_REPORT'
    );
    
    const tokenUsage = extractUsage(response);
    const reportText = response.text || "Session concluded. Data saved.";
    const fullReportText = `${reportText}\n\nLLM Model: gemini-3-flash-preview\nTTS Model: gemini-2.5-flash-preview-tts`;
    
    if (isVoiceEnabled) {
        const cleanReport = cleanInsightText(reportText);
        speakInsight(cleanReport);
    }

    return { prompt, text: fullReportText, tokenUsage, reportText };
  }, [selectedPersona, currentObjective, isVoiceEnabled, speakInsight, generateContentWithRetry, isTelemetryAbstractionEnabled, isActivityVerbalizationEnabled, selectedActivity, customActivity, intervalCountGoal]);

  const requestAiInsight = useCallback(async (
    summary: MinuteSummary,
    allSummaries: MinuteSummary[],
    missionProfileText: string,
    narrativeMissionPlanText: string,
    sessionIntroText: string,
    midTermMemoryText: string,
    performanceDurationMs: number,
    activeDurationMs: number,
    runningMetrics: { heartPoints: number; calories: number; compliantMinutes: number; performanceMinutes: number },
    intervalCount: number,
    hrTrend: string
  ) => {
    const personaConfig = PERSONA_CONFIG[selectedPersona] || PERSONA_CONFIG["Arlie"];
    const personaIdentity = personaConfig.systemInstruction;
    
    let goalContext = `${currentObjective.title}`;
    if (missionProfileText) goalContext += `\n\nMISSION PROFILE (Baseline Targets):\n${missionProfileText}`;
    if (narrativeMissionPlanText) goalContext += `\n\nNARRATIVE MISSION PLAN (Story Arc):\n${narrativeMissionPlanText}`;

    const abstractionInstruction = isTelemetryAbstractionEnabled ? TELEMETRY_ABSTRACTION_INSTRUCTION : "";
    const activityContext = !isActivityVerbalizationEnabled 
        ? `\nActivity Context: The user is performing: ${selectedActivity === 'other' ? customActivity : selectedActivity}`
        : "";

    const tailoredSystemInstruction = `Persona: ${personaIdentity}
    Brevity Driver: ${personaConfig.iterationBrevityDriver}
    Mission Weight: ${personaConfig.missionWeight} (0-1 scale of how heavily to incorporate narrative elements)
    Baseline TTS Instruction: ${personaConfig.ttsBaselineInstruction}
    ${BASE_SYSTEM_INSTRUCTION
        .replace('{{GOAL}}', goalContext + activityContext)
        .replace('{{TELEMETRY_CONSTRAINT}}', abstractionInstruction)}`;
    
    const currentIndex = allSummaries.findIndex(s => s.id === summary.id);
    let historyContext = "";
    
    if (currentIndex === 0) {
        if (sessionIntroText) historyContext = `[HISTORY: START OF SESSION]\nCoach Intro: "${sessionIntroText}"\n`;
    } else if (currentIndex === 1) {
        if (sessionIntroText) historyContext += `[HISTORY: START OF SESSION]\nCoach Intro: "${sessionIntroText}"\n\n`;
        const prev = allSummaries[0];
        historyContext += `[HISTORY: PREVIOUS UPDATE (Minute 1)]\nMetrics: Avg ${prev.avg}, Max ${prev.max}\nCoach Feedback: "${prev.insight || 'N/A'}"\nCoaching Directive: "${prev.coachingDirective || 'N/A'}"\n`;
    } else {
        const prev2 = allSummaries[currentIndex - 2];
        const prev1 = allSummaries[currentIndex - 1];
        historyContext += `[HISTORY: 2 MINUTES AGO]\nMetrics: Avg ${prev2.avg}, Max ${prev2.max}\nCoach Feedback: "${prev2.insight || 'N/A'}"\nCoaching Directive: "${prev2.coachingDirective || 'N/A'}"\n\n`;
        historyContext += `[HISTORY: 1 MINUTE AGO]\nMetrics: Avg ${prev1.avg}, Max ${prev1.max}\nCoach Feedback: "${prev1.insight || 'N/A'}"\nCoaching Directive: "${prev1.coachingDirective || 'N/A'}"\n`;
    }

    let memoryContext = midTermMemoryText ? `MID-TERM SESSION CONTEXT (Overall Trend Summary):\n"${midTermMemoryText}"\n(Use this context to ensure your new advice aligns with the bigger picture)\n` : "";
    const currentPerformanceMinutes = (performanceDurationMs / 60000).toFixed(1);
    
    let activeTimeStr = formatMMSS(activeDurationMs);
    if (summary.sessionState === SessionState.WARMUP || summary.sessionState === SessionState.INIT) {
        activeTimeStr = 'WARMING UP';
    }
    
    const timerContext = `[CURRENT TIMERS]\nActive_Time: ${activeTimeStr}`;
    const strategy = (currentObjective as any).transitionStrategy || "normal state";
    let objectiveStatus = `[OBJECTIVE STATUS TRACKER - CONTEXT INPUT ONLY]\n- Time: ${currentPerformanceMinutes} / ${sessionDurationGoal} mins`;
    if (strategy === "interval state" || strategy === "fixed interval state") {
        objectiveStatus = `[OBJECTIVE STATUS TRACKER - CONTEXT INPUT ONLY]\n- Intervals: ${intervalCount} / ${intervalCountGoal}\n- Interval Time: ${intervalTime} mins`;
    }
    
    const totalPerformanceMinutes = runningMetrics.performanceMinutes;
    objectiveStatus += `\n- Compliance: ${runningMetrics.compliantMinutes.toFixed(1)}/${totalPerformanceMinutes.toFixed(1)} performance minutes in target zone`;
    objectiveStatus += `\n(System Context: Use the following metrics as the factual foundation for your observations. Translate these values into your persona's voice—focus on the 'State of the Mission' rather than the raw digits. Do not replicate the list format; simply internalize the data to inform your judgment.)`;
    
    memoryContext += `\n${objectiveStatus}\n`;
    memoryContext += `[CURRENT SESSION STATE]: ${summary.sessionState}\n\n`;

    const jsonTask = `
    [TASK]
    Generate a coaching insight for the user based on the current minute summary and session context.
    Return the response as a JSON object with the following structure:
    {
      "saliency_score": number,  
      "milestone_tag_id": string, // relevant milestone/narrative beat tied to current output. if none, then return "none"
      "coaching_directive": string, // CRITICAL: one of the following: "MAINTAIN_PACE", "INCREASE_EFFORT", "DECREASE_EFFORT", "EMERGENCY_STOP", "PREPARE_TRANSITION"
      "persona_narrative": string, // The flavor text, constrained by the lore element.
      "tts_instruction": string, // Modification of provided Baseline TTS Instruction to direct output and enhance the TTS.
      "perceived_state": string // Echo: "warmup", "main_active", "recovery" , "bonus_active" , "pause" , "error"
    }
    `;

    const wallTime = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const prompt = `${tailoredSystemInstruction}\n\n[WALL_TIME]: ${wallTime}\n\n${memoryContext}${historyContext ? `SHORT-TERM CONTEXT (Maintain continuity):\n${historyContext}\n\n` : ''}CURRENT MINUTE PACKET:\n- Average BPM: ${summary.avg}\n- Max BPM: ${summary.max}\n- Min BPM: ${summary.min}\n- HR Trend (10s): ${hrTrend}\n- Calories Burned (Min): ${summary.calories.toFixed(1)}\n- Heart Points (Min): ${summary.heartPoints}\n- Sample Count: ${summary.sampleCount}\n- Raw Telemetry Stream: [${summary.values.join(', ')}]\n\n${timerContext}\n\n${jsonTask}`;

    addLog(`AI_REQUEST: Analyzing for goal: "${currentObjective.title}" as "${selectedPersona}"...`);
    const response = await generateContentWithRetry(
        'gemini-3-flash-preview',
        prompt,
        { responseMimeType: 'application/json' },
        1,
        'AI_INSIGHT'
    );

    const tokenUsage = extractUsage(response);
    const insightRaw = response.text || "{}";
    addLog(`AI_INSIGHT_JSON: ${insightRaw}`);

    let insightData: any;
    try {
      insightData = JSON.parse(insightRaw);
      if (Array.isArray(insightData) && insightData.length > 0) insightData = insightData[0];
      if (typeof insightData.saliency_score !== 'number') insightData.saliency_score = 10;
      if (!insightData.milestone_tag_id) insightData.milestone_tag_id = "none";
      if (!insightData.coaching_directive) insightData.coaching_directive = "MAINTAIN";
      if (!insightData.persona_narrative) insightData.persona_narrative = insightRaw;
      if (!insightData.tts_instruction) insightData.tts_instruction = personaConfig.ttsBaselineInstruction;
      if (!insightData.perceived_state) insightData.perceived_state = summary.sessionState || "unknown";
    } catch (e) {
      insightData = {
        saliency_score: 10,
        milestone_tag_id: "none",
        coaching_directive: "MAINTAIN",
        persona_narrative: insightRaw,
        tts_instruction: personaConfig.ttsBaselineInstruction,
        perceived_state: summary.sessionState || "unknown"
      };
    }

    if (insightData.saliency_score >= chattiness) {
        speakInsight(insightData.persona_narrative, insightData.tts_instruction);
    }

    return { prompt, insightData, tokenUsage, insightRaw };
  }, [selectedPersona, currentObjective, sessionDurationGoal, intervalTime, intervalCountGoal, chattiness, speakInsight, generateContentWithRetry, isTelemetryAbstractionEnabled, isActivityVerbalizationEnabled, selectedActivity, customActivity]);

  return {
    generateMissionProfile,
    generateNarrativeMissionPlan,
    generateIntroMessage,
    generateSessionSummary,
    generateFinalSessionReport,
    requestAiInsight
  };
}
