import { TrainingObjective } from './types';

export const TRAINING_OBJECTIVES: TrainingObjective[] = [
  {
    title: "Metabolic Burn",
    targetZones: [2],
    transitionStrategy: "normal state",
    mission:
      "METABOLIC BURN (Zone 2 Lipid Oxidation)\nBIOMETRIC MAP\nMHR: {{MHR}} BPM\nZ1: {{Z1_MIN}}-{{Z1_MAX}} BPM\nZ2: {{Z2_MIN}}-{{Z2_MAX}} BPM\nZ3: {{Z3_MIN}}-{{Z3_MAX}} BPM\nZ4: {{Z4_MIN}}-{{Z4_MAX}} BPM\nZ5: {{Z5_MIN}}-{{Z5_MAX}} BPM\nPRIMARY DIRECTIVE\nTarget: Zone 2 ({{Z2_MIN}}-{{Z2_MAX}} BPM)\nBuffer: {{BUFF_MIN}}-{{BUFF_MAX}} BPM (+/- {{BUFF_WIDTH}} BPM)\nSuccess: >=80% Time-in-Zone (Min: {{MIN_TIZ_MINS}} minutes)\nPHASE PROTOCOLS\nWARMUP: Transition to {{Z2_MIN}} BPM. Goal: Reach target within 2:00.\nMAIN_ACTIVE: Maintain steady-state within {{BUFF_MIN}}-{{BUFF_MAX}} BPM.\nBONUS_ACTIVE: Optional extension. Maintain >80% cumulative TIZ.\nRECOVERY: Goal: HR < {{Z2_MIN}} BPM\nADHERENCE LOGIC\nRating: 'Good' if Zone 2/Buffer is held for 80% of total duration.\nVariance: Deviations to Z1/Z3 allowed for <20% total time (Max: {{MAX_VAR_MINS}} mins).\nSAFETY & RECOVERY\nRecovery Ceiling: {{Z2_MIN}} BPM (Z2 floor).\nRedline: {{Z4_MIN}} BPM.\nAlert: Warning - Heart rate well above target. Reduce intensity."
  },
  {
    title: "Strength Training",
    targetZones: [1, 2, 3],
    transitionStrategy: "fixed state - MAIN_ACTIVE",
    mission: "NEUROMUSCULAR COMPANION (Strength / Free-Weight)\nBIOMETRIC MAP\nMHR: {{MHR}} BPM\nZ1: {{Z1_MIN}}-{{Z1_MAX}} BPM\nZ2: {{Z2_MIN}}-{{Z2_MAX}} BPM\nZ3: {{Z3_MIN}}-{{Z3_MAX}} BPM\nZ4: {{Z4_MIN}}-{{Z4_MAX}} BPM\nZ5: {{Z5_MIN}}-{{Z5_MAX}} BPM\nPRIMARY DIRECTIVE\nTarget: Localized Muscular Fatigue.\nRole: Ambient Companion & Safety Spotter.\nSuccess: Completion of session without breaching cardiovascular safety thresholds.\nPHASE PROTOCOLS (Single Continuous State)\nMAIN_ACTIVE: Session initiates immediately. AI provides ambient, non-time-critical companion narrative.\nLogic Rule: AI completely ignores HR floor. Do not prompt user to \"speed up\" or \"increase intensity.\"\nADHERENCE LOGIC\nRating: N/A\nSAFETY & RECOVERY (The Lifeguard Failsafe)\nRest-Gate Threshold: {{Z3_MAX}} BPM (AI advises user to wait if HR is above this before lifting).\nRedline: {{Z4_MIN}} BPM.\nAlert: Warning - Cardiovascular debt too high for safe mechanical bracing. Rack the weight, sit down, and clear your heart rate"
  },
  {
    title: "Anaerobic Interval",
    targetZones: [4, 5],
    transitionStrategy: "normal state",
    mission: "ANAEROBIC (Zone 4/5 Push)\nBIOMETRIC MAP\nMHR: {{MHR}} BPM\nZ1: {{Z1_MIN}}-{{Z1_MAX}} BPM\nZ2: {{Z2_MIN}}-{{Z2_MAX}} BPM\nZ3: {{Z3_MIN}}-{{Z3_MAX}} BPM\nZ4: {{Z4_MIN}}-{{Z4_MAX}} BPM\nZ5: {{Z5_MIN}}-{{Z5_MAX}} BPM\nPRIMARY DIRECTIVE\nTarget: High-Intensity Interval Peaks ({{Z4_MIN}}-{{Z5_MAX}} BPM)\nInterval Floor: >{{Z4_MIN}} BPM\nSuccess: Completion of 3 targeted spikes with full recovery.\nPHASE PROTOCOLS (Iterative Loop)\nWARMUP: Transition to {{Z2_MIN}} BPM. Goal: Reach target within 5:00.\nMAIN_ACTIVE (Spike): Push HR > {{Z4_MIN}} BPM.\nRECOVERY (Valley): Drop HR < {{Z3_MAX}} BPM.\nADHERENCE LOGIC\nRating: 'Good' if user breaches the {{Z4_MIN}} floor during the Spike phases and successfully drops below the {{Z2_MAX}} ceiling during the Valley phases.\nSAFETY & RECOVERY\nRecovery Ceiling: {{Z2_MAX}} BPM (Ensure aerobic baseline is restored before next interval).\nRedline: {{MHR}} BPM.\nAlert: Warning - Absolute maximum heart rate reached. Abort interval and immediately drop to Zone 1."
  }
];
