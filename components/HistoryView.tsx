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
  const [inputs, setInputs] = useState<Record<string, {m: string, s: string}>>({});
  
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => a.name.localeCompare(b.name));
  }, [students]);

  const loadSessions = async (date: string) => {
    setLoading(true);
    const loaded = await storageService.getSessionsByDatePrefix(date);
    setSessions(loaded);
    if (loaded.length > 0 && !selectedSessionId) setSelectedSessionId(loaded[0].id);
    else if (loaded.length === 0) setSelectedSessionId(null);
    setLoading(false);
  };

  useEffect(() => { loadSessions(selectedDate); }, [selectedDate]);

  const currentSession = sessions.find(s => s.id === selectedSessionId);

  const handleAdd = async (studentId: string) => {
    if (!currentSession) return;
    const { m = '', s = '' } = inputs[studentId] || {};
    const duration = (parseInt(m) || 0) * 60 + (parseInt(s) || 0);
    if (duration === 0) return;

    const res = currentSession.results[studentId] || { total: 0, passages: [] };
    const passages = [...(res.passages || (res.total ? [res.total] : [])), duration];
    const total = passages.reduce((a, b) => a + b, 0);

    const updated = { ...currentSession, results: { ...currentSession.results, [studentId]: { total, passages } } };
    await storageService.saveSession(updated);
    onSessionUpdate(updated);
    setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
    setInputs(prev => ({ ...prev, [studentId]: { m: '', s: '' } }));
  };

  const formatTime = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-in">
      <div className="p-3 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
            <Calendar size={14} className="text-slate-400" />
            <input type="date" className="bg-transparent text-xs font-bold outline-none" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {sessions.map((s, i) => (
            <button key={s.id} onClick={() => setSelectedSessionId(s.id)} className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider border transition-all ${selectedSessionId === s.id ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200'}`}>
                Session {i + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 custom-scrollbar">
        <div className="max-w-2xl mx-auto space-y-2">
          {!currentSession ? (
            <div className="text-center py-20 text-slate-400 text-xs">Sélectionnez une date ou créez une session.</div>
          ) : sortedStudents.map(student => {
            const res = currentSession.results[student.id];
            const passages = res?.passages || (res?.total ? [res.total] : []);
            return (
              <div key={student.id} className="bg-white p-2 rounded-xl border border-slate-200 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-xs text-slate-700 truncate">{student.name}</h3>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {passages.map((p, idx) => (
                      <span key={idx} className="bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded text-[9px] font-mono border border-slate-100">{formatTime(p)}</span>
                    ))}
                    {passages.length > 0 && <span className="text-[9px] font-bold text-indigo-600 ml-1">Σ {formatTime(res?.total || 0)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input type="number" placeholder="M" className="w-8 h-8 text-center text-xs border border-slate-100 rounded bg-slate-50 outline-none" value={inputs[student.id]?.m || ''} onChange={e => setInputs(p => ({...p, [student.id]: {...(p[student.id]||{}), m: e.target.value}}))} />
                  <span className="text-slate-300">:</span>
                  <input type="number" placeholder="S" className="w-8 h-8 text-center text-xs border border-slate-100 rounded bg-slate-50 outline-none" value={inputs[student.id]?.s || ''} onChange={e => setInputs(p => ({...p, [student.id]: {...(p[student.id]||{}), s: e.target.value}}))} />
                  <button onClick={() => handleAdd(student.id)} className="ml-1 h-8 w-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center hover:bg-indigo-100"><Save size={14}/></button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};