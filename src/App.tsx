import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  ConnectionStatus, 
  SessionState, 
  MinuteSummary,
  TrainingObjective
} from './types';
import { 
  STORAGE_KEYS, 
  PERSONA_CONFIG,
  HR_MAX_VALID,
  HR_MIN_VALID,
  ZONES_TEMPLATE
} from './constants';
import { TRAINING_OBJECTIVES } from './training_objectives';
import { useAudio } from './hooks/useAudio';
import { useAi } from './hooks/useAI';
import { useWebSocket } from './hooks/useWebSocket';
import { useSession } from './hooks/useSession';
import { calculateMinuteSummary } from './lib/sessionUtils';
import { cleanInsightText } from './lib/utils';

// Components
import { DashboardHeader } from './components/DashboardHeader';
import { HeartRateDisplay } from './components/HeartRateDisplay';
import { HeartRateChart } from './components/HeartRateChart';
import { SessionControls } from './components/SessionControls';
import { MetricsGrid } from './components/MetricsGrid';
import { LogsPanel } from './components/LogsPanel';
import { SettingsPanel } from './components/SettingsPanel';

const App: React.FC = () => {
  // --- Persistent Settings State ---
  const [wsUrl, setWsUrl] = useState(() => localStorage.getItem(STORAGE_KEYS.WS) || 'ws://localhost:8080');
  const [deviceIdHex, setDeviceIdHex] = useState(() => localStorage.getItem(STORAGE_KEYS.HEX) || '00:00:00:00:00:00');
  const [age, setAge] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.AGE) || '30'));
  const [weight, setWeight] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.WEIGHT) || '150'));
  const [gender, setGender] = useState(() => localStorage.getItem(STORAGE_KEYS.GENDER) || 'Male');
  const [selectedObjectiveId, setSelectedObjectiveId] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.GOAL);
    return TRAINING_OBJECTIVES.some((o: TrainingObjective) => o.id === stored) ? stored! : TRAINING_OBJECTIVES[1].id;
  });
  const [sessionDurationGoal, setSessionDurationGoal] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.DURATION) || '20'));
  const [intervalTime, setIntervalTime] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.INTERVAL_TIME) || '3'));
  const [intervalCountGoal, setIntervalCountGoal] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.INTERVAL_COUNT_GOAL) || '3'));
  const [selectedPersona, setSelectedPersona] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEYS.PERSONA);
    return (stored && PERSONA_CONFIG[stored]) ? stored : 'Arlie';
  });
  const [chattiness, setChattiness] = useState(() => parseInt(localStorage.getItem(STORAGE_KEYS.CHATTINESS) || '4'));
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.VOICE) === 'true');
  const [isTelemetryAbstractionEnabled, setIsTelemetryAbstractionEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.ABSTRACTION) !== 'false');
  const [isActivityVerbalizationEnabled, setIsActivityVerbalizationEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.ACTIVITY_VERBALIZATION) !== 'false');
  const [selectedActivity, setSelectedActivity] = useState(() => localStorage.getItem(STORAGE_KEYS.SELECTED_ACTIVITY) || 'walking');
  const [customActivity, setCustomActivity] = useState(() => localStorage.getItem(STORAGE_KEYS.CUSTOM_ACTIVITY) || '');
  const [showSystemLogs, setShowSystemLogs] = useState(() => localStorage.getItem(STORAGE_KEYS.SHOW_SYS) !== 'false');

  // --- Derived State ---
  const currentObjective = useMemo(() => 
    TRAINING_OBJECTIVES.find((o: TrainingObjective) => o.id === selectedObjectiveId) || TRAINING_OBJECTIVES[1]
  , [selectedObjectiveId]);

  const zones = useMemo(() => {
    const mhr = 220 - age;
    return [
      { min: mhr * 0.5, max: mhr * 0.6, ...ZONES_TEMPLATE[0] },
      { min: mhr * 0.6, max: mhr * 0.7, ...ZONES_TEMPLATE[1] },
      { min: mhr * 0.7, max: mhr * 0.8, ...ZONES_TEMPLATE[2] },
      { min: mhr * 0.8, max: mhr * 0.9, ...ZONES_TEMPLATE[3] },
      { min: mhr * 0.9, max: Infinity, ...ZONES_TEMPLATE[4] },
    ];
  }, [age]);

  // --- Persistence Effect ---
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.WS, wsUrl);
    localStorage.setItem(STORAGE_KEYS.HEX, deviceIdHex);
    localStorage.setItem(STORAGE_KEYS.AGE, String(age));
    localStorage.setItem(STORAGE_KEYS.WEIGHT, String(weight));
    localStorage.setItem(STORAGE_KEYS.GENDER, gender);
    localStorage.setItem(STORAGE_KEYS.GOAL, selectedObjectiveId);
    localStorage.setItem(STORAGE_KEYS.DURATION, String(sessionDurationGoal));
    localStorage.setItem(STORAGE_KEYS.INTERVAL_TIME, String(intervalTime));
    localStorage.setItem(STORAGE_KEYS.INTERVAL_COUNT_GOAL, String(intervalCountGoal));
    localStorage.setItem(STORAGE_KEYS.PERSONA, selectedPersona);
    localStorage.setItem(STORAGE_KEYS.CHATTINESS, String(chattiness));
    localStorage.setItem(STORAGE_KEYS.VOICE, String(isVoiceEnabled));
    localStorage.setItem(STORAGE_KEYS.ABSTRACTION, String(isTelemetryAbstractionEnabled));
    localStorage.setItem(STORAGE_KEYS.ACTIVITY_VERBALIZATION, String(isActivityVerbalizationEnabled));
    localStorage.setItem(STORAGE_KEYS.SELECTED_ACTIVITY, selectedActivity);
    localStorage.setItem(STORAGE_KEYS.CUSTOM_ACTIVITY, customActivity);
    localStorage.setItem(STORAGE_KEYS.SHOW_SYS, String(showSystemLogs));
  }, [wsUrl, deviceIdHex, age, weight, gender, selectedObjectiveId, sessionDurationGoal, intervalTime, intervalCountGoal, selectedPersona, chattiness, isVoiceEnabled, isTelemetryAbstractionEnabled, isActivityVerbalizationEnabled, selectedActivity, customActivity, showSystemLogs]);

  // --- Logging ---
  const [logs, setLogs] = useState<{ id: number; message: string; timestamp: string }[]>([]);
  const logIdRef = useRef(0);
  const addLog = useCallback((message: string) => {
    setLogs((prev) => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const msStr = String(now.getMilliseconds()).padStart(3, '0');
      return [{ id: ++logIdRef.current, message, timestamp: `${timeStr}.${msStr}` }, ...prev].slice(0, 100);
    });
  }, []);

  // --- Hooks ---
  const { speakInsight, stopAudio, resumeAudioContext } = useAudio(isVoiceEnabled, selectedPersona, addLog);

  const ai = useAi({
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
  });

  const missionProfileRef = useRef<{ prompt: string; text: string; tokenUsage?: any } | null>(null);
  const narrativePlanRef = useRef<{ prompt: string; text: string; tokenUsage?: any } | null>(null);
  const sessionIntroRef = useRef<{ prompt: string; text: string; tokenUsage?: any } | null>(null);
  const midTermMemoryRef = useRef<{ text: string; prompt: string; tokenUsage?: any } | null>(null);
  const finalReportRef = useRef<{ text: string; prompt: string; tokenUsage?: any; reportText: string } | null>(null);

  const handleAiTrigger = useCallback(async () => {
    if (currentMinuteRef.current.length === 0) return;

    const summary = calculateMinuteSummary(
      currentMinuteRef.current,
      age,
      weight,
      gender,
      zones,
      currentSessionStateRef.current
    );
    currentMinuteRef.current = [];

    // Update Running Metrics
    runningMetricsRef.current.calories += summary.calories;
    runningMetricsRef.current.heartPoints += summary.heartPoints;
    runningMetricsRef.current.performanceMinutes += 1;
    
    const targetZoneIndices = currentObjective.targetZones.map((z: number) => z - 1);
    const isCompliant = targetZoneIndices.some((idx: number) => summary.avg >= zones[idx].min);
    if (isCompliant) runningMetricsRef.current.compliantMinutes += 1;

    // AI Analysis
    try {
      const insight = await ai.requestAiInsight(
        summary,
        allSessionSummariesRef.current,
        missionProfileRef.current?.text || "",
        narrativePlanRef.current?.text || "",
        sessionIntroRef.current?.text || "",
        midTermMemoryRef.current?.text || "",
        performanceDurationRef.current,
        activeDurationRef.current,
        runningMetricsRef.current,
        intervalCountRef.current,
        hrTrendRef.current
      );

      summary.insight = insight.insightData.persona_narrative;
      summary.coachingDirective = insight.insightData.coaching_directive;
      summary.saliencyScore = insight.insightData.saliency_score;
      summary.tokenUsage = insight.tokenUsage;
      summary.prompt = insight.prompt;
      summary.rawJson = insight.insightRaw;
      summary.isAnalyzing = false;

      // Update Mid-term memory
      const transitionHistory = sessionTransitionsRef.current.map(t => `[${t.timestamp}] ${t.message}`).join('\n');
      const memory = await ai.generateSessionSummary(
        [...allSessionSummariesRef.current, summary],
        midTermMemoryRef.current?.text || "",
        transitionHistory
      );
      if (memory) {
        midTermMemoryRef.current = memory;
        summary.sessionContextSummary = memory;
      }

      allSessionSummariesRef.current.push(summary);
      setSummaries(prev => [...prev, summary]);

    } catch (e) {
      addLog(`ERROR: AI Insight failed: ${e}`);
      summary.isAnalyzing = false;
      allSessionSummariesRef.current.push(summary);
      setSummaries(prev => [...prev, summary]);
    }
  }, [age, weight, gender, zones, currentObjective, ai, addLog]);

  const { 
    isSessionActive, 
    currentSessionState, 
    elapsedTime, 
    activeTime, 
    intervalCount, 
    summaries, 
    setSummaries,
    startSession: baseStartSession, 
    stopSession: baseStopSession, 
    downloadLogs,
    updateSessionState,
    performanceDurationRef,
    activeDurationRef,
    runningMetricsRef,
    allSessionSummariesRef,
    sessionTransitionsRef,
    currentMinuteRef,
    hasStartedActiveRef
  } = useSession({
    age,
    weight,
    gender,
    currentObjective,
    sessionDurationGoal,
    intervalTime,
    intervalCountGoal,
    zones,
    addLog,
    status: ConnectionStatus.DISCONNECTED, // Will be updated by useWebSocket
    deviceIdHex,
    selectedPersona,
    chattiness,
    isTelemetryAbstractionEnabled,
    showSystemLogs,
    onAiTrigger: handleAiTrigger
  });

  const currentSessionStateRef = useRef(currentSessionState);
  useEffect(() => { currentSessionStateRef.current = currentSessionState; }, [currentSessionState]);
  const intervalCountRef = useRef(intervalCount);
  useEffect(() => { intervalCountRef.current = intervalCount; }, [intervalCount]);

  const { status, currentHR, dataPoints, hrTrend, connect, resetData } = useWebSocket({
    wsUrl,
    deviceIdHex,
    addLog,
    onHeartRate: (hr) => {
        if (isSessionActive) {
            currentMinuteRef.current.push(hr);
            updateSessionState(hr, !!missionProfileRef.current);
        }
    },
    showRawTelemetry: false
  });

  const hrTrendRef = useRef(hrTrend);
  useEffect(() => { hrTrendRef.current = hrTrend; }, [hrTrend]);

  const startSession = useCallback(async () => {
    await resumeAudioContext();
    resetData();
    baseStartSession();
    
    missionProfileRef.current = null;
    narrativePlanRef.current = null;
    sessionIntroRef.current = null;
    midTermMemoryRef.current = null;
    finalReportRef.current = null;

    try {
      const profile = await ai.generateMissionProfile();
      missionProfileRef.current = { prompt: "Local Generation", text: profile };
      
      const plan = await ai.generateNarrativeMissionPlan(profile);
      narrativePlanRef.current = plan;
      
      const intro = await ai.generateIntroMessage(plan.text);
      sessionIntroRef.current = intro;
    } catch (e) {
      addLog(`ERROR: Session initialization failed: ${e}`);
    }
  }, [baseStartSession, resetData, resumeAudioContext, ai, addLog]);

  const stopSession = useCallback(async () => {
    baseStopSession();
    stopAudio();

    if (allSessionSummariesRef.current.length > 0) {
      try {
        const transitionHistory = sessionTransitionsRef.current.map(t => `[${t.timestamp}] ${t.message}`).join('\n');
        const report = await ai.generateFinalSessionReport(
          allSessionSummariesRef.current,
          elapsedTime,
          midTermMemoryRef.current?.text || "",
          missionProfileRef.current?.text || "",
          narrativePlanRef.current?.text || "",
          runningMetricsRef.current,
          transitionHistory,
          activeDurationRef.current,
          intervalCount
        );
        if (report) {
          finalReportRef.current = report;
          addLog(`FINAL_REPORT: ${report.reportText}`);
        }
      } catch (e) {
        addLog(`ERROR: Final report generation failed: ${e}`);
      }
    }
  }, [baseStopSession, stopAudio, ai, elapsedTime, intervalCount, addLog]);

  const handleDownload = useCallback(() => {
    downloadLogs(
      finalReportRef.current || undefined,
      missionProfileRef.current || undefined,
      narrativePlanRef.current || undefined,
      sessionIntroRef.current || undefined
    );
  }, [downloadLogs]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-8 font-sans selection:bg-indigo-500/30">
      <div className="max-w-7xl mx-auto">
        <DashboardHeader 
          status={status}
          currentSessionState={currentSessionState}
          elapsedTime={elapsedTime}
          activeTime={activeTime}
          isSessionActive={isSessionActive}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="md:col-span-1">
                <HeartRateDisplay currentHR={currentHR} hrTrend={hrTrend} />
              </div>
              <div className="md:col-span-2">
                <SessionControls 
                  isSessionActive={isSessionActive}
                  onStart={startSession}
                  onStop={stopSession}
                  onDownload={handleDownload}
                  onConnect={connect}
                />
                <MetricsGrid 
                  calories={runningMetricsRef.current.calories}
                  heartPoints={runningMetricsRef.current.heartPoints}
                  compliantMinutes={runningMetricsRef.current.compliantMinutes}
                  performanceMinutes={runningMetricsRef.current.performanceMinutes}
                  intervalCount={intervalCount}
                  intervalCountGoal={intervalCountGoal}
                  isIntervalStrategy={currentObjective.transitionStrategy?.includes('interval') || false}
                />
              </div>
            </div>

            <HeartRateChart dataPoints={dataPoints} zones={zones} />
            
            <LogsPanel 
              logs={logs} 
              showSystemLogs={showSystemLogs} 
              onToggleSystemLogs={() => setShowSystemLogs(!showSystemLogs)} 
            />
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4">
            <SettingsPanel 
              age={age} setAge={setAge}
              weight={weight} setWeight={setWeight}
              gender={gender} setGender={setGender}
              sessionDurationGoal={sessionDurationGoal} setSessionDurationGoal={setSessionDurationGoal}
              intervalTime={intervalTime} setIntervalTime={setIntervalTime}
              intervalCountGoal={intervalCountGoal} setIntervalCountGoal={setIntervalCountGoal}
              selectedObjectiveId={selectedObjectiveId} setSelectedObjectiveId={setSelectedObjectiveId}
              selectedPersona={selectedPersona} setSelectedPersona={setSelectedPersona}
              isVoiceEnabled={isVoiceEnabled} setIsVoiceEnabled={setIsVoiceEnabled}
              isTelemetryAbstractionEnabled={isTelemetryAbstractionEnabled} setIsTelemetryAbstractionEnabled={setIsTelemetryAbstractionEnabled}
              isActivityVerbalizationEnabled={isActivityVerbalizationEnabled} setIsActivityVerbalizationEnabled={setIsActivityVerbalizationEnabled}
              selectedActivity={selectedActivity} setSelectedActivity={setSelectedActivity}
              customActivity={customActivity} setCustomActivity={setCustomActivity}
              chattiness={chattiness} setChattiness={setChattiness}
              deviceIdHex={deviceIdHex} setDeviceIdHex={setDeviceIdHex}
              wsUrl={wsUrl} setWsUrl={setWsUrl}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
