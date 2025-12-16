import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Plus, Ghost } from 'lucide-react';
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
        onSessionUpdate({
          ...currentSession,
          results: {
            ...currentSession.results,
            [activeStudentId]: {
              total: (currentSession.results[activeStudentId]?.total || 0) + 1
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
    if (activeStudentId === id) {
      setActiveStudentId(null);
    } else {
      setActiveStudentId(id);
    }
  };

  const handleOpenModal = () => {
    // Pre-select currently active students in the modal
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
    
    // Add new ones
    tempSelectedStudents.forEach(id => {
      if (!newResults[id]) newResults[id] = { total: 0 };
    });

    // Remove unchecked ones ONLY if they have 0 time (to prevent accidental data loss)
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
              const isActive = activeStudentId === id;
              const time = currentSession.results[id].total;

              return (
                <div
                  key={id}
                  className={`bg-white p-4 rounded-xl shadow-sm border transition-all duration-300 ${
                    isActive ? 'border-red-400 shadow-red-100 ring-1 ring-red-50 scale-[1.02]' : 'border-gray-200 hover:border-indigo-200'
                  } flex items-center justify-between group`}
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <h3 className={`font-bold text-lg truncate ${isActive ? 'text-indigo-900' : 'text-gray-700'}`}>
                      {student.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`font-mono text-2xl font-bold w-24 text-right tabular-nums ${isActive ? 'text-red-600' : 'text-indigo-600'}`}>
                      {formatTime(time)}
                    </div>
                    <button
                      onClick={() => toggleTimer(id)}
                      className={`h-12 w-12 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                        isActive 
                          ? 'bg-red-500 text-white ring-red-300 animate-pulse' 
                          : 'bg-gray-100 text-gray-600 hover:bg-indigo-100 hover:text-indigo-600 ring-gray-200'
                      }`}
                    >
                      {isActive ? <Pause className="fill-current" size={20} /> : <Play className="fill-current ml-1" size={20} />}
                    </button>
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