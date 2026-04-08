import { MinuteSummary, SessionState, TrainingObjective, ZoneConfig } from '../types';
import { PERSONA_CONFIG } from '../constants';

export function calculateMinuteSummary(
  values: number[],
  age: number,
  weight: number,
  gender: string,
  zones: ZoneConfig[],
  currentSessionState: SessionState
): MinuteSummary {
  const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  const max = Math.max(...values);
  const min = Math.min(...values);

  // Calorie Calculation (Keytel Equation)
  // Male: ((-55.0969 + (0.6309 * HR) + (0.1988 * W) + (0.2017 * A)) / 4.184) * T
  // Female: ((-20.4022 + (0.4472 * HR) - (0.1263 * W) + (0.074 * A)) / 4.184) * T
  let calories = 0;
  if (gender === 'Male') {
    calories = ((-55.0969 + (0.6309 * avg) + (0.1988 * weight) + (0.2017 * age)) / 4.184);
  } else {
    calories = ((-20.4022 + (0.4472 * avg) - (0.1263 * weight) + (0.074 * age)) / 4.184);
  }
  calories = Math.max(0, calories); // Ensure non-negative

  // Heart Points Calculation
  // +1 for Zone 2/3, +2 for Zone 4/5
  let heartPoints = 0;
  if (avg >= zones[3].min) heartPoints = 2; // Zone 4+
  else if (avg >= zones[1].min) heartPoints = 1; // Zone 2/3

  return {
    id: String(Date.now()),
    timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    avg,
    max,
    min,
    values: [...values],
    sampleCount: values.length,
    calories,
    heartPoints,
    sessionState: currentSessionState,
    isAnalyzing: true
  };
}

export function triggerDownload(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface DownloadSessionLogProps {
  age: number;
  weight: number;
  gender: string;
  currentObjective: TrainingObjective;
  sessionDurationGoal: number;
  intervalCountGoal: number;
  intervalTime: number;
  intervalCount: number;
  deviceIdHex: string;
  selectedPersona: string;
  chattiness: number;
  isTelemetryAbstractionEnabled: boolean;
  runningMetrics: { heartPoints: number; calories: number; compliantMinutes: number; performanceMinutes: number };
  allSessionSummaries: MinuteSummary[];
  sessionTransitions: { timestamp: string; message: string }[];
  finalSessionReport?: { text: string; tokenUsage?: any; prompt: string };
  missionProfile?: { text: string; tokenUsage?: any; prompt: string };
  narrativeMissionPlan?: { text: string; tokenUsage?: any; prompt: string };
  sessionIntro?: { text: string; tokenUsage?: any; prompt: string };
}

export function generateSessionLogContent({
  age,
  weight,
  gender,
  currentObjective,
  sessionDurationGoal,
  intervalCountGoal,
  intervalTime,
  intervalCount,
  deviceIdHex,
  selectedPersona,
  chattiness,
  isTelemetryAbstractionEnabled,
  runningMetrics,
  allSessionSummaries,
  sessionTransitions,
  finalSessionReport,
  missionProfile,
  narrativeMissionPlan,
  sessionIntro
}: DownloadSessionLogProps) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');

  const totalPoints = runningMetrics.heartPoints;
  const totalCalories = runningMetrics.calories;
  const performanceMinutes = runningMetrics.performanceMinutes;
  const totalDurationMinutes = allSessionSummaries.length;
  
  const strategy = (currentObjective as any).transitionStrategy || "normal state";
  let activeObjectiveStr = `Time ${sessionDurationGoal}m`;
  if (strategy === "interval state" || strategy === "fixed interval state") {
      activeObjectiveStr = `${intervalCountGoal} Intervals of ${intervalTime}m each`;
  }

  // --- FILE 1: FULL DEBUG LOG ---
  let contentDebug = `AETHER AEGIS // SESSION LOG\n`;
  contentDebug += `Generated: ${now.toLocaleString()}\n`;
  contentDebug += `Subject Age: ${age}\n`;
  contentDebug += `Subject Weight: ${weight} lbs\n`;
  contentDebug += `Subject Gender: ${gender}\n`;
  contentDebug += `Training Goal: ${currentObjective.title}\n`;
  contentDebug += `Strategy: ${(currentObjective as any).transitionStrategy}\n`;
  contentDebug += `OBJECTIVES: ${activeObjectiveStr}\n`;
  contentDebug += `TOTAL CALORIES BURNED: ${totalCalories.toFixed(1)} kcal\n`;
  contentDebug += `TOTAL HEART POINTS: ${totalPoints}\n`;
  if (strategy === "interval state" || strategy === "fixed interval state") {
      contentDebug += `INTERVALS COMPLETED: ${intervalCount} / ${intervalCountGoal}\n`;
  }
  contentDebug += `ZONE COMPLIANCE: ${runningMetrics.compliantMinutes.toFixed(1)}/${performanceMinutes.toFixed(1)} active minutes (Total Wall Time: ${totalDurationMinutes}m)\n`;
  contentDebug += `Device ID: ${deviceIdHex}\n`;
  contentDebug += `Personality: ${selectedPersona}\n`;
  contentDebug += `Voice Profile: ${PERSONA_CONFIG[selectedPersona].voiceName}\n`;
  contentDebug += `Voice Threshold (Chattiness): ${chattiness}\n`;
  contentDebug += `Telemetry Abstraction: ${isTelemetryAbstractionEnabled}\n`;
  
  if (finalSessionReport) {
      contentDebug += `Final Session Report: ${finalSessionReport.text}\n`;
      if (finalSessionReport.tokenUsage) {
          const u = finalSessionReport.tokenUsage;
          contentDebug += `[Tokens: In ${u.input} / Out ${u.output} / Tot ${u.total}]\n`;
      }
  }

  contentDebug += `--------------------------------------------------\n`;
  
  contentDebug += `[STATE TRANSITION HISTORY]\n`;
  if (sessionTransitions.length > 0) {
      sessionTransitions.forEach(t => {
          contentDebug += `[${t.timestamp}] ${t.message}\n`;
      });
  } else {
      contentDebug += `No transitions recorded.\n`;
  }
  contentDebug += `--------------------------------------------------\n\n`;

  if (missionProfile) {
      contentDebug += `[MISSION PROFILE]\n`;
      contentDebug += `Prompt: ${missionProfile.prompt}\n`;
      contentDebug += `Response: ${missionProfile.text}\n`;
      if (missionProfile.tokenUsage) {
          const u = missionProfile.tokenUsage;
          contentDebug += `[Tokens: In ${u.input} / Out ${u.output} / Tot ${u.total}]\n`;
      }
      contentDebug += `--------------------------------------------------\n\n`;
  }

  if (narrativeMissionPlan) {
      contentDebug += `[NARRATIVE MISSION PLAN]\n`;
      contentDebug += `Prompt: ${narrativeMissionPlan.prompt}\n`;
      contentDebug += `Response: ${narrativeMissionPlan.text}\n`;
      if (narrativeMissionPlan.tokenUsage) {
          const u = narrativeMissionPlan.tokenUsage;
          contentDebug += `[Tokens: In ${u.input} / Out ${u.output} / Tot ${u.total}]\n`;
      }
      contentDebug += `--------------------------------------------------\n\n`;
  }

  if (sessionIntro) {
      contentDebug += `[SESSION INTRO]\n`;
      contentDebug += `Prompt: ${sessionIntro.prompt}\n`;
      contentDebug += `Response: ${sessionIntro.text}\n`;
      if (sessionIntro.tokenUsage) {
          const u = sessionIntro.tokenUsage;
          contentDebug += `[Tokens: In ${u.input} / Out ${u.output} / Tot ${u.total}]\n`;
      }
      contentDebug += `--------------------------------------------------\n\n`;
  }

  if (allSessionSummaries.length === 0) {
    contentDebug += `[NO DATA PACKETS RECORDED]\n`;
  } else {
    allSessionSummaries.forEach((s, index) => {
      contentDebug += `[PACKET #${index + 1} | ${s.timestamp}]\n`;
      contentDebug += `   > STATE      : ${s.sessionState || "N/A"}\n`;
      contentDebug += `   > HEART RATE : Avg ${s.avg} | Max ${s.max} | Min ${s.min} (Samples: ${s.sampleCount})\n`;
      contentDebug += `   > METRICS    : ${s.calories.toFixed(1)} kcal | ${s.heartPoints} HP\n`;
      if (s.sessionContextSummary) {
          contentDebug += `   > SESSION CONTEXT (Mid-Term Memory) : ${s.sessionContextSummary.text}\n`;
          contentDebug += `     [Context Prompt]: \n${s.sessionContextSummary.prompt}\n`;
          if (s.sessionContextSummary.tokenUsage) {
             const u = s.sessionContextSummary.tokenUsage;
             contentDebug += `     [Context Tokens]: In ${u.input} / Out ${u.output} / Tot ${u.total}\n`;
          }
      }
      contentDebug += `   > AI PROMPT : \n${s.prompt || "N/A"}\n`;
      contentDebug += `   > AI ANALYST : ${s.insight || "Analysis pending or failed."}\n`;
      contentDebug += `   > AI JSON    : ${s.rawJson || "N/A"}\n`;
      if (s.tokenUsage) {
          contentDebug += `   > TOKENS     : In ${s.tokenUsage.input} | Out ${s.tokenUsage.output} | Tot ${s.tokenUsage.total}\n`;
      }
      contentDebug += `   > RAW VALUES : [${s.values.join(',')}]\n`;
      contentDebug += `\n`;
    });
  }

  if (finalSessionReport) {
      contentDebug += `--------------------------------------------------\n`;
      contentDebug += `[FINAL REPORT DIAGNOSTICS]\n`;
      contentDebug += `Prompt Used:\n${finalSessionReport.prompt}\n\n`;
      contentDebug += `Raw Response:\n${finalSessionReport.text}\n`;
  }

  // --- FILE 2: USER SESSION SUMMARY (Concise) ---
  let contentUser = `AETHER AEGIS // USER SESSION SUMMARY\n`;
  contentUser += `Generated: ${now.toLocaleString()}\n`;
  contentUser += `Subject Age: ${age}\n`;
  contentUser += `Subject Weight: ${weight} lbs\n`;
  contentUser += `Training Goal: ${currentObjective.title}\n`;
  contentUser += `Objectives: ${activeObjectiveStr}\n`;
  contentUser += `Total Calories: ${totalCalories.toFixed(1)} kcal\n`;
  contentUser += `Total Heart Points: ${totalPoints}\n`;
  if (strategy === "interval state" || strategy === "fixed interval state") {
      contentUser += `Intervals Completed: ${intervalCount} / ${intervalCountGoal}\n`;
  }
  contentUser += `Zone Compliance: ${runningMetrics.compliantMinutes.toFixed(1)}/${performanceMinutes.toFixed(1)} active minutes\n`;
  contentUser += `Personality: ${selectedPersona}\n`;
  contentUser += `--------------------------------------------------\n\n`;

  if (sessionIntro) {
      contentUser += `[SESSION START]\n`;
      contentUser += `Coach Intro: "${sessionIntro.text}"\n\n`;
  }

  if (allSessionSummaries.length > 0) {
      contentUser += `[TIMELINE]\n`;
      allSessionSummaries.forEach((s, index) => {
          contentUser += `Minute ${index + 1} (${s.timestamp}): Avg ${s.avg} BPM | Max ${s.max} BPM\n`;
          contentUser += `Metrics: ${s.calories.toFixed(1)} kcal, ${s.heartPoints} HP\n`;
          contentUser += `State: ${s.sessionState}\n`;
          contentUser += `Saliency Score: ${s.saliencyScore ?? "N/A"} | Coaching: ${s.coachingDirective || "N/A"}\n`;
          contentUser += `Coach: "${s.insight || "N/A"}"\n\n`;
      });
  }

  if (finalSessionReport) {
      contentUser += `[SESSION END]\n`;
      contentUser += `Final Report: "${finalSessionReport.text}"\n`;
  }

  return { contentDebug, contentUser, filenameDebug: `session_${yyyy}${mm}${dd}${hh}${min}.txt`, filenameUser: `usersession_${yyyy}${mm}${dd}${hh}${min}.txt` };
}
