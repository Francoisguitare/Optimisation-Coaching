import React, { useState, useEffect, useRef } from 'react';
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
      <div className="bg-white border-b border-gray-100 p-4 grid grid-cols-2 md:grid-cols-3 gap-4 shadow-sm z-10 sticky top-0">
        <div className="text-center border-r border-gray-100">
          <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Total Session</p>
          <p className="text-2xl font-bold text-indigo-600 font-mono mt-1">{formatTime(totalSessionTime)}</p>
        </div>
        <div className="text-center md:border-r border-gray-100">
          <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Moyenne</p>
          <p className="text-2xl font-bold text-gray-700 font-mono mt-1">{formatTime(averageTime)}</p>
        </div>
        <div className="hidden md:block text-center">
          <p className="text-xs text-gray-400 uppercase font-bold tracking-wider">Date</p>
          <p className="text-sm font-medium text-gray-600 mt-2">
            {now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      {/* Main List */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
        <div className="max-w-3xl mx-auto space-y-3">
          {students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Ghost size={48} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">Aucun élève dans la classe</p>
              <p className="text-sm">Ajoutez des élèves dans l'onglet "Élèves"</p>
            </div>
          ) : (
            students.map((student) => {
              const result = currentSession.results[student.id];
              const isActive = activeStudentId === student.id;
              
              // Default to 0 if no result exists
              const passages = result?.passages || (result?.total ? [result.total] : []);
              const hasData = passages.length > 0;
              
              const currentPassageIndex = Math.max(0, passages.length - 1);
              const currentPassageTime = passages[currentPassageIndex] || 0;
              const totalTime = result?.total || 0;

              return (
                <div
                  key={student.id}
                  className={`bg-white p-4 rounded-xl shadow-sm border transition-all duration-300 ${
                    isActive ? 'border-indigo-400 shadow-indigo-100 ring-1 ring-indigo-50 scale-[1.02]' : 'border-gray-200 hover:border-indigo-200'
                  } flex flex-col sm:flex-row items-center justify-between gap-4 group`}
                >
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0 w-full sm:w-auto flex items-center gap-3">
                     <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                        {hasData ? passages.length : '-'}
                     </div>
                     <div className="flex-1">
                         <h3 className={`font-bold text-lg truncate ${isActive ? 'text-indigo-900' : 'text-gray-700'}`}>
                           {student.name}
                         </h3>
                         <div className="flex items-center gap-2 text-xs text-gray-400 font-medium">
                            <History size={12} />
                            <span>Total: {formatTime(totalTime)}</span>
                            {passages.length > 1 && (
                                <span>• Dernier: {formatTime(passages[currentPassageIndex - 1] || 0)}</span>
                            )}
                         </div>
                     </div>
                  </div>

                  {/* Right: Controls & Timer */}
                  <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                    
                    {/* Timer Display */}
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Passage {hasData ? passages.length : 1}</span>
                        <div className={`font-mono text-3xl font-bold w-28 text-right tabular-nums ${isActive ? 'text-indigo-600' : 'text-gray-400'}`}>
                          {formatTime(currentPassageTime)}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {/* New Passage Button */}
                        <button
                          onClick={(e) => startNewPassage(e, student.id)}
                          className="h-10 w-10 rounded-lg flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 transition-all active:scale-95"
                          title="Nouveau Passage (sauvegarder et redémarrer)"
                        >
                          <StepForward size={18} />
                        </button>

                        {/* Play/Pause */}
                        <button
                          onClick={() => toggleTimer(student.id)}
                          className={`h-12 w-12 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                            isActive 
                              ? 'bg-indigo-600 text-white ring-indigo-300' 
                              : 'bg-white text-gray-700 hover:bg-gray-50 ring-gray-200 border border-gray-100'
                          }`}
                        >
                          {isActive ? <Pause className="fill-current" size={20} /> : <Play className="fill-current ml-1" size={20} />}
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
      <div className="bg-white border-t border-gray-200 p-4 shadow-lg z-20">
        <div className="max-w-3xl mx-auto flex justify-between items-center text-sm text-gray-500 font-medium">
          <span>{students.length} élèves dans la classe</span>
          <span>{participatingStudentIds.length} actifs aujourd'hui</span>
        </div>
      </div>

    </div>
  );
};