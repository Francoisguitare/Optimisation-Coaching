import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { LiveView } from './components/LiveView';
import { DashboardView } from './components/DashboardView';
import { HistoryView } from './components/HistoryView';
import { StudentsView } from './components/StudentsView';
import { Session, Student, ViewType } from './types';
import { storageService } from './services/storageService';

const App: React.FC = () => {
  const [view, setView] = useState<ViewType>('dashboard');
  const [students, setStudents] = useState<Student[]>([]);
  const [todaySession, setTodaySession] = useState<Session>({
    id: new Date().toISOString().split('T')[0],
    date: new Date().toISOString(),
    results: {}
  });

  useEffect(() => {
    const init = async () => {
      const loadedStudents = await storageService.getStudents();
      setStudents(loadedStudents);
      const todayId = new Date().toISOString().split('T')[0];
      const existing = await storageService.getSession(todayId);
      if (existing) {
        setTodaySession(existing);
      } else {
        const newSession = { id: todayId, date: new Date().toISOString(), results: {} };
        await storageService.saveSession(newSession);
        setTodaySession(newSession);
      }
    };
    init();
  }, []);

  const handleStudentsChange = async () => {
    const updated = await storageService.getStudents();
    setStudents(updated);
  };

  const handleSessionUpdate = (updated: Session) => {
    setTodaySession(updated);
  };

  return (
    <Layout currentView={view} onViewChange={setView}>
      {view === 'live' && (
        <LiveView currentSession={todaySession} students={students} onSessionUpdate={handleSessionUpdate} />
      )}
      {view === 'dashboard' && (
        <DashboardView students={students} />
      )}
      {view === 'history' && (
        <HistoryView students={students} onSessionUpdate={(s) => { if (s.id === todaySession.id) setTodaySession(s); }} />
      )}
      {view === 'students' && (
        <StudentsView students={students} onStudentsChange={handleStudentsChange} />
      )}
    </Layout>
  );
};

export default App;