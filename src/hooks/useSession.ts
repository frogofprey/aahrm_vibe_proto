import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  SessionState, 
  TrainingObjective, 
  ZoneConfig, 
  MinuteSummary, 
  ConnectionStatus,
  TokenUsage,
  SessionContext
} from '../types';
import { formatDuration, formatMMSS } from '../lib/utils';
import { triggerDownload, generateSessionLogContent } from '../lib/sessionUtils';

interface UseSessionProps {
  age: number;
  weight: number;
  gender: string;
  currentObjective: TrainingObjective;
  sessionDurationGoal: number;
  intervalTime: number;
  intervalCountGoal: number;
  zones: ZoneConfig[];
  addLog: (msg: string) => void;
  status: ConnectionStatus;
  deviceIdHex: string;
  selectedPersona: string;
  chattiness: number;
  isTelemetryAbstractionEnabled: boolean;
  showSystemLogs: boolean;
  onAiTrigger: () => void;
}

export function useSession({
  age,
  weight,
  gender,
  currentObjective,
  sessionDurationGoal,
  intervalTime,
  intervalCountGoal,
  zones,
  addLog,
  status,
  deviceIdHex,
  selectedPersona,
  chattiness,
  isTelemetryAbstractionEnabled,
  showSystemLogs,
  onAiTrigger
}: UseSessionProps) {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [currentSessionState, setCurrentSessionState] = useState<SessionState>(SessionState.IDLE);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState("00:00:00");
  const [activeTime, setActiveTime] = useState("00:00");
  const [intervalCount, setIntervalCount] = useState(0);
  const [summaries, setSummaries] = useState<MinuteSummary[]>([]);

  const currentSessionStateRef = useRef(currentSessionState);
  const lastStateTransitionTimeRef = useRef<number>(Date.now());
  const performanceDurationRef = useRef(0);
  const activeDurationRef = useRef(0);
  const hasStartedActiveRef = useRef(false);
  const lastPerformanceTickRef = useRef<number>(0);
  const nextActiveTargetRef = useRef<number>(60000);
  const lastUpdateWallTimeRef = useRef<number>(0);
  const workerRef = useRef<Worker | null>(null);
  
  const runningMetricsRef = useRef({ heartPoints: 0, calories: 0, compliantMinutes: 0, performanceMinutes: 0 });
  const sessionTransitionsRef = useRef<{ timestamp: string; message: string }[]>([]);
  const allSessionSummariesRef = useRef<MinuteSummary[]>([]);
  const sessionStatesInFrameRef = useRef<Set<SessionState>>(new Set());
  const stateSamplesInFrameRef = useRef<Map<SessionState, number>>(new Map());
  const currentMinuteRef = useRef<number[]>([]);

  const transitionTimersRef = useRef<{ 
      warmupToMain: number | null; 
      mainToPause: number | null;
      pauseToMain: number | null;
      bonusToRecovery: number | null; 
  }>({ 
      warmupToMain: null, 
      mainToPause: null,
      pauseToMain: null,
      bonusToRecovery: null 
  });

  useEffect(() => { currentSessionStateRef.current = currentSessionState; }, [currentSessionState]);

  const transitionState = useCallback((newState: SessionState, reason: string) => {
    if (newState !== currentSessionStateRef.current) {
        const timestamp = new Date().toLocaleTimeString();
        const msg = `${currentSessionStateRef.current} -> ${newState} | Reason: ${reason}`;
        sessionTransitionsRef.current.push({ timestamp, message: msg });
        addLog(`STATE_CHANGE: ${msg}`);
        
        if (newState === SessionState.MAIN_ACTIVE && !hasStartedActiveRef.current) {
            hasStartedActiveRef.current = true;
            nextActiveTargetRef.current = 0;
            addLog(`SYSTEM: Active Timer Engaged.`);
        }

        const strategy = (currentObjective as any).transitionStrategy || "normal state";
        if (strategy === "interval state" || strategy === "fixed interval state") {
            if ((currentSessionStateRef.current === SessionState.MAIN_ACTIVE || currentSessionStateRef.current === SessionState.BONUS_ACTIVE) && newState === SessionState.RECOVERY) {
                setIntervalCount(prev => prev + 1);
                addLog(`SYSTEM: Interval ${intervalCount + 1} completed.`);
            }
        }

        currentSessionStateRef.current = newState;
        setCurrentSessionState(newState);
        lastStateTransitionTimeRef.current = Date.now();
    }
  }, [addLog, currentObjective, intervalCount]);

  const updateSessionState = useCallback((currentBPM: number | null, missionProfileLoaded: boolean) => {
      if (status === ConnectionStatus.ERROR) {
          transitionState(SessionState.ERROR, "System Connection Error");
          return;
      }
      if (!isSessionActive) {
          transitionState(SessionState.IDLE, "Session Deactivated");
          return;
      }
      const strategy = (currentObjective as any).transitionStrategy || "normal state";
      const isFixed = strategy.startsWith("fixed state");
      
      if (!missionProfileLoaded) {
          transitionState(SessionState.INIT, "Pending Mission Profile");
          return;
      }

      if (isFixed) {
          let targetState = SessionState.MAIN_ACTIVE;
          if (strategy.includes("MAIN_ACTIVE")) targetState = SessionState.MAIN_ACTIVE;
          if (sessionStartTime && (Date.now() - sessionStartTime) < 5000) {
              transitionState(SessionState.INIT, "Initial Buffer (Fixed Strategy)");
          } else {
              transitionState(targetState, "Fixed Strategy Protocol");
          }
          return;
      }

      if (strategy === "interval state") {
          const now = Date.now();
          const elapsedMs = now - (sessionStartTime || now);
          const elapsedMinutes = elapsedMs / 60000;
          
          let targetMinBPM = 999;
          if (currentObjective.targetZones.length > 0) {
              const minZoneIdx = Math.min(...currentObjective.targetZones);
              const zone = minZoneIdx > 0 ? zones[minZoneIdx - 1] : zones[0];
              if (zone) targetMinBPM = zone.min;
          }

          if (currentSessionState === SessionState.INIT || currentSessionState === SessionState.WARMUP) {
              const isWarmupComplete = elapsedMinutes >= 6.0 || (currentBPM || 0) >= targetMinBPM;
              if (isWarmupComplete) {
                  if (!transitionTimersRef.current.warmupToMain) {
                      transitionTimersRef.current.warmupToMain = now;
                  } else if (now - transitionTimersRef.current.warmupToMain > 5000) {
                      transitionState(SessionState.MAIN_ACTIVE, "Warmup targets met (Interval Strategy)");
                      transitionTimersRef.current.warmupToMain = null;
                  }
              } else {
                  transitionTimersRef.current.warmupToMain = null;
                  if (currentSessionState === SessionState.INIT && elapsedMinutes > 0.1) {
                      transitionState(SessionState.WARMUP, "Initialization complete");
                  }
              }
          } else if (currentSessionState === SessionState.MAIN_ACTIVE || currentSessionState === SessionState.BONUS_ACTIVE) {
              const isDrop = (currentBPM || 0) < targetMinBPM;
              if (isDrop) {
                  if (!transitionTimersRef.current.mainToPause) {
                      transitionTimersRef.current.mainToPause = now;
                  } else if (now - transitionTimersRef.current.mainToPause > 6000) {
                      transitionState(SessionState.RECOVERY, "HR below target (Interval Valley)");
                      transitionTimersRef.current.mainToPause = null;
                  }
              } else {
                  transitionTimersRef.current.mainToPause = null;
              }
          } else if (currentSessionState === SessionState.RECOVERY) {
              const isSpike = (currentBPM || 0) >= targetMinBPM;
              if (isSpike) {
                  if (!transitionTimersRef.current.pauseToMain) {
                      transitionTimersRef.current.pauseToMain = now;
                  } else if (now - transitionTimersRef.current.pauseToMain > 6000) {
                      const targetState = intervalCount < intervalCountGoal ? SessionState.MAIN_ACTIVE : SessionState.BONUS_ACTIVE;
                      const reason = intervalCount < intervalCountGoal ? "HR recovered to target (Interval Spike)" : "HR recovered to target (Bonus Interval Spike)";
                      transitionState(targetState, reason);
                      transitionTimersRef.current.pauseToMain = null;
                  }
              } else {
                  transitionTimersRef.current.pauseToMain = null;
              }
          }
          return;
      }

      if (strategy === "fixed interval state") {
          const now = Date.now();
          const elapsedMs = now - (sessionStartTime || now);
          const elapsedMinutes = elapsedMs / 60000;
          
          let targetMinBPM = 999;
          if (currentObjective.targetZones.length > 0) {
              const minZoneIdx = Math.min(...currentObjective.targetZones);
              const zone = minZoneIdx > 0 ? zones[minZoneIdx - 1] : zones[0];
              if (zone) targetMinBPM = zone.min;
          }

          if (currentSessionState === SessionState.INIT || currentSessionState === SessionState.WARMUP) {
              const isWarmupComplete = elapsedMinutes >= 6.0 || (currentBPM || 0) >= targetMinBPM;
              if (isWarmupComplete) {
                  if (!transitionTimersRef.current.warmupToMain) {
                      transitionTimersRef.current.warmupToMain = now;
                  } else if (now - transitionTimersRef.current.warmupToMain > 5000) {
                      transitionState(SessionState.MAIN_ACTIVE, "Warmup targets met (Fixed Interval Strategy)");
                      transitionTimersRef.current.warmupToMain = null;
                  }
              } else {
                  transitionTimersRef.current.warmupToMain = null;
                  if (currentSessionState === SessionState.INIT && elapsedMinutes > 0.1) {
                      transitionState(SessionState.WARMUP, "Initialization complete");
                  }
              }
          } else if (currentSessionState === SessionState.MAIN_ACTIVE || currentSessionState === SessionState.BONUS_ACTIVE) {
              const isDrop = (currentBPM || 0) < targetMinBPM;
              if (isDrop) {
                  if (!transitionTimersRef.current.mainToPause) {
                      transitionTimersRef.current.mainToPause = now;
                  } else if (now - transitionTimersRef.current.mainToPause > 6000) {
                      const stateLabel = currentSessionState === SessionState.MAIN_ACTIVE ? "Fixed Interval" : "Bonus Interval";
                      transitionState(SessionState.RECOVERY, `${stateLabel} HR below target (Interval Valley)`);
                      transitionTimersRef.current.mainToPause = null;
                  }
              } else {
                  transitionTimersRef.current.mainToPause = null;
              }
          } else if (currentSessionState === SessionState.RECOVERY) {
              const isSpike = (currentBPM || 0) >= targetMinBPM;
              if (isSpike) {
                  if (!transitionTimersRef.current.pauseToMain) {
                      transitionTimersRef.current.pauseToMain = now;
                  } else if (now - transitionTimersRef.current.pauseToMain > 6000) {
                      if (intervalCount < intervalCountGoal) {
                          transitionState(SessionState.MAIN_ACTIVE, `Fixed Recovery HR recovered to target (Interval Spike)`);
                      } else {
                          transitionState(SessionState.BONUS_ACTIVE, `Bonus Recovery HR recovered to target (Bonus Interval Spike)`);
                      }
                      transitionTimersRef.current.pauseToMain = null;
                  }
              } else {
                  transitionTimersRef.current.pauseToMain = null;
              }
          }
          return;
      }

      const now = Date.now();
      const elapsedMs = now - (sessionStartTime || now);
      const elapsedMinutes = elapsedMs / 60000;
      
      let targetMinBPM = 999;
      if (currentObjective.targetZones.length > 0) {
          const minZoneIdx = Math.min(...currentObjective.targetZones);
          const zone = minZoneIdx > 0 ? zones[minZoneIdx - 1] : zones[0];
          if (zone) targetMinBPM = zone.min;
      } else {
          targetMinBPM = zones[1].min;
      }

      const performanceMinutes = performanceDurationRef.current / 60000;
      const goalsMet = performanceMinutes >= sessionDurationGoal;
      const isWorkoutActive = !goalsMet || currentSessionState === SessionState.WARMUP || currentSessionState === SessionState.INIT;

      if (isWorkoutActive) {
          if (currentSessionState === SessionState.WARMUP || currentSessionState === SessionState.INIT) {
              const isWarmupComplete = elapsedMinutes >= 3.0 || (currentBPM || 0) >= targetMinBPM;
              if (isWarmupComplete) {
                   if (!transitionTimersRef.current.warmupToMain) {
                       transitionTimersRef.current.warmupToMain = now;
                   } else if (now - transitionTimersRef.current.warmupToMain > 5000) {
                       transitionState(SessionState.MAIN_ACTIVE, "Warmup targets met (Duration or HR)");
                       transitionTimersRef.current.warmupToMain = null;
                   }
              } else {
                   transitionTimersRef.current.warmupToMain = null;
                   if (currentSessionState !== SessionState.WARMUP && currentSessionState !== SessionState.INIT) {
                       transitionState(SessionState.WARMUP, "Conditions lost");
                   } else if (currentSessionState === SessionState.INIT && elapsedMinutes > 0.1) {
                       transitionState(SessionState.WARMUP, "Initialization complete");
                   }
              }
          }
          else if (currentSessionState === SessionState.MAIN_ACTIVE) {
              const isDrop = (currentBPM || 0) < targetMinBPM;
              if (isDrop) {
                  if (!transitionTimersRef.current.mainToPause) {
                      transitionTimersRef.current.mainToPause = now;
                  } else if (now - transitionTimersRef.current.mainToPause > 30000) {
                      transitionState(SessionState.PAUSE, "HR below target for 30s");
                      transitionTimersRef.current.mainToPause = null;
                  }
              } else {
                  transitionTimersRef.current.mainToPause = null;
              }
          }
          else if (currentSessionState === SessionState.PAUSE) {
              const isRecovery = (currentBPM || 0) >= targetMinBPM;
              if (isRecovery) {
                  if (!transitionTimersRef.current.pauseToMain) {
                      transitionTimersRef.current.pauseToMain = now;
                  } else if (now - transitionTimersRef.current.pauseToMain > 5000) {
                      transitionState(SessionState.MAIN_ACTIVE, "HR recovered to target");
                      transitionTimersRef.current.pauseToMain = null;
                  }
              } else {
                  transitionTimersRef.current.pauseToMain = null;
              }
          }
      } else {
          const isRecoveryCondition = (currentBPM || 0) < targetMinBPM;
          if (currentSessionState === SessionState.BONUS_ACTIVE || currentSessionState === SessionState.MAIN_ACTIVE || currentSessionState === SessionState.PAUSE) {
              if (isRecoveryCondition) {
                  if (!transitionTimersRef.current.bonusToRecovery) {
                      transitionTimersRef.current.bonusToRecovery = now;
                  } else if (now - transitionTimersRef.current.bonusToRecovery > 5000) {
                      transitionState(SessionState.RECOVERY, "Goals met, HR cooling down");
                      transitionTimersRef.current.bonusToRecovery = null;
                  }
              } else {
                  transitionTimersRef.current.bonusToRecovery = null;
                  if (currentSessionState !== SessionState.BONUS_ACTIVE) {
                      transitionState(SessionState.BONUS_ACTIVE, "Goals met, HR maintaining target");
                  }
              }
          } else {
               if (!isRecoveryCondition) {
                   transitionState(SessionState.BONUS_ACTIVE, "HR spiked above recovery ceiling");
                   transitionTimersRef.current.bonusToRecovery = null;
               } else {
                   transitionTimersRef.current.bonusToRecovery = null;
                   if (currentSessionState !== SessionState.RECOVERY) {
                       transitionState(SessionState.RECOVERY, "Recovery logic fallback");
                   }
               }
          }
      }
  }, [isSessionActive, status, currentObjective, sessionStartTime, zones, sessionDurationGoal, currentSessionState, transitionState, intervalCount, intervalCountGoal]);

  useEffect(() => {
    if (isSessionActive) {
        const workerCode = `
            let timer = null;
            self.onmessage = function(e) {
                if (e.data === 'start') {
                    if (timer) clearInterval(timer);
                    timer = setInterval(() => {
                        self.postMessage('tick');
                    }, 100);
                } else if (e.data === 'stop') {
                    if (timer) clearInterval(timer);
                    timer = null;
                }
            };
        `;
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        const workerUrl = URL.createObjectURL(blob);
        const worker = new Worker(workerUrl);
        workerRef.current = worker;

        lastPerformanceTickRef.current = Date.now();
        
        worker.onmessage = () => {
            const now = Date.now();
            const delta = now - lastPerformanceTickRef.current;
            lastPerformanceTickRef.current = now;
            
            if (currentSessionStateRef.current === SessionState.MAIN_ACTIVE || currentSessionStateRef.current === SessionState.BONUS_ACTIVE) {
                performanceDurationRef.current += delta;
            }
            if (hasStartedActiveRef.current && currentSessionStateRef.current !== SessionState.PAUSE) {
                activeDurationRef.current += delta;
            }

            let isAiTrigger = false;
            const timeSinceLastUpdate = now - lastUpdateWallTimeRef.current;
            const currentActiveTime = activeDurationRef.current;

            if (hasStartedActiveRef.current) {
                if (currentActiveTime >= nextActiveTargetRef.current) {
                    isAiTrigger = true;
                }
            } else {
                if (timeSinceLastUpdate >= 60000) {
                    isAiTrigger = true;
                }
            }

            if (isAiTrigger && timeSinceLastUpdate < 25000) {
                if (showSystemLogs) {
                    addLog(`DEBUG: AI Update suppressed (Cooldown: ${Math.round(timeSinceLastUpdate/1000)}s)`);
                }
                isAiTrigger = false;
            }

            if (isAiTrigger) {
                lastUpdateWallTimeRef.current = now;
                if (hasStartedActiveRef.current) {
                    nextActiveTargetRef.current = (Math.floor(currentActiveTime / 60000) + 1) * 60000;
                }
                onAiTrigger();
            }
        };

        worker.postMessage('start');

        return () => {
            worker.postMessage('stop');
            worker.terminate();
            URL.revokeObjectURL(workerUrl);
            workerRef.current = null;
        };
    }
  }, [isSessionActive, showSystemLogs, addLog, onAiTrigger]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isSessionActive && sessionStartTime) {
      interval = setInterval(() => {
        setElapsedTime(formatDuration(Date.now() - sessionStartTime));
        if (hasStartedActiveRef.current) {
            setActiveTime(formatMMSS(activeDurationRef.current));
        } else {
            setActiveTime("00:00");
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionActive, sessionStartTime]);

  const startSession = useCallback(() => {
    const now = Date.now();
    setIsSessionActive(true);
    currentMinuteRef.current = []; 
    allSessionSummariesRef.current = []; 
    sessionTransitionsRef.current = [];
    transitionState(SessionState.INIT, "User manually started session");
    setSessionStartTime(now);
    setElapsedTime("00:00:00");
    setActiveTime("00:00");
    setSummaries([]);
    setIntervalCount(0);
    runningMetricsRef.current = { heartPoints: 0, calories: 0, compliantMinutes: 0, performanceMinutes: 0 };
    performanceDurationRef.current = 0;
    activeDurationRef.current = 0;
    hasStartedActiveRef.current = false;
    lastUpdateWallTimeRef.current = now;
    nextActiveTargetRef.current = 60000;
    transitionTimersRef.current = { warmupToMain: null, bonusToRecovery: null, mainToPause: null, pauseToMain: null };
    sessionStatesInFrameRef.current.clear();
    sessionStatesInFrameRef.current.add(SessionState.INIT);
    stateSamplesInFrameRef.current.clear();
    stateSamplesInFrameRef.current.set(SessionState.INIT, 0);
    addLog("SESSION: Workout started. Timer active.");
  }, [addLog, transitionState]);

  const stopSession = useCallback(() => {
    setIsSessionActive(false);
    addLog(`SESSION: Workout stopped. Duration: ${elapsedTime}`);
    setSessionStartTime(null);
    setCurrentSessionState(SessionState.IDLE);
    transitionState(SessionState.IDLE, "User manually stopped session");
  }, [addLog, elapsedTime, transitionState]);

  const downloadLogs = useCallback((
    finalSessionReport?: { text: string; tokenUsage?: any; prompt: string },
    missionProfile?: { text: string; tokenUsage?: any; prompt: string },
    narrativeMissionPlan?: { text: string; tokenUsage?: any; prompt: string },
    sessionIntro?: { text: string; tokenUsage?: any; prompt: string }
  ) => {
    const { contentDebug, contentUser, filenameDebug, filenameUser } = generateSessionLogContent({
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
      runningMetrics: runningMetricsRef.current,
      allSessionSummaries: allSessionSummariesRef.current,
      sessionTransitions: sessionTransitionsRef.current,
      finalSessionReport,
      missionProfile,
      narrativeMissionPlan,
      sessionIntro
    });

    triggerDownload(filenameDebug, contentDebug);
    setTimeout(() => triggerDownload(filenameUser, contentUser), 200);
    addLog(`SYSTEM: Log files generated: ${filenameDebug} & ${filenameUser}`);
  }, [age, weight, gender, currentObjective, sessionDurationGoal, intervalCountGoal, intervalTime, intervalCount, deviceIdHex, selectedPersona, chattiness, isTelemetryAbstractionEnabled, addLog]);

  return {
    isSessionActive,
    currentSessionState,
    sessionStartTime,
    elapsedTime,
    activeTime,
    intervalCount,
    summaries,
    setSummaries,
    startSession,
    stopSession,
    downloadLogs,
    updateSessionState,
    performanceDurationRef,
    activeDurationRef,
    runningMetricsRef,
    allSessionSummariesRef,
    sessionTransitionsRef,
    currentMinuteRef,
    sessionStatesInFrameRef,
    stateSamplesInFrameRef,
    hasStartedActiveRef
  };
}
