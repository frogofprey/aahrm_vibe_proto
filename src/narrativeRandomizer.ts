import { ParsedNarrativePlan } from './types';

export interface NarrativeProbabilityRule {
  theme: number;       // Probability (0 to 1) of showing [THEME]
  antagonist: number;  // Probability (0 to 1) of showing [ANTAGONIST]
  maguffin: number;    // Probability (0 to 1) of showing [MAGUFFIN]
}

// Editable probability configuration based on the Importance score (1-10)
export const NARRATIVE_PROBABILITY_MATRIX: Record<string, NarrativeProbabilityRule> = {
  // Importance 1-3 (Low Stress / Routine)
  'low': {
    theme: 0.40,
    antagonist: 0.20,
    maguffin: 0.30
  },
  // Importance 4-6 (Moderate Stress / Transitioning)
  'medium': {
    theme: 0.10,
    antagonist: 0.45,
    maguffin: 0.10
  },
  // Importance 7-8 (High Stress / Safety focus)
  'high': {
    theme: 0.00,
    antagonist: 0.15,
    maguffin: 0.00
  },
  // Importance 9-10 (Critical Danger)
  'critical': {
    theme: 0.00,
    antagonist: 0.00,
    maguffin: 0.00
  }
};

/**
 * Maps importance score (1-10) to the corresponding probability tier key.
 */
function getProbabilityTier(importance: number): 'low' | 'medium' | 'high' | 'critical' {
  if (importance >= 9) return 'critical';
  if (importance >= 7) return 'high';
  if (importance >= 4) return 'medium';
  return 'low';
}

/**
 * Builds the narrative_mission_plan section with randomized presence of elements
 * based on the importance score, adhering strictly to the probability matrix.
 * Note: [PROTAGONIST] is always present if it exists.
 */
export function generateRandomizedNarrativeSection(
  parsedPlan: ParsedNarrativePlan,
  importance: number
): string {
  const tierKey = getProbabilityTier(importance);
  const rule = NARRATIVE_PROBABILITY_MATRIX[tierKey];

  // Helper to determine if we show a field based on its configured probability
  const shouldShow = (probability: number): boolean => {
    return Math.random() < probability;
  };

  const lines: string[] = ['narrative_mission_plan:'];

  if (parsedPlan.theme && shouldShow(rule.theme)) {
    lines.push(`[THEME]: ${parsedPlan.theme}`);
  }
  
  if (parsedPlan.maguffin && shouldShow(rule.maguffin)) {
    lines.push(`[MAGUFFIN]: ${parsedPlan.maguffin}`);
  }

  if (parsedPlan.antagonist && shouldShow(rule.antagonist)) {
    lines.push(`[ANTAGONIST]: ${parsedPlan.antagonist}`);
  }

  // Protagonist element MUST be present at all times if defined in the parsed plan.
  if (parsedPlan.protagonist) {
    lines.push(`[PROTAGONIST]: ${parsedPlan.protagonist}`);
  }

  return lines.join('\n');
}
