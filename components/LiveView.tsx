import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Ghost, StepForward, History, Clock } from 'lucide-react';
import { Session, Student } from '../types';
import { storageService } from '../services/storageService';

interface LiveViewProps {
  currentSession: Session;
  students: Student[];
  onSessionUpdate: (session: Session) => void;
}

export const LiveView: React.FC<LiveViewProps> = ({ currentSession, students, onSessionUpdate }) => {
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  // Alphabetical sort
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  useEffect(() => {
    if (activeStudentId) {
      if (!lastTickRef.current) lastTickRef.current = Date.now();

      timerRef.current = window.setInterval(() => {
        const currentTime = Date.now();
        const diff = currentTime - (lastTickRef.current || currentTime);

        if (diff >= 1000) {
            const secondsPassed = Math.floor(diff / 1000);
            const remainder = diff % 1000;
            const currentResult = currentSession.results[activeStudentId] || { total: 0, passages: [] };
            const currentPassages = currentResult.passages || [];
            
            let newPassages = [...currentPassages];
            if (newPassages.length === 0) newPassages = [0];
            newPassages[newPassages.length - 1] += secondsPassed;

            onSessionUpdate({
              ...currentSession,
              results: {
                ...currentSession.results,
                [activeStudentId]: {
                  total: (currentResult.total || 0) + secondsPassed,
                  passages: newPassages
                }
              }
            });
            lastTickRef.current = currentTime - remainder;
        }
      }, 250);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      lastTickRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [activeStudentId, currentSession, onSessionUpdate]);

  const toggleTimer = (id: string) => {
    if (activeStudentId === id) {
      setActiveStudentId(null);
    } else {
      setActiveStudentId(id);
    }
  };

  const startNewPassage = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); 
    const result = currentSession.results[id] || { total: 0, passages: [] };
    const currentPassages = result.passages || (result.total > 0 ? [result.total] : [0]);
    onSessionUpdate({
      ...currentSession,
      results: {
        ...currentSession.results,
        [id]: { ...result, passages: [...currentPassages, 0] }
      }
    });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full animate-in bg-slate-50">
      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <div className="max-w-2xl mx-auto space-y-2">
          {sortedStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-300">
              <Ghost size={40} className="mb-4 opacity-20" />
              <p className="text-sm font-medium">Aucun élève enregistré</p>
            </div>
          ) : (
            sortedStudents.map((student) => {
              const result = currentSession.results[student.id];
              const isActive = activeStudentId === student.id;
              const passages = result?.passages || (result?.total ? [result.total] : []);
              const hasData = passages.length > 0;
              const currentPassageTime = passages[Math.max(0, passages.length - 1)] || 0;

              return (
                <div
                  key={student.id}
                  className={`bg-white p-2 rounded-xl border transition-all duration-200 flex items-center justify-between gap-3 ${
                    isActive ? 'border-indigo-500 shadow-md scale-[1.01]' : 'border-slate-200'
                  }`}
                >
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                     <div className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-[10px] ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {hasData ? passages.length : '-'}
                     </div>
                     <div className="overflow-hidden">
                         <h3 className={`font-bold text-sm truncate ${isActive ? 'text-indigo-900' : 'text-slate-700'}`}>
                           {student.name}
                         </h3>
                         <div className="flex items-center gap-2 text-[9px] text-slate-400 font-bold">
                            <Clock size={10} />
                            <span>TOTAL: {formatTime(result?.total || 0)}</span>
                         </div>
                     </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className={`font-mono text-xl font-black w-20 text-right tabular-nums ${isActive ? 'text-indigo-600' : 'text-slate-300'}`}>
                      {formatTime(currentPassageTime)}
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => startNewPassage(e, student.id)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center bg-slate-50 text-slate-400 hover:text-indigo-600 transition-colors"
                        >
                          <StepForward size={14} />
                        </button>
                        <button
                          onClick={() => toggleTimer(student.id)}
                          className={`h-10 w-10 rounded-full flex items-center justify-center shadow-sm transition-all ${
                            isActive ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
                          }`}
                        >
                          {isActive ? <Pause size={14} fill="currentColor" /> : <Play size={14} className="ml-0.5" fill="currentColor" />}
                        </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};