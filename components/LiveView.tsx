import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Plus, Ghost, StepForward, History } from 'lucide-react';
import { Session, Student } from '../types';
import { storageService } from '../services/storageService';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

interface LiveViewProps {
  currentSession: Session;
  students: Student[];
  onSessionUpdate: (session: Session) => void;
}

export const LiveView: React.FC<LiveViewProps> = ({ currentSession, students, onSessionUpdate }) => {
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempSelectedStudents, setTempSelectedStudents] = useState<Set<string>>(new Set());
  const timerRef = useRef<number | null>(null);
  const [now, setNow] = useState(new Date());

  // Clock for the header
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Timer Logic
  useEffect(() => {
    if (activeStudentId) {
      timerRef.current = window.setInterval(() => {
        const currentResult = currentSession.results[activeStudentId];
        const currentPassages = currentResult?.passages || [];
        
        // Ensure there is at least one passage to increment
        let newPassages = [...currentPassages];
        if (newPassages.length === 0) {
            // If migrating from old data format (only total), treat current total as first passage
            // OR start fresh. Let's start fresh logic for safety, but try to respect total.
            // Better: if total > 0 but passages empty, push total.
            if ((currentResult?.total || 0) > 0) {
                newPassages = [currentResult.total];
            } else {
                newPassages = [0];
            }
        }

        // Increment the last passage
        newPassages[newPassages.length - 1] = newPassages[newPassages.length - 1] + 1;

        onSessionUpdate({
          ...currentSession,
          results: {
            ...currentSession.results,
            [activeStudentId]: {
              total: (currentResult?.total || 0) + 1,
              passages: newPassages
            }
          }
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
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
    // Determine if we need to initialize passages for this student
    const result = currentSession.results[id];
    if (!result || !result.passages || result.passages.length === 0) {
       // Initialize structure if needed immediately
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
    } else {
      setActiveStudentId(id);
    }
  };

  const startNewPassage = (e: React.MouseEvent, id: string) => {
    e.stopPropagation(); // Prevent toggling the timer
    
    const result = currentSession.results[id];
    if (!result) return;

    const currentPassages = result.passages || (result.total > 0 ? [result.total] : [0]);
    
    // Only add a new passage if the current one has some time, otherwise just reset the 0?
    // User wants "record a 2nd one".
    
    onSessionUpdate({
      ...currentSession,
      results: {
        ...currentSession.results,
        [id]: {
          ...result,
          passages: [...currentPassages, 0] // Add a new 0-second passage at the end
        }
      }
    });
    
    // If not active, make it active to start timing immediately? 
    // Or just prep it. Let's keep the current active state. 
    // If it was running, it keeps running on the new passage.
  };

  const handleOpenModal = () => {
    const currentIds = Object.keys(currentSession.results);
    setTempSelectedStudents(new Set(currentIds));
    setIsModalOpen(true);
  };

  const toggleStudentSelection = (id: string) => {
    const next = new Set(tempSelectedStudents);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTempSelectedStudents(next);
  };

  const confirmStudentSelection = () => {
    const newResults = { ...currentSession.results };
    
    tempSelectedStudents.forEach(id => {
      if (!newResults[id]) newResults[id] = { total: 0, passages: [0] };
    });

    Object.keys(newResults).forEach(id => {
      if (!tempSelectedStudents.has(id) && newResults[id].total === 0) {
        delete newResults[id];
      }
    });

    onSessionUpdate({ ...currentSession, results: newResults });
    setIsModalOpen(false);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const activeParticipantIds = Object.keys(currentSession.results);
  const totalSessionTime = activeParticipantIds.reduce((acc, id) => acc + (currentSession.results[id]?.total || 0), 0);
  const averageTime = activeParticipantIds.length ? Math.floor(totalSessionTime / activeParticipantIds.length) : 0;

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
          {activeParticipantIds.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Ghost size={48} className="mb-4 opacity-20" />
              <p className="text-lg font-medium">Aucun participant actif</p>
              <p className="text-sm">Cliquez sur "Sélectionner" pour commencer</p>
            </div>
          ) : (
            activeParticipantIds.map((id) => {
              const student = students.find((s) => s.id === id);
              if (!student) return null;
              
              const result = currentSession.results[id];
              const isActive = activeStudentId === id;
              const passages = result.passages || (result.total > 0 ? [result.total] : [0]);
              const currentPassageIndex = passages.length - 1;
              const currentPassageTime = passages[currentPassageIndex];
              const totalTime = result.total;

              return (
                <div
                  key={id}
                  className={`bg-white p-4 rounded-xl shadow-sm border transition-all duration-300 ${
                    isActive ? 'border-indigo-400 shadow-indigo-100 ring-1 ring-indigo-50 scale-[1.02]' : 'border-gray-200 hover:border-indigo-200'
                  } flex flex-col sm:flex-row items-center justify-between gap-4 group`}
                >
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0 w-full sm:w-auto flex items-center gap-3">
                     <div className={`h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors ${isActive ? 'bg-indigo-600 text-white' : 'bg-indigo-50 text-indigo-600'}`}>
                        {passages.length}
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
                        <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Passage {passages.length}</span>
                        <div className={`font-mono text-3xl font-bold w-28 text-right tabular-nums ${isActive ? 'text-indigo-600' : 'text-gray-400'}`}>
                          {formatTime(currentPassageTime)}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                        {/* New Passage Button */}
                        <button
                          onClick={(e) => startNewPassage(e, id)}
                          className="h-10 w-10 rounded-lg flex items-center justify-center bg-gray-50 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 transition-all active:scale-95"
                          title="Nouveau Passage (sauvegarder et redémarrer)"
                        >
                          <StepForward size={18} />
                        </button>

                        {/* Play/Pause */}
                        <button
                          onClick={() => toggleTimer(id)}
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

      {/* Footer Controls */}
      <div className="bg-white border-t border-gray-200 p-4 shadow-lg z-20">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <div className="text-sm text-gray-500 font-medium">
            <span className="text-indigo-600 font-bold">{activeParticipantIds.length}</span> participants
          </div>
          <Button onClick={handleOpenModal} className="rounded-full shadow-indigo-200 shadow-lg">
            <Plus size={18} className="mr-2" />
            Sélectionner
          </Button>
        </div>
      </div>

      {/* Selection Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Gérer les participants">
        <div className="space-y-2 mb-6">
          {students.length === 0 ? (
            <p className="text-center text-gray-500 py-4">Aucun élève enregistré.</p>
          ) : (
            students.map(student => {
              const isSelected = tempSelectedStudents.has(student.id);
              return (
                <label 
                  key={student.id} 
                  className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    className="h-5 w-5 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                    checked={isSelected}
                    onChange={() => toggleStudentSelection(student.id)}
                  />
                  <span className={`font-medium ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>
                    {student.name}
                  </span>
                </label>
              );
            })
          )}
        </div>
        <div className="pt-4 border-t border-gray-100">
          <Button onClick={confirmStudentSelection} className="w-full py-3 text-lg">
            Valider la sélection
          </Button>
        </div>
      </Modal>
    </div>
  );
};