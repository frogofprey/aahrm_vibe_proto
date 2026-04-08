import { useCallback, useRef, useEffect, useState } from 'react';
import { ConnectionStatus, HeartRateData } from '../types';
import { HR_MIN_VALID, HR_MAX_VALID, MAX_DATA_POINTS } from '../constants';

interface UseWebSocketProps {
  wsUrl: string;
  deviceIdHex: string;
  addLog: (msg: string) => void;
  onHeartRate: (hr: number, rawMsg: string) => void;
  showRawTelemetry: boolean;
}

export function useWebSocket({
  wsUrl,
  deviceIdHex,
  addLog,
  onHeartRate,
  showRawTelemetry
}: UseWebSocketProps) {
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [error, setError] = useState<string | null>(null);
  const [currentHR, setCurrentHR] = useState<number | null>(null);
  const [dataPoints, setDataPoints] = useState<HeartRateData[]>([]);
  const [hrTrend, setHrTrend] = useState<string>("Stable");
  
  const wsRef = useRef<WebSocket | null>(null);
  const hrHistoryRef = useRef<{ hr: number; timestamp: number }[]>([]);
  const smoothedHRRef = useRef<number | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close();
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        const fullDeviceId = `connect:${deviceIdHex}`;
        addLog(`SYSTEM: Handshake confirmed: ${fullDeviceId}`);
        setStatus(ConnectionStatus.CONNECTED);
        ws.send(fullDeviceId);
      };

      ws.onmessage = (event) => {
        const rawMsg = event.data.toString();
        try {
          const rawData = JSON.parse(rawMsg);
          const rawHR = rawData.hr !== undefined ? rawData.hr : (rawData.data?.hr);
          const numericHR = typeof rawHR === 'number' ? rawHR : Number(rawHR);
          
          if (!isNaN(numericHR) && numericHR >= HR_MIN_VALID && numericHR <= HR_MAX_VALID) {
            
            onHeartRate(numericHR, rawMsg);

            if (showRawTelemetry) {
              addLog(`TELEMETRY: ${numericHR} BPM | RAW: ${rawMsg}`);
            }
            
            setCurrentHR(numericHR);

            // --- HR Trend Calculation ---
            const nowMs = Date.now();
            const smoothedHR = 0.7 * numericHR + 0.3 * (smoothedHRRef.current ?? numericHR);
            smoothedHRRef.current = smoothedHR;
            
            hrHistoryRef.current.push({ hr: smoothedHR, timestamp: nowMs });
            hrHistoryRef.current = hrHistoryRef.current.filter(p => nowMs - p.timestamp <= 10000);
            
            if (hrHistoryRef.current.length > 1) {
                const oldest = hrHistoryRef.current[0];
                const newest = hrHistoryRef.current[hrHistoryRef.current.length - 1];
                const diff = newest.hr - oldest.hr;
                
                let trend = "Stable";
                if (diff > 10) trend = "Fast Increase";
                else if (diff > 4) trend = "Increase";
                else if (diff < -10) trend = "Fast Decrease";
                else if (diff < -4) trend = "Decrease";
                
                setHrTrend(trend);
            }

            setDataPoints((prev) => {
              const newData: HeartRateData = {
                hr: numericHR,
                timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                isAiRequest: false // This will be updated by the caller if needed
              };
              const updated = [...prev, newData];
              return updated.length > MAX_DATA_POINTS ? updated.slice(updated.length - MAX_DATA_POINTS) : updated;
            });

          } else {
            addLog(`UPLINK: ${rawMsg}`);
          }
        } catch (e) {
          addLog(`UPLINK: ${rawMsg}`);
        }
      };

      ws.onclose = () => {
        addLog(`SYSTEM: Connection severed.`);
        setStatus(ConnectionStatus.DISCONNECTED);
      };
      
      ws.onerror = () => {
        addLog(`ERROR: WebSocket transport failure.`);
        setStatus(ConnectionStatus.ERROR);
        setError(`Uplink failure at ${wsUrl}`);
      };
    } catch (e) {
      setStatus(ConnectionStatus.ERROR);
      setError('Initialization error.');
    }
  }, [wsUrl, deviceIdHex, addLog, onHeartRate, showRawTelemetry]);

  useEffect(() => {
    connect();
    return () => { if (wsRef.current) wsRef.current.close(); };
  }, [connect]);

  const resetData = useCallback(() => {
    setDataPoints([]);
    setCurrentHR(null);
    setHrTrend("Stable");
    hrHistoryRef.current = [];
    smoothedHRRef.current = null;
  }, []);

  return { status, error, currentHR, dataPoints, hrTrend, connect, resetData };
}
