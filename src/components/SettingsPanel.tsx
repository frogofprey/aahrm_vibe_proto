import React from 'react';
import { TrainingObjective } from '../types';
import { Settings, User, Target, Volume2, Shield, Activity } from 'lucide-react';
import { PERSONA_CONFIG } from '../constants';
import { TRAINING_OBJECTIVES } from '../training_objectives';

interface SettingsPanelProps {
  age: number;
  setAge: (v: number) => void;
  weight: number;
  setWeight: (v: number) => void;
  gender: string;
  setGender: (v: string) => void;
  sessionDurationGoal: number;
  setSessionDurationGoal: (v: number) => void;
  intervalTime: number;
  setIntervalTime: (v: number) => void;
  intervalCountGoal: number;
  setIntervalCountGoal: (v: number) => void;
  selectedObjectiveId: string;
  setSelectedObjectiveId: (v: string) => void;
  selectedPersona: string;
  setSelectedPersona: (v: string) => void;
  isVoiceEnabled: boolean;
  setIsVoiceEnabled: (v: boolean) => void;
  isTelemetryAbstractionEnabled: boolean;
  setIsTelemetryAbstractionEnabled: (v: boolean) => void;
  isActivityVerbalizationEnabled: boolean;
  setIsActivityVerbalizationEnabled: (v: boolean) => void;
  selectedActivity: string;
  setSelectedActivity: (v: string) => void;
  customActivity: string;
  setCustomActivity: (v: string) => void;
  chattiness: number;
  setChattiness: (v: number) => void;
  deviceIdHex: string;
  setDeviceIdHex: (v: string) => void;
  wsUrl: string;
  setWsUrl: (v: string) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  age, setAge,
  weight, setWeight,
  gender, setGender,
  sessionDurationGoal, setSessionDurationGoal,
  intervalTime, setIntervalTime,
  intervalCountGoal, setIntervalCountGoal,
  selectedObjectiveId, setSelectedObjectiveId,
  selectedPersona, setSelectedPersona,
  isVoiceEnabled, setIsVoiceEnabled,
  isTelemetryAbstractionEnabled, setIsTelemetryAbstractionEnabled,
  isActivityVerbalizationEnabled, setIsActivityVerbalizationEnabled,
  selectedActivity, setSelectedActivity,
  customActivity, setCustomActivity,
  chattiness, setChattiness,
  deviceIdHex, setDeviceIdHex,
  wsUrl, setWsUrl
}) => {
  const currentObjective = TRAINING_OBJECTIVES.find((o: TrainingObjective) => o.id === selectedObjectiveId) || TRAINING_OBJECTIVES[0];
  const strategy = (currentObjective as any).transitionStrategy || "normal state";

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-8">
      <div className="flex items-center gap-2 mb-2">
        <Settings className="w-4 h-4 text-indigo-400" />
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Configuration</h2>
      </div>

      {/* Profile Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <User className="w-4 h-4" />
          <h3 className="text-sm font-bold uppercase tracking-tight">Biometric Profile</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Age</label>
            <input 
              type="number" 
              value={age} 
              onChange={(e) => setAge(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Weight (lbs)</label>
            <input 
              type="number" 
              value={weight} 
              onChange={(e) => setWeight(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Gender</label>
            <select 
              value={gender} 
              onChange={(e) => setGender(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            >
              <option>Male</option>
              <option>Female</option>
            </select>
          </div>
        </div>
      </section>

      {/* Mission Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Target className="w-4 h-4" />
          <h3 className="text-sm font-bold uppercase tracking-tight">Mission Objectives</h3>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Training Protocol</label>
            <select 
              value={selectedObjectiveId} 
              onChange={(e) => setSelectedObjectiveId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            >
              {TRAINING_OBJECTIVES.map((obj: TrainingObjective) => (
                <option key={obj.id} value={obj.id}>{obj.title}</option>
              ))}
            </select>
          </div>
          
          {strategy === "interval state" || strategy === "fixed interval state" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interval Time (m)</label>
                <input 
                  type="number" 
                  value={intervalTime} 
                  onChange={(e) => setIntervalTime(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Interval Count</label>
                <input 
                  type="number" 
                  value={intervalCountGoal} 
                  onChange={(e) => setIntervalCountGoal(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Target Duration (Minutes)</label>
              <input 
                type="number" 
                value={sessionDurationGoal} 
                onChange={(e) => setSessionDurationGoal(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
              />
            </div>
          )}
        </div>
      </section>

      {/* Activity Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Activity className="w-4 h-4" />
          <h3 className="text-sm font-bold uppercase tracking-tight">Activity Context</h3>
        </div>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-200">Verbalize Activity</span>
              <span className="text-[10px] text-slate-500">Allow AI to mention the specific activity</span>
            </div>
            <button 
              onClick={() => setIsActivityVerbalizationEnabled(!isActivityVerbalizationEnabled)}
              className={`w-10 h-5 rounded-full transition-colors relative ${isActivityVerbalizationEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isActivityVerbalizationEnabled ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          {!isActivityVerbalizationEnabled && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Activity</label>
                <select 
                  value={selectedActivity} 
                  onChange={(e) => setSelectedActivity(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                >
                  <option value="cycling">Cycling</option>
                  <option value="running">Running</option>
                  <option value="rowing">Rowing</option>
                  <option value="elliptical">Elliptical</option>
                  <option value="walking">Walking</option>
                  <option value="other">Other (Custom)</option>
                </select>
              </div>
              {selectedActivity === 'other' && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Custom Activity Name</label>
                  <input 
                    type="text" 
                    value={customActivity} 
                    onChange={(e) => setCustomActivity(e.target.value)}
                    placeholder="e.g. Shadow Boxing"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* AI Persona Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Volume2 className="w-4 h-4" />
          <h3 className="text-sm font-bold uppercase tracking-tight">AI Persona</h3>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Persona</label>
            <select 
              value={selectedPersona} 
              onChange={(e) => setSelectedPersona(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            >
              {Object.keys(PERSONA_CONFIG).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Chattiness Threshold</label>
              <span className="text-[10px] font-mono font-bold text-indigo-400">{chattiness}</span>
            </div>
            <input 
              type="range" 
              min="0" max="10" step="1" 
              value={chattiness} 
              onChange={(e) => setChattiness(Number(e.target.value))}
              className="w-full accent-indigo-500"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-200">Voice Synthesis</span>
              <span className="text-[10px] text-slate-500">Enable TTS for AI insights</span>
            </div>
            <button 
              onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
              className={`w-10 h-5 rounded-full transition-colors relative ${isVoiceEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isVoiceEnabled ? 'left-6' : 'left-1'}`} />
            </button>
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-200">Telemetry Abstraction</span>
              <span className="text-[10px] text-slate-500">Hide raw HR numbers from AI speech</span>
            </div>
            <button 
              onClick={() => setIsTelemetryAbstractionEnabled(!isTelemetryAbstractionEnabled)}
              className={`w-10 h-5 rounded-full transition-colors relative ${isTelemetryAbstractionEnabled ? 'bg-indigo-600' : 'bg-slate-700'}`}
            >
              <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${isTelemetryAbstractionEnabled ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
        </div>
      </section>

      {/* Uplink Section */}
      <section className="space-y-4">
        <div className="flex items-center gap-2 text-slate-300">
          <Shield className="w-4 h-4" />
          <h3 className="text-sm font-bold uppercase tracking-tight">Uplink Configuration</h3>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Device ID (HEX)</label>
            <input 
              type="text" 
              value={deviceIdHex} 
              onChange={(e) => setDeviceIdHex(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">WebSocket URL</label>
            <input 
              type="text" 
              value={wsUrl} 
              onChange={(e) => setWsUrl(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-slate-200 font-mono text-xs focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            />
          </div>
        </div>
      </section>
    </div>
  );
};
