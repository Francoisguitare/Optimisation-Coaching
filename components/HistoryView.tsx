import React, { useState, useEffect } from 'react';
import { Session, Student } from '../types';
import { storageService } from '../services/storageService';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';
import { Calendar, Save, Trash2, PlusCircle, Check } from 'lucide-react';

interface HistoryViewProps {
  students: Student[];
  onSessionUpdate: (session: Session) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ students, onSessionUpdate }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Edit State
  const [editValues, setEditValues] = useState<Record<string, {m: string, s: string}>>({});
  const [justSaved, setJustSaved] = useState<Record<string, boolean>>({});

  // Add student modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [tempSelected, setTempSelected] = useState<Set<string>>(new Set());

  const loadSessionsForDate = async (date: string) => {
    setLoading(true);
    const loaded = await storageService.getSessionsByDatePrefix(date);
    setSessions(loaded);
    if (loaded.length > 0) {
        // If current selection is not in list, select first
        if (!selectedSessionId || !loaded.find(s => s.id === selectedSessionId)) {
            setSelectedSessionId(loaded[0].id);
        }
    } else {
        setSelectedSessionId(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadSessionsForDate(selectedDate);
  }, [selectedDate]);

  const currentSession = sessions.find(s => s.id === selectedSessionId);

  // Sync edit values when session changes
  useEffect(() => {
    if (currentSession) {
      const vals: Record<string, {m: string, s: string}> = {};
      Object.entries(currentSession.results).forEach(([id, res]) => {
        const m = Math.floor(res.total / 60);
        const s = res.total % 60;
        vals[id] = { m: m.toString(), s: s.toString() };
      });
      setEditValues(vals);
    }
  }, [currentSession]);

  const createNewSession = async () => {
    // Unique ID: Date + timestamp
    const id = `${selectedDate}_${Date.now()}`;
    const newSession: Session = {
      id,
      date: new Date().toISOString(),
      results: {}
    };
    await storageService.saveSession(newSession);
    await loadSessionsForDate(selectedDate);
    setSelectedSessionId(id);
  };

  const handleSaveRow = async (studentId: string) => {
    if (!currentSession) return;
    const vals = editValues[studentId];
    if (!vals) return;

    const m = parseInt(vals.m) || 0;
    const s = parseInt(vals.s) || 0;
    const total = (m * 60) + s;

    const updatedSession = {
      ...currentSession,
      results: {
        ...currentSession.results,
        [studentId]: { total }
      }
    };

    await storageService.saveSession(updatedSession);
    onSessionUpdate(updatedSession); // Notify parent if it's the live session being edited
    
    // UI Feedback
    setJustSaved(prev => ({ ...prev, [studentId]: true }));
    setTimeout(() => setJustSaved(prev => ({ ...prev, [studentId]: false })), 1500);
    
    // Refresh local list just in case
    const updatedSessions = sessions.map(s => s.id === updatedSession.id ? updatedSession : s);
    setSessions(updatedSessions);
  };

  const handleDeleteRow = async (studentId: string) => {
    if (!currentSession || !window.confirm("Retirer cet élève de la session ?")) return;
    
    const newResults = { ...currentSession.results };
    delete newResults[studentId];
    
    const updatedSession = { ...currentSession, results: newResults };
    await storageService.saveSession(updatedSession);
    onSessionUpdate(updatedSession);
    
    const updatedSessions = sessions.map(s => s.id === updatedSession.id ? updatedSession : s);
    setSessions(updatedSessions);
  };

  const openAddModal = () => {
    setTempSelected(new Set(Object.keys(currentSession?.results || {})));
    setIsAddModalOpen(true);
  };

  const confirmAddStudents = async () => {
    if (!currentSession) return;
    
    const newResults = { ...currentSession.results };
    tempSelected.forEach(id => {
      if (!newResults[id]) newResults[id] = { total: 0 };
    });

    const updatedSession = { ...currentSession, results: newResults };
    await storageService.saveSession(updatedSession);
    onSessionUpdate(updatedSession);
    
    const updatedSessions = sessions.map(s => s.id === updatedSession.id ? updatedSession : s);
    setSessions(updatedSessions);
    setIsAddModalOpen(false);
  };

  const handleInputChange = (studentId: string, field: 'm' | 's', value: string) => {
    setEditValues(prev => ({
      ...prev,
      [studentId]: { ...prev[studentId], [field]: value }
    }));
  };

  return (
    <div className="flex flex-col h-full bg-white animate-in fade-in duration-300">
      {/* Header Controls */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4 max-w-4xl mx-auto w-full">
          <div>
            <h2 className="font-bold text-lg text-gray-800">Historique & Corrections</h2>
            <p className="text-xs text-gray-500">Ajoutez ou modifiez des sessions passées.</p>
          </div>
          <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
            <Calendar size={16} className="text-gray-400 ml-2" />
            <input 
              type="date" 
              className="p-1 text-sm outline-none text-gray-700"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </div>

        {/* Session Tabs */}
        <div className="max-w-4xl mx-auto w-full flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {sessions.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setSelectedSessionId(s.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition whitespace-nowrap border ${
                selectedSessionId === s.id 
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s.id === selectedDate ? "Session Principale" : `Session ${idx + 1}`}
            </button>
          ))}
          <button 
            onClick={createNewSession}
            className="px-3 py-2 rounded-full text-sm font-bold text-indigo-600 hover:bg-indigo-50 border border-dashed border-indigo-300 transition whitespace-nowrap flex items-center"
            title="Nouvelle Session"
          >
            <PlusCircle size={16} />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-white">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="text-center py-10 text-gray-400">Chargement...</div>
          ) : !currentSession ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
              <p className="text-gray-500 mb-4">Aucune session pour cette date.</p>
              <Button onClick={createNewSession}>Créer une session</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.keys(currentSession.results).length === 0 ? (
                <div className="text-center py-8 text-gray-400">Cette session est vide.</div>
              ) : (
                Object.keys(currentSession.results).map(studentId => {
                  const student = students.find(s => s.id === studentId);
                  if (!student || !editValues[studentId]) return null;

                  return (
                    <div key={studentId} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex-1 w-full sm:w-auto text-left">
                        <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider">Élève</label>
                        <div className="font-bold text-lg text-gray-800">{student.name}</div>
                      </div>
                      
                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="flex items-end gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                          <div>
                            <label className="text-[10px] text-gray-400 uppercase block text-center">Min</label>
                            <input 
                              type="number" 
                              min="0"
                              className="w-16 p-1 border border-gray-300 rounded text-center font-mono font-bold text-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              value={editValues[studentId].m}
                              onChange={(e) => handleInputChange(studentId, 'm', e.target.value)}
                            />
                          </div>
                          <span className="mb-2 font-bold text-gray-400">:</span>
                          <div>
                            <label className="text-[10px] text-gray-400 uppercase block text-center">Sec</label>
                            <input 
                              type="number" 
                              min="0" max="59"
                              className="w-16 p-1 border border-gray-300 rounded text-center font-mono font-bold text-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                              value={editValues[studentId].s}
                              onChange={(e) => handleInputChange(studentId, 's', e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="flex gap-2">
                           <button 
                             onClick={() => handleSaveRow(studentId)}
                             className={`p-2.5 rounded-lg transition-all shadow-sm ${
                               justSaved[studentId] 
                                ? 'bg-green-500 text-white' 
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                             }`}
                           >
                             {justSaved[studentId] ? <Check size={18} /> : <Save size={18} />}
                           </button>
                           <button 
                             onClick={() => handleDeleteRow(studentId)}
                             className="p-2.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                           >
                             <Trash2 size={18} />
                           </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              
              <div className="pt-6 border-t border-gray-100 flex justify-end">
                <Button onClick={openAddModal} variant="ghost" className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">
                  <PlusCircle size={18} className="mr-2" />
                  Ajouter un élève
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Ajouter à la session">
         <div className="space-y-2 mb-6">
            {students.map(student => {
              const isSelected = tempSelected.has(student.id);
              const alreadyIn = currentSession?.results[student.id];
              return (
                <label 
                  key={student.id} 
                  className={`flex items-center space-x-3 p-3 rounded-lg border cursor-pointer ${
                    isSelected ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-100'
                  }`}
                >
                  <input 
                    type="checkbox" 
                    className="h-5 w-5 text-indigo-600 rounded"
                    checked={isSelected}
                    onChange={() => {
                       const next = new Set(tempSelected);
                       if(next.has(student.id)) next.delete(student.id);
                       else next.add(student.id);
                       setTempSelected(next);
                    }}
                  />
                  <span className="font-medium text-gray-700">{student.name}</span>
                  {alreadyIn && <span className="text-xs text-gray-400 ml-auto">(Déjà présent)</span>}
                </label>
              );
            })}
         </div>
         <Button onClick={confirmAddStudents} className="w-full">Confirmer l'ajout</Button>
      </Modal>
    </div>
  );
};