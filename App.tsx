import React, { useState, useEffect } from 'react';
import { Layout } from './components/Layout';
import { LiveView } from './components/LiveView';
import { DashboardView } from './components/DashboardView';
import { HistoryView } from './components/HistoryView';
import { StudentsView } from './components/StudentsView';
import { Session, Student, ViewType } from './types';
import { storageService } from './services/storageService';

const App: React.FC = () => {
  const [view, setView] = useState<ViewType>('live');
  const [students, setStudents] = useState<Student[]>([]);
  const [todaySession, setTodaySession] = useState<Session>({
    id: new Date().toISOString().split('T')[0],
    date: new Date().toISOString(),
    results: {}
  });

  // Initialization
  useEffect(() => {
    const init = async () => {
      // Load Students
      const loadedStudents = await storageService.getStudents();
      setStudents(loadedStudents);

      // Load Today's Session
      const todayId = new Date().toISOString().split('T')[0];
      const existing = await storageService.getSession(todayId);
      if (existing) {
        setTodaySession(existing);
      } else {
        // Create if not exists
        const newSession = {
          id: todayId,
          date: new Date().toISOString(),
          results: {}
        };
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
    // If we are editing the CURRENT day's session in history, update state too
    // This is handled automatically if the History component updates the store,
    // but the state needs to reflect here for the Live view.
  };

  return (
    <Layout currentView={view} onViewChange={setView}>
      {view === 'live' && (
        <LiveView 
          currentSession={todaySession} 
          students={students}
          onSessionUpdate={handleSessionUpdate}
        />
      )}
      {view === 'dashboard' && (
        <DashboardView students={students} />
      )}
      {view === 'history' && (
        <HistoryView 
          students={students} 
          onSessionUpdate={(s) => {
            // If the updated session is today's session, update the live state
            if (s.id === todaySession.id) {
              setTodaySession(s);
            }
          }}
        />
      )}
      {view === 'students' && (
        <StudentsView 
          students={students}
          onStudentsChange={handleStudentsChange}
        />
      )}
    </Layout>
  );
};

export default App;