
/**
 * Helper to format seconds into M:SS
 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface Milestone {
  seconds: number;
  label: string;
  description: string;
}

/**
 * Programmatically generates a Mission Plan template based on the session parameters.
 * The output is intended to be used as a template for a follow-on LLM call to populate with narrative flavor.
 */
export function generateMissionPlanTemplate(
  strategy: string,
  sessionDurationGoal: number,
  intervalTime: number,
  intervalCountGoal: number = 3
): string {
  let themePlaceholder = "[Insert high-level thematic setting here]";
  let maguffinPlaceholder = "[Insert the specific, thematic goal or item being pursued]";
  let timeline: Milestone[] = [];
  let missionCompletePlaceholder = "[Final thematic victory message!]";
  let bonusPlaceholder = "[Description of thematic rewards for continuing past the goal time]";

  if (strategy === "interval state" || strategy === "fixed interval state") {
    themePlaceholder = "[Insert high-level thematic setting for an interval session here]";
    
    const intervalDuration = intervalTime * 60;
    const cycleSeconds = intervalDuration * 2; // High + Recovery (50/50 split)
    const totalSessionSeconds = cycleSeconds * intervalCountGoal;

    for (let i = 0; i < intervalCountGoal; i++) {
      const cycleStart = i * cycleSeconds;
      const recoveryStart = cycleStart + intervalDuration;

      timeline.push({
        seconds: cycleStart,
        label: `[Interval ${i + 1} Name]`,
        description: `[Thematic description of the high-intensity interval ${i + 1}. Encourage effort and target zone engagement.]`
      });

      timeline.push({
        seconds: recoveryStart,
        label: `[Recovery ${i + 1} Name]`,
        description: `[Thematic description of recovery period ${i + 1}. Encourage heat shedding and heart rate reduction.]`
      });
    }

    // Add final milestone at the exact end
    timeline.push({
      seconds: totalSessionSeconds,
      label: "[Mission Success Name]",
      description: "[Resolution of the thematic encounter and cooldown transition]"
    });

  } else {
    // NORMAL_STATE or FIXED_STATE (else)
    if (strategy === "normal state") {
      themePlaceholder = "[Insert high-level thematic setting for a normal session here]";
    } else {
      themePlaceholder = "[Insert high-level thematic setting for a fixed-state session here]";
    }

    const durationSeconds = sessionDurationGoal * 60;
    const milestones: Milestone[] = [];

    // Define milestones in order of hierarchy (highest first)
    // 1. Start and End
    const startDescription = strategy === "normal state" 
      ? "[Insert thematic description of the session beginning. This denotes the end of the warmup session.]"
      : "[Insert thematic description of the session beginning. This denotes the start of the session.]";

    milestones.push({ seconds: 0, label: "[Event Name]", description: startDescription });
    milestones.push({ seconds: durationSeconds, label: "[Event Name]", description: "[Insert description of the resolution and cooldown transition]" });

    // 2. Warning (2 mins prior to end)
    const warningSeconds = durationSeconds - 120;
    if (warningSeconds > 0) {
      milestones.push({ seconds: warningSeconds, label: "[Event Name]", description: "[Insert description of the climax or final push nearing completion]" });
    }

    // 3. Every 5 minutes
    for (let s = 300; s < durationSeconds; s += 300) {
      milestones.push({ seconds: s, label: "[Event Name]", description: "[Insert description of a mid-point complication or environmental change]" });
    }

    // Sort to apply hierarchy rules
    const accepted: Milestone[] = [];

    // Hierarchy: Start/End > Warning > 5-min intervals
    const priorityList = [
      ...milestones.filter(m => m.seconds === 0 || m.seconds === durationSeconds), // Priority 1
      ...milestones.filter(m => m.seconds === warningSeconds), // Priority 2
      ...milestones.filter(m => m.seconds > 0 && m.seconds < durationSeconds && m.seconds % 300 === 0 && m.seconds !== warningSeconds) // Priority 3
    ];

    for (const m of priorityList) {
      const conflict = accepted.some(a => Math.abs(a.seconds - m.seconds) < 60);
      if (!conflict) {
        accepted.push(m);
      }
    }

    // Sort accepted milestones by time
    accepted.sort((a, b) => a.seconds - b.seconds);
    timeline = accepted;
  }

  // Format Timeline
  const timelineStr = timeline
    .map(m => `${formatTime(m.seconds)} ${m.label} || ${m.description}`)
    .join('\n');

  // Multi-line string format
  return `[THEME]: ${themePlaceholder}
[MAGUFFIN]: ${maguffinPlaceholder}
[TIMELINE]:
${timelineStr}

[Mission Complete]: ${missionCompletePlaceholder}
[BONUS]: ${bonusPlaceholder}`;
}
