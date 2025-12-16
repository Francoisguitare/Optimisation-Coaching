import React, { useState, useEffect } from 'react';
import { Session, Student, SessionResult } from '../types';
import { storageService } from '../services/storageService';
import { Button } from './ui/Button';
import { Calendar, Trash2, X, Clock, Save, PlusCircle } from 'lucide-react';

interface HistoryViewProps {
  students: Student[];
  onSessionUpdate: (session: Session) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({ students, onSessionUpdate }) => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Stores the "Add Passage" input values for each student row
  const [newPassageValues, setNewPassageValues] = useState<Record<string, {m: string, s: string}>>({});
  
  const loadSessionsForDate = async (date: string) => {
    setLoading(true);
    const loaded = await storageService.getSessionsByDatePrefix(date);
    setSessions(loaded);
    if (loaded.length > 0) {
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

  const getPassages = (res: SessionResult | undefined) => {
      if (!res) return [];
      if (res.passages && res.passages.length > 0) return res.passages;
      if (res.total > 0) return [res.total];
      return [];
  };

  const createNewSession = async () => {
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

  const handleAddPassage = async (studentId: string) => {
    if (!currentSession) return;
    const vals = newPassageValues[studentId];
    if (!vals) return;

    const m = parseInt(vals.m) || 0;
    const s = parseInt(vals.s) || 0;
    
    // Logic: Add new passage to list, then reset inputs to 0 for the next one
    const duration = (m * 60) + s;
    const currentResult = currentSession.results[studentId] || { total: 0, passages: [] };
    
    const currentPassages = getPassages(currentResult);
    const newPassages = [...currentPassages, duration];
    const newTotal = newPassages.reduce((a, b) => a + b, 0);

    const updatedSession = {
      ...currentSession,
      results: {
        ...currentSession.results,
        [studentId]: {
            total: newTotal,
            passages: newPassages
        }
      }
    };

    await saveAndUpdate(updatedSession);
    
    // RESET TO ZERO/EMPTY: Clear inputs immediately so user can type next value
    setNewPassageValues(prev => ({
        ...prev,
        [studentId]: { m: '', s: '' }
    }));
  };

  const handleDeletePassage = async (studentId: string, index: number) => {
    if (!currentSession) return;
    const currentResult = currentSession.results[studentId];
    if (!currentResult) return;

    const currentPassages = getPassages(currentResult);
    
    const newPassages = [...currentPassages];
    newPassages.splice(index, 1);
    const newTotal = newPassages.reduce((a, b) => a + b, 0);

    const updatedSession = {
      ...currentSession,
      results: {
        ...currentSession.results,
        [studentId]: {
            total: newTotal,
            passages: newPassages
        }
      }
    };
    
    await saveAndUpdate(updatedSession);
  };

  const handleClearStudent = async (studentId: string) => {
    if (!currentSession || !window.confirm("Effacer toutes les données de cet élève pour cette session ?")) return;
    
    const newResults = { ...currentSession.results };
    delete newResults[studentId];
    
    const updatedSession = { ...currentSession, results: newResults };
    await saveAndUpdate(updatedSession);
  };

  const saveAndUpdate = async (session: Session) => {
      await storageService.saveSession(session);
      onSessionUpdate(session);
      setSessions(prev => prev.map(s => s.id === session.id ? session : s));
  };

  const handleInputChange = (studentId: string, field: 'm' | 's', value: string) => {
    setNewPassageValues(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {m:'', s:''}), [field]: value }
    }));
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
                  ? 'bg-indigo-300 text-white border-indigo-300 shadow-md' 
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s.id === selectedDate ? "Session Principale" : `Session ${idx + 1}`}
            </button>
          ))}
          <button 
            onClick={createNewSession}
            className="px-3 py-2 rounded-full text-sm font-bold text-indigo-400 hover:bg-indigo-50 border border-dashed border-indigo-300 transition whitespace-nowrap flex items-center"
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
            <div className="space-y-6">
              {students.length === 0 ? (
                <div className="text-center py-8 text-gray-400">Aucun élève enregistré dans l'application.</div>
              ) : (
                students.map(student => {
                  const result = currentSession.results[student.id];
                  const passages = getPassages(result);
                  const inputs = newPassageValues[student.id] || { m: '', s: '' };

                  return (
                    <div key={student.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-6">
                      
                      {/* Left: Info & List */}
                      <div className="flex-1 w-full md:w-auto">
                          <div className="flex items-center gap-2 mb-2">
                             <div className="font-bold text-lg text-gray-800">
                                {student.name}
                             </div>
                             <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Élève</span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {passages.length === 0 && <span className="text-sm text-gray-400 italic">Aucun temps</span>}
                            {passages.map((p, idx) => (
                               <div key={idx} className="group relative bg-gray-50 text-gray-700 px-3 py-1 rounded-md font-mono text-sm font-medium flex items-center border border-gray-100 hover:border-red-200 transition-all cursor-default">
                                   {formatTime(p)}
                                   <button 
                                     onClick={() => handleDeletePassage(student.id, idx)}
                                     className="absolute -top-1.5 -right-1.5 bg-white text-red-500 rounded-full border border-gray-200 shadow-sm p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                                     title="Supprimer ce passage"
                                   >
                                      <X size={10} />
                                   </button>
                               </div>
                            ))}
                            {passages.length > 0 && result && (
                                <div className="flex items-center gap-1.5 ml-1 px-2 py-1 bg-indigo-50 text-indigo-700 rounded-md">
                                    <Clock size={12} />
                                    <span className="font-mono text-xs font-bold">{formatTime(result.total)}</span>
                                </div>
                            )}
                          </div>
                      </div>

                      {/* Right: Inputs */}
                      <div className="flex items-end gap-2 w-full md:w-auto justify-end">
                         <div className="flex flex-col items-center">
                            <label className="text-[10px] text-gray-300 font-bold uppercase tracking-wider mb-1">Min</label>
                            <input 
                                type="number" 
                                min="0" 
                                className="w-14 h-10 border border-gray-200 rounded-lg text-center font-bold text-gray-700 focus:ring-2 focus:ring-indigo-300 outline-none transition-all placeholder-gray-200"
                                placeholder="0"
                                value={inputs.m}
                                onChange={(e) => handleInputChange(student.id, 'm', e.target.value)}
                            />
                         </div>
                         <div className="h-10 flex items-center pb-1 text-gray-300 font-bold">:</div>
                         <div className="flex flex-col items-center">
                            <label className="text-[10px] text-gray-300 font-bold uppercase tracking-wider mb-1">Sec</label>
                            <input 
                                type="number" 
                                min="0" 
                                max="59" 
                                className="w-14 h-10 border border-gray-200 rounded-lg text-center font-bold text-gray-700 focus:ring-2 focus:ring-indigo-300 outline-none transition-all placeholder-gray-200"
                                placeholder="0"
                                value={inputs.s}
                                onChange={(e) => handleInputChange(student.id, 's', e.target.value)}
                            />
                         </div>
                         <button 
                            onClick={() => handleAddPassage(student.id)}
                            className="h-10 w-10 bg-indigo-400 hover:bg-indigo-500 text-white rounded-lg flex items-center justify-center transition-colors shadow-sm ml-1"
                            title="Sauvegarder et ajouter (Entrée)"
                            disabled={(!inputs.m && !inputs.s) || (inputs.m === '0' && inputs.s === '0')}
                         >
                            <Save size={20} />
                         </button>
                         <button 
                            onClick={() => handleClearStudent(student.id)}
                            className="h-10 w-10 text-gray-300 hover:text-red-400 flex items-center justify-center transition-colors ml-1"
                            title="Effacer les données de cet élève"
                         >
                            <Trash2 size={18} />
                         </button>
                      </div>

                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};