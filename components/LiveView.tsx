import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Plus, Ghost, StepForward, History } from 'lucide-react';
import { Session, Student } from '../types';
import { storageService } from '../services/storageService';
import { Button } from './ui/Button';

interface LiveViewProps {
  currentSession: Session;
  students: Student[];
  onSessionUpdate: (session: Session) => void;
}

export const LiveView: React.FC<LiveViewProps> = ({ currentSession, students, onSessionUpdate }) => {
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  
  const timerRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const [now, setNow] = useState(new Date());

  // Clock for the header
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Sort students alphabetically
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  // Timer Logic - Robust against background throttling
  useEffect(() => {
    if (activeStudentId) {
      if (!lastTickRef.current) {
        lastTickRef.current = Date.now();
      }

      timerRef.current = window.setInterval(() => {
        const currentTime = Date.now();
        const diff = currentTime - (lastTickRef.current || currentTime);

        if (diff >= 1000) {
            const secondsPassed = Math.floor(diff / 1000);
            const remainder = diff % 1000;

            const currentResult = currentSession.results[activeStudentId];
            const currentPassages = currentResult?.passages || [];
            
            let newPassages = [...currentPassages];
            if (newPassages.length === 0) {
                if ((currentResult?.total || 0) > 0) {
                    newPassages = [currentResult.total];
                } else {
                    newPassages = [0];
                }
            }

            newPassages[newPassages.length - 1] = newPassages[newPassages.length - 1] + secondsPassed;

            onSessionUpdate({
              ...currentSession,
              results: {
                ...currentSession.results,
                [activeStudentId]: {
                  total: (currentResult?.total || 0) + secondsPassed,
                  passages: newPassages
                }
              }
            });

            lastTickRef.current = currentTime - remainder;
        }
      }, 200);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      lastTickRef.current = null;
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeStudentId, currentSession, onSessionUpdate]);

  // Persist frequently
  useEffect(() => {
    const save = async () => {
      await storageService.saveSession(currentSession);
    };
    const debounce = setTimeout(save, 5000);
    return () => clearTimeout(debounce);
  }, [currentSession]);

  const toggleTimer = (id: string) => {
    const result = currentSession.results[id];
    if (!result || !result.passages || result.passages.length === 0) {
       const initialTotal = result?.total || 0;
       const initialPassages = result?.passages || (initialTotal > 0 ? [initialTotal] : [0]);
       
       onSessionUpdate({
         ...currentSession,
         results: {
           ...currentSession.results,
           [id]: {
             total: initialTotal,
             passages: initialPassages
           }
         }
       });
    }

    if (activeStudentId === id) {
      setActiveStudentId(null);
      lastTickRef.current = null;
    } else {
      lastTickRef.current = Date.now();
      setActiveStudentId(id);
    }
  };

  const startNewPassage = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); 
    
    const result = currentSession.results[id];
    if (!result) return;

    const currentPassages = result.passages || (result.total > 0 ? [result.total] : [0]);
    
    onSessionUpdate({
      ...currentSession,
      results: {
        ...currentSession.results,
        [id]: {
          ...result,
          passages: [...currentPassages, 0] 
        }
      }
    });
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Calculate stats based on students who actually have data
  const participatingStudentIds = Object.keys(currentSession.results).filter(id => currentSession.results[id].total > 0);
  const totalSessionTime = participatingStudentIds.reduce((acc, id) => acc + (currentSession.results[id]?.total || 0), 0);
  const averageTime = participatingStudentIds.length ? Math.floor(totalSessionTime / participatingStudentIds.length) : 0;

  return (
    <div className="flex flex-col h-full animate-in fade-in duration-300">
      {/* Stats Header */}
      <div className="bg-white border-b border-gray-100 p-2 sm:p-3 grid grid-cols-2 md:grid-cols-3 gap-2 shadow-sm z-10 sticky top-0">
        <div className="text-center border-r border-gray-100">
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Total</p>
          <p className="text-xl font-bold text-indigo-600 font-mono">{formatTime(totalSessionTime)}</p>
        </div>
        <div className="text-center md:border-r border-gray-100">
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Moyenne</p>
          <p className="text-xl font-bold text-gray-700 font-mono">{formatTime(averageTime)}</p>
        </div>
        <div className="hidden md:block text-center">
          <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Date</p>
          <p className="text-xs font-medium text-gray-600">
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-2 bg-gray-50/50">
        <div className="max-w-3xl mx-auto space-y-2">
          {sortedStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Ghost size={48} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">Aucun élève dans la classe</p>
              <p className="text-sm">Ajoutez des élèves dans l'onglet "Élèves"</p>
            </div>
          ) : (
            sortedStudents.map((student) => {
              const result = currentSession.results[student.id];
              const isActive = activeStudentId === student.id;
              
              const passages = result?.passages || (result?.total ? [result.total] : []);
              const hasData = passages.length > 0;
              
              const currentPassageIndex = Math.max(0, passages.length - 1);
              const currentPassageTime = passages[currentPassageIndex] || 0;
              const totalTime = result?.total || 0;

              return (
                <div
                  key={student.id}
                  className={`bg-white p-2 rounded-lg shadow-sm border transition-all duration-300 ${
                    isActive ? 'border-indigo-400 shadow-indigo-100 ring-1 ring-indigo-50 scale-[1.01]' : 'border-gray-200 hover:border-indigo-200'
                  } flex flex-row items-center justify-between gap-3 group min-h-[60px]`}
                >
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                     <div className={`h-8 w-8 min-w-[2rem] rounded-full flex items-center justify-center font-bold text-xs transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                        {hasData ? passages.length : '-'}
                     </div>
                     <div className="flex-1 overflow-hidden">
                         <h3 className={`font-bold text-base truncate ${isActive ? 'text-indigo-900' : 'text-gray-700'}`}>
                           {student.name}
                         </h3>
                         <div className="flex items-center gap-2 text-[10px] text-gray-400 font-medium">
                            <History size={10} />
                            <span>Total: {formatTime(totalTime)}</span>
                            {passages.length > 1 && (
                                <span className="hidden sm:inline">• Dernier: {formatTime(passages[currentPassageIndex - 1] || 0)}</span>
                            )}
                         </div>
                     </div>
                  </div>

                  {/* Right: Controls & Timer */}
                  <div className="flex items-center gap-2 sm:gap-4">
                    
                    {/* Timer Display */}
                    <div className="flex flex-col items-end">
                        <span className="text-[9px] uppercase font-bold text-gray-400 tracking-wider">Passage {hasData ? passages.length : 1}</span>
                        <div className={`font-mono text-xl sm:text-2xl font-bold w-20 sm:w-24 text-right tabular-nums ${isActive ? 'text-indigo-600' : 'text-gray-400'}`}>
                          {formatTime(currentPassageTime)}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5">
                        {/* New Passage Button */}
                        <button
                          onClick={(e) => startNewPassage(e, student.id)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 transition-all active:scale-95"
                          title="Nouveau Passage"
                        >
                          <StepForward size={16} />
                        </button>

                        {/* Play/Pause */}
                        <button
                          onClick={() => toggleTimer(student.id)}
                          className={`h-9 w-9 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                            isActive 
                              ? 'bg-indigo-600 text-white ring-indigo-300' 
                              : 'bg-white text-gray-700 hover:bg-gray-50 ring-gray-200 border border-gray-100'
                          }`}
                        >
                          {isActive ? <Pause className="fill-current" size={16} /> : <Play className="fill-current ml-0.5" size={16} />}
                        </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      
      {/* Simple Footer */}
      <div className="bg-white border-t border-gray-200 p-3 shadow-lg z-20">
        <div className="max-w-3xl mx-auto flex justify-between items-center text-xs text-gray-500 font-medium">
          <span>{sortedStudents.length} élèves</span>
          <span>{participatingStudentIds.length} actifs</span>
        </div>
      </div>

    </div>
  );
};