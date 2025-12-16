import React, { useState, useEffect, useMemo } from 'react';
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
  const [newPassageValues, setNewPassageValues] = useState<Record<string, {m: string, s: string}>>({});
  
  // Sort students alphabetically
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

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
      <div className="p-3 border-b border-gray-200 bg-gray-50">
        <div className="flex flex-col md:flex-row justify-between items-center gap-3 mb-3 max-w-4xl mx-auto w-full">
          <div>
            <h2 className="font-bold text-base text-gray-800">Historique</h2>
          </div>
          <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
            <Calendar size={14} className="text-gray-400 ml-2" />
            <input 
              type="date" 
              className="p-1 text-xs outline-none text-gray-700"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </div>

        {/* Session Tabs */}
        <div className="max-w-4xl mx-auto w-full flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {sessions.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setSelectedSessionId(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap border ${
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
            className="px-2 py-1.5 rounded-full text-xs font-bold text-indigo-400 hover:bg-indigo-50 border border-dashed border-indigo-300 transition whitespace-nowrap flex items-center"
            title="Nouvelle Session"
          >
            <PlusCircle size={14} />
          </button>
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-y-auto p-2 bg-gray-50/50">
        <div className="max-w-3xl mx-auto">
          {loading ? (
            <div className="text-center py-10 text-gray-400 text-sm">Chargement...</div>
          ) : !currentSession ? (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl">
              <p className="text-gray-500 mb-4 text-sm">Aucune session pour cette date.</p>
              <Button size="sm" onClick={createNewSession}>Créer</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedStudents.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">Aucun élève enregistré.</div>
              ) : (
                sortedStudents.map(student => {
                  const result = currentSession.results[student.id];
                  const passages = getPassages(result);
                  const inputs = newPassageValues[student.id] || { m: '', s: '' };

                  return (
                    <div key={student.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 min-h-[50px]">
                      
                      {/* Left: Info & List */}
                      <div className="flex-1 w-full sm:w-auto">
                          <div className="flex items-center gap-2 mb-1.5">
                             <div className="font-bold text-sm text-gray-800">
                                {student.name}
                             </div>
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {passages.length === 0 && <span className="text-xs text-gray-400 italic">Aucun temps</span>}
                            {passages.map((p, idx) => (
                               <div key={idx} className="group relative bg-gray-50 text-gray-700 px-2 py-0.5 rounded-md font-mono text-xs font-medium flex items-center border border-gray-100 hover:border-red-200 transition-all cursor-default">
                                   {formatTime(p)}
                                   <button 
                                     onClick={() => handleDeletePassage(student.id, idx)}
                                     className="absolute -top-1.5 -right-1.5 bg-white text-red-500 rounded-full border border-gray-200 shadow-sm p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50"
                                     title="Supprimer"
                                   >
                                      <X size={8} />
                                   </button>
                               </div>
                            ))}
                            {passages.length > 0 && result && (
                                <div className="flex items-center gap-1 ml-1 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">
                                    <Clock size={10} />
                                    <span className="font-mono text-[10px] font-bold">{formatTime(result.total)}</span>
                                </div>
                            )}
                          </div>
                      </div>

                      {/* Right: Inputs */}
                      <div className="flex items-end gap-1.5 w-full sm:w-auto justify-end">
                         <div className="flex flex-col items-center">
                            <label className="text-[8px] text-gray-300 font-bold uppercase tracking-wider mb-0.5">Min</label>
                            <input 
                                type="number" 
                                min="0" 
                                className="w-10 h-8 border border-gray-200 rounded-md text-center font-bold text-sm text-gray-700 focus:ring-2 focus:ring-indigo-300 outline-none transition-all placeholder-gray-200"
                                placeholder="0"
                                value={inputs.m}
                                onChange={(e) => handleInputChange(student.id, 'm', e.target.value)}
                            />
                         </div>
                         <div className="h-8 flex items-center pb-0.5 text-gray-300 font-bold">:</div>
                         <div className="flex flex-col items-center">
                            <label className="text-[8px] text-gray-300 font-bold uppercase tracking-wider mb-0.5">Sec</label>
                            <input 
                                type="number" 
                                min="0" 
                                max="59" 
                                className="w-10 h-8 border border-gray-200 rounded-md text-center font-bold text-sm text-gray-700 focus:ring-2 focus:ring-indigo-300 outline-none transition-all placeholder-gray-200"
                                placeholder="0"
                                value={inputs.s}
                                onChange={(e) => handleInputChange(student.id, 's', e.target.value)}
                            />
                         </div>
                         <button 
                            onClick={() => handleAddPassage(student.id)}
                            className="h-8 w-8 bg-indigo-400 hover:bg-indigo-500 text-white rounded-md flex items-center justify-center transition-colors shadow-sm ml-1"
                            title="Sauvegarder"
                            disabled={(!inputs.m && !inputs.s) || (inputs.m === '0' && inputs.s === '0')}
                         >
                            <Save size={16} />
                         </button>
                         <button 
                            onClick={() => handleClearStudent(student.id)}
                            className="h-8 w-8 text-gray-300 hover:text-red-400 flex items-center justify-center transition-colors ml-0.5"
                            title="Effacer"
                         >
                            <Trash2 size={16} />
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