import { Session, Student } from '../types';

const STORAGE_KEYS = {
  STUDENTS: 'chrono_track_students',
  SESSIONS: 'chrono_track_sessions',
};

// Helper to simulate async behavior like a real DB
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const storageService = {
  async getStudents(): Promise<Student[]> {
    await delay(100);
    const data = localStorage.getItem(STORAGE_KEYS.STUDENTS);
    return data ? JSON.parse(data) : [];
  },

  async addStudent(name: string): Promise<Student> {
    await delay(100);
    const students = await this.getStudents();
    const newStudent: Student = {
      id: crypto.randomUUID(),
      name,
      createdAt: new Date().toISOString(),
    };
    students.push(newStudent);
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(students));
    return newStudent;
  },

  async deleteStudent(id: string): Promise<void> {
    await delay(100);
    const students = await this.getStudents();
    const filtered = students.filter(s => s.id !== id);
    localStorage.setItem(STORAGE_KEYS.STUDENTS, JSON.stringify(filtered));
  },

  async getSession(id: string): Promise<Session | null> {
    await delay(50);
    const sessions = await this.getAllSessions();
    return sessions.find(s => s.id === id) || null;
  },

  async getAllSessions(): Promise<Session[]> {
    const data = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    return data ? JSON.parse(data) : [];
  },

  async saveSession(session: Session): Promise<void> {
    // await delay(50); // Minimal delay for autosave responsiveness
    const sessions = await this.getAllSessions();
    const index = sessions.findIndex(s => s.id === session.id);
    
    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }
    
    localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(sessions));
  },

  async getSessionsByDatePrefix(prefix: string): Promise<Session[]> {
    await delay(100);
    const sessions = await this.getAllSessions();
    return sessions.filter(s => s.id.startsWith(prefix));
  },

  async getSessionsAfterDate(isoDate: string): Promise<Session[]> {
    await delay(100);
    const sessions = await this.getAllSessions();
    return sessions.filter(s => s.date >= isoDate);
  }
};