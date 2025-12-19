import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- GLOBAL STATE ---
// On initialise directement l'objet global pour éviter "app is not defined"
window.appState = {
    view: 'live',
    students: [],
    sessions: [],
    currentSessionId: new Date().toISOString().split('T')[0],
    activeTimes: {},
    db: null,
    isFirebaseReady: false
};

// --- DATA RECOVERY ---
function recoverData() {
    console.log("🔍 Scanning for data...");
    
    // Utilisation de tableaux vides par défaut pour éviter les erreurs
    let students = [];
    let sessions = [];
    
    try {
        const storedStudents = localStorage.getItem('chrono_track_students');
        if (storedStudents) students = JSON.parse(storedStudents);
        
        const storedSessions = localStorage.getItem('chrono_track_sessions');
        if (storedSessions) sessions = JSON.parse(storedSessions);
    } catch (e) {
        console.error("Data parse error", e);
    }

    // Récupération Legacy
    try {
        const legStudents = localStorage.getItem('ct_students');
        if (legStudents) {
            const parsed = JSON.parse(legStudents);
            students = [...students, ...parsed];
        }
        
        const ancStudents = localStorage.getItem('students');
        if (ancStudents) {
            const parsed = JSON.parse(ancStudents);
            students = [...students, ...parsed];
        }
    } catch (e) { console.error("Legacy data error", e); }

    // Dédoublonnage
    const uniqueStudents = [];
    const seenNames = new Set();
    students.forEach(s => {
        if (s && s.name && !seenNames.has(s.name)) {
            seenNames.add(s.name);
            uniqueStudents.push(s);
        }
    });

    return { students: uniqueStudents, sessions: sessions };
}

// --- APP LOGIC ---
// Assignation directe à window.app
window.app = {
    async init() {
        const data = recoverData();
        window.appState.students = data.students;
        window.appState.sessions = data.sessions;
        
        // Initial Session Check
        let todaySession = window.appState.sessions.find(s => s.id === window.appState.currentSessionId);
        if (!todaySession) {
            todaySession = { id: window.appState.currentSessionId, date: new Date().toISOString(), results: {} };
            window.appState.sessions.push(todaySession);
            this.saveLocal();
        }

        // Firebase Init
        if (window.FIREBASE_CONFIG && window.FIREBASE_CONFIG.apiKey) {
            try {
                const fbApp = initializeApp(window.FIREBASE_CONFIG);
                window.appState.db = getFirestore(fbApp);
                window.appState.isFirebaseReady = true;
                this.updateSyncStatus('online');
                await this.syncFromFirebase();
            } catch (e) {
                console.error("Firebase Init Error:", e);
                this.updateSyncStatus('error');
            }
        } else {
            this.updateSyncStatus('offline');
        }

        // Render & Loop
        this.navigate('live');
        if (window.lucide) window.lucide.createIcons();
        
        setInterval(() => this.updateLiveUI(), 1000);
    },

    navigate(viewName) {
        window.appState.view = viewName;
        
        // Update Tabs
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const isActive = btn.id === `nav-${viewName}`;
            btn.className = isActive 
                ? "nav-btn active flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap bg-white text-indigo-600 shadow-sm"
                : "nav-btn flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all text-slate-500 hover:bg-white/50 whitespace-nowrap";
        });

        // Update Sections
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        const target = document.getElementById(`view-${viewName}`);
        if(target) target.classList.add('active');

        if (viewName === 'live') this.renderLive();
        if (viewName === 'students') this.renderStudents();
        if (viewName === 'history') this.renderHistory();
        if (viewName === 'stats') this.renderStats();
        
        if (window.lucide) window.lucide.createIcons();
    },

    saveLocal() {
        localStorage.setItem('chrono_track_students', JSON.stringify(window.appState.students));
        localStorage.setItem('chrono_track_sessions', JSON.stringify(window.appState.sessions));
        localStorage.setItem('ct_students', JSON.stringify(window.appState.students)); // Backup
        
        if (window.appState.isFirebaseReady) {
            this.saveToFirebase();
        }
    },

    async saveToFirebase() {
        if (!window.appState.db) return;
        this.updateSyncStatus('syncing');
        try {
            await setDoc(doc(window.appState.db, "data", "students"), { list: window.appState.students });
            await setDoc(doc(window.appState.db, "data", "sessions"), { list: window.appState.sessions });
            this.updateSyncStatus('online');
        } catch (e) {
            console.error(e);
            this.updateSyncStatus('error');
        }
    },

    async syncFromFirebase() {
        if (!window.appState.db) return;
        try {
            const snap = await getDoc(doc(window.appState.db, "data", "students"));
            if (snap.exists()) {
                const list = snap.data().list || [];
                if (list.length > window.appState.students.length) {
                    window.appState.students = list;
                    this.saveLocal();
                }
            }
        } catch (e) { console.error(e); }
    },

    updateSyncStatus(status) {
        const dot = document.getElementById('sync-status-dot');
        const text = document.getElementById('sync-status-text');
        if (!dot || !text) return;

        if (status === 'online') {
            dot.innerHTML = `<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>`;
            text.innerText = "ONLINE";
            text.className = "text-[10px] text-green-600 font-bold uppercase tracking-wider";
        } else if (status === 'syncing') {
            dot.innerHTML = `<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>`;
            text.innerText = "SAVING...";
            text.className = "text-[10px] text-blue-600 font-bold uppercase tracking-wider";
        } else if (status === 'error') {
            dot.innerHTML = `<span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>`;
            text.innerText = "ERROR";
            text.className = "text-[10px] text-red-500 font-bold uppercase tracking-wider";
        } else {
            dot.innerHTML = `<span class="relative inline-flex rounded-full h-2 w-2 bg-slate-400"></span>`;
            text.innerText = "LOCAL";
            text.className = "text-[10px] text-slate-400 font-bold uppercase tracking-wider";
        }
    },

    addStudent() {
        const input = document.getElementById('new-student-input');
        if (!input) return;
        const name = input.value.trim();
        if (!name) return;

        window.appState.students.push({
            id: 'st_' + Date.now(),
            name: name,
            createdAt: new Date().toISOString()
        });
        window.appState.students.sort((a,b) => a.name.localeCompare(b.name));
        input.value = '';
        this.saveLocal();
        this.renderStudents();
        this.renderLive();
    },

    deleteStudent(id) {
        if (!confirm("Supprimer ?")) return;
        window.appState.students = window.appState.students.filter(s => s.id !== id);
        this.saveLocal();
        this.renderStudents();
        this.renderLive();
    },

    toggleTimer(studentId) {
        if (window.appState.activeTimes[studentId]) {
            this.updateStudentSessionTime(studentId);
            delete window.appState.activeTimes[studentId];
        } else {
            window.appState.activeTimes[studentId] = Date.now();
        }
        this.renderLive();
    },

    stepPassage(studentId) {
        if (window.appState.activeTimes[studentId]) {
            this.updateStudentSessionTime(studentId);
            window.appState.activeTimes[studentId] = Date.now();
        }
        
        const session = window.appState.sessions.find(s => s.id === window.appState.currentSessionId);
        if(!session) return;
        
        const res = session.results[studentId] || { total: 0, passages: [] };
        const newPassages = res.passages ? [...res.passages, 0] : [res.total || 0, 0];
        
        session.results[studentId] = { ...res, passages: newPassages };
        this.saveLocal();
        this.renderLive();
    },

    updateStudentSessionTime(studentId) {
        if (!window.appState.activeTimes[studentId]) return;
        
        const now = Date.now();
        const start = window.appState.activeTimes[studentId];
        const elapsed = Math.floor((now - start) / 1000);
        
        if (elapsed > 0) {
            const session = window.appState.sessions.find(s => s.id === window.appState.currentSessionId);
            if(!session) return;
            
            const res = session.results[studentId] || { total: 0, passages: [0] };
            const newTotal = (res.total || 0) + elapsed;
            let passages = res.passages || [0];
            if (passages.length === 0) passages = [0];
            passages[passages.length - 1] += elapsed;

            session.results[studentId] = { total: newTotal, passages: passages };
            window.appState.activeTimes[studentId] = now;
            this.saveLocal();
        }
    },

    updateLiveUI() {
        if (window.appState.view !== 'live') return;
        
        Object.keys(window.appState.activeTimes).forEach(sid => {
            this.updateStudentSessionTime(sid);
            const el = document.getElementById(`time-${sid}`);
            if (el) {
                const s = window.appState.sessions.find(x => x.id === window.appState.currentSessionId);
                const res = s.results[sid];
                if (res) {
                    const pass = res.passages[res.passages.length - 1];
                    el.innerText = this.formatTime(pass);
                }
            }
        });
    },

    renderLive() {
        const container = document.getElementById('live-list');
        if (!container) return;

        const session = window.appState.sessions.find(s => s.id === window.appState.currentSessionId);
        
        if (window.appState.students.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-400">Aucun élève.</div>`;
            return;
        }

        container.innerHTML = window.appState.students.map(s => {
            const res = session.results[s.id] || { total: 0, passages: [0] };
            const isActive = !!window.appState.activeTimes[s.id];
            const currentPassage = res.passages ? res.passages[res.passages.length - 1] : 0;

            return `
            <div class="bg-white p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 ${isActive ? 'timer-active shadow-md' : 'border-slate-100'}">
                <div class="flex items-center gap-3 overflow-hidden flex-1">
                    <div class="h-10 w-10 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}">
                        ${res.passages ? res.passages.length : 1}
                    </div>
                    <div class="min-w-0">
                        <h4 class="font-bold text-sm truncate text-slate-800">${s.name}</h4>
                        <p class="text-[10px] font-bold text-slate-400 uppercase">Total: ${this.formatTime(res.total)}</p>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <div id="time-${s.id}" class="font-mono font-black text-xl tabular-nums w-16 text-right ${isActive ? 'text-indigo-600' : 'text-slate-300'}">
                        ${this.formatTime(currentPassage)}
                    </div>
                    <div class="flex gap-1">
                        <button onclick="window.app.stepPassage('${s.id}')" class="h-10 w-10 rounded-xl bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-indigo-100 transition-colors">
                            <i data-lucide="step-forward" class="w-4 h-4"></i>
                        </button>
                        <button onclick="window.app.toggleTimer('${s.id}')" class="timer-btn h-10 w-10 rounded-full border border-slate-200 flex items-center justify-center shadow-sm transition-all ${isActive ? '' : 'bg-white text-slate-600'}">
                            <i data-lucide="${isActive ? 'pause' : 'play'}" class="w-4 h-4 ml-0.5"></i>
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
        if (window.lucide) window.lucide.createIcons();
    },

    renderStudents() {
        const container = document.getElementById('students-list-container');
        if (!container) return;
        container.innerHTML = window.appState.students.map(s => `
            <div class="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <span class="font-bold text-slate-700">${s.name}</span>
                <button onclick="window.app.deleteStudent('${s.id}')" class="text-slate-300 hover:text-red-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
            </div>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
    },

    renderStats() {
        // Stats simplifiées pour éviter les erreurs de syntaxe
        let total = 0;
        let sessionsCount = window.appState.sessions.length;
        window.appState.sessions.forEach(sess => {
            Object.values(sess.results).forEach(r => total += (r.total || 0));
        });
        
        const elTotal = document.getElementById('stat-total-hours');
        if(elTotal) elTotal.innerText = Math.floor(total / 3600) + 'h';
        const elSess = document.getElementById('stat-total-sessions');
        if(elSess) elSess.innerText = sessionsCount;

        // Chart
        const ctx = document.getElementById('weeklyChart');
        if (ctx && window.Chart && !window.myChart) {
             window.myChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'],
                    datasets: [{ label: 'Activité', data: [0,0,0,0,0], backgroundColor: '#4f46e5', borderRadius: 5 }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    },

    renderHistory() {
        const container = document.getElementById('history-content');
        if(container) container.innerHTML = '<div class="text-center py-10 text-slate-300">Historique (WIP)</div>';
    },

    formatTime(s) {
        if (!s) return "00:00";
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return (m<10?"0"+m:m) + ":" + (sec<10?"0"+sec:sec);
    }
};

// Start
document.addEventListener('DOMContentLoaded', () => {
    window.app.init();
    const input = document.getElementById('new-student-input');
    if(input) input.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') window.app.addStudent();
    });
});
