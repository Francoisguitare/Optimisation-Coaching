import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- GLOBAL STATE ---
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
    let students = [];
    let sessions = [];
    
    try {
        const storedStudents = localStorage.getItem('chrono_track_students');
        if (storedStudents) students = JSON.parse(storedStudents);
        
        const storedSessions = localStorage.getItem('chrono_track_sessions');
        if (storedSessions) sessions = JSON.parse(storedSessions);
    } catch (e) { console.error("Data parse error", e); }

    // Legacy backup
    if(students.length === 0) {
        try {
            const leg = localStorage.getItem('ct_students');
            if(leg) students = JSON.parse(leg);
        } catch(e) {}
    }

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

        // Initial Render
        this.navigate('live');
        if (window.lucide) window.lucide.createIcons();
        
        // GLOBAL TICK LOOP (Runs every 1s)
        setInterval(() => {
            this.tick();
        }, 1000);
    },

    // Appelé chaque seconde
    tick() {
        // 1. Mettre à jour les données (Data Logic) - TOUJOURS
        const activeIds = Object.keys(window.appState.activeTimes);
        if (activeIds.length > 0) {
            activeIds.forEach(sid => {
                this.updateStudentSessionTime(sid);
            });
        }

        // 2. Mettre à jour l'interface (UI Logic) - SEULEMENT SI LIVE
        if (window.appState.view === 'live') {
            this.updateLiveUI();
        }
    },

    navigate(viewName) {
        window.appState.view = viewName;
        
        // UI Tabs (Active state)
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const isActive = btn.id === `nav-${viewName}`;
            btn.className = isActive 
                ? "nav-btn active flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap bg-white text-indigo-600 shadow-sm"
                : "nav-btn flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all text-slate-500 hover:bg-white/50 whitespace-nowrap";
        });

        // VIEW VISIBILITY TOGGLE (Utilisation de section-hidden)
        const views = ['live', 'stats', 'history', 'students'];
        views.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if(!el) return;
            if (v === viewName) {
                el.classList.remove('section-hidden');
            } else {
                el.classList.add('section-hidden');
            }
        });

        // Trigger specific renderers
        if (viewName === 'live') this.renderLive();
        if (viewName === 'students') this.renderStudents();
        if (viewName === 'history') this.renderHistory();
        if (viewName === 'stats') this.renderStats();
        
        if (window.lucide) window.lucide.createIcons();
    },

    saveLocal() {
        localStorage.setItem('chrono_track_students', JSON.stringify(window.appState.students));
        localStorage.setItem('chrono_track_sessions', JSON.stringify(window.appState.sessions));
        
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
        this.renderStudents(); // Refresh UI
    },

    deleteStudent(id) {
        if (!confirm("Supprimer ?")) return;
        window.appState.students = window.appState.students.filter(s => s.id !== id);
        this.saveLocal();
        this.renderStudents();
    },

    toggleTimer(studentId) {
        if (window.appState.activeTimes[studentId]) {
            // Stop
            this.updateStudentSessionTime(studentId); // Save last chunk
            delete window.appState.activeTimes[studentId];
        } else {
            // Start
            window.appState.activeTimes[studentId] = Date.now();
        }
        this.renderLive(); // Refresh buttons immediately
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
            
            // Calculer le nouveau total
            const newTotal = (res.total || 0) + elapsed;
            
            // Mettre à jour le dernier passage
            let passages = res.passages ? [...res.passages] : [0];
            if (passages.length === 0) passages = [0];
            passages[passages.length - 1] += elapsed;

            // Sauvegarde dans l'état
            session.results[studentId] = { total: newTotal, passages: passages };
            
            // Reset le curseur de temps pour éviter de recompter
            window.appState.activeTimes[studentId] = now;
            
            // Sauvegarde LocalStorage light (pas forcément FB à chaque seconde)
            localStorage.setItem('chrono_track_sessions', JSON.stringify(window.appState.sessions));
        }
    },

    updateLiveUI() {
        // Mise à jour uniquement du DOM des temps
        const session = window.appState.sessions.find(x => x.id === window.appState.currentSessionId);
        if(!session) return;
        
        Object.keys(window.appState.activeTimes).forEach(sid => {
            const el = document.getElementById(`time-${sid}`);
            if (el) {
                const res = session.results[sid];
                if (res) {
                    const pass = res.passages[res.passages.length - 1];
                    el.innerText = this.formatTime(pass);
                }
            }
        });
        
        // Mettre à jour le temps total en haut
        const totalLiveEl = document.getElementById('live-total-time');
        if(totalLiveEl) {
             // Calcul optionnel du total global si nécessaire
        }
    },

    renderLive() {
        const container = document.getElementById('live-list');
        if (!container) return;

        const session = window.appState.sessions.find(s => s.id === window.appState.currentSessionId);
        
        if (window.appState.students.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-400">Aucun élève. Allez dans l'onglet "Élèves".</div>`;
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
        
        if (window.appState.students.length === 0) {
            container.innerHTML = '<div class="text-slate-400 text-center text-sm py-4">Ajoutez votre premier élève ci-dessus.</div>';
            return;
        }

        container.innerHTML = window.appState.students.map(s => `
            <div class="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="h-8 w-8 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs">
                        ${s.name.charAt(0)}
                    </div>
                    <span class="font-bold text-slate-700">${s.name}</span>
                </div>
                <button onclick="window.app.deleteStudent('${s.id}')" class="text-slate-300 hover:text-red-500 transition-colors p-2">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
    },

    renderStats() {
        let total = 0;
        let sessionsCount = window.appState.sessions.length;
        let activeStudentCount = 0;
        let bestStudent = { name: '-', time: 0 };
        const studentTimes = {};

        // Calculs Stats
        window.appState.sessions.forEach(sess => {
            Object.entries(sess.results).forEach(([sid, r]) => {
                if(r.total > 0) {
                    total += r.total;
                    studentTimes[sid] = (studentTimes[sid] || 0) + r.total;
                }
            });
        });

        activeStudentCount = Object.keys(studentTimes).length;
        
        // Trouver le meilleur
        Object.entries(studentTimes).forEach(([sid, time]) => {
            if(time > bestStudent.time) {
                const s = window.appState.students.find(st => st.id === sid);
                bestStudent = { name: s ? s.name : sid, time: time };
            }
        });

        const elTotal = document.getElementById('stat-total-hours');
        if(elTotal) elTotal.innerText = (total / 3600).toFixed(1) + 'h';
        
        const elSess = document.getElementById('stat-total-sessions');
        if(elSess) elSess.innerText = sessionsCount;

        const elActive = document.getElementById('stat-active-students');
        if(elActive) elActive.innerText = activeStudentCount;

        const elBest = document.getElementById('stat-top-perf');
        if(elBest) elBest.innerText = bestStudent.name;

        // ChartJS FIX: Destroy old instance
        const ctx = document.getElementById('weeklyChart');
        if (ctx && window.Chart) {
            if (window.myChart instanceof Chart) {
                window.myChart.destroy();
            }
            
            // Préparation données graph
            const sortedStudents = Object.entries(studentTimes)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 7);

            window.myChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: sortedStudents.map(([sid]) => {
                        const s = window.appState.students.find(st => st.id === sid);
                        return s ? s.name : sid.substring(0,4);
                    }),
                    datasets: [{
                        label: 'Secondes',
                        data: sortedStudents.map(([,t]) => t),
                        backgroundColor: '#4f46e5',
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, grid: { display: false } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    },

    renderHistory() {
        const container = document.getElementById('history-content');
        const dateInput = document.getElementById('history-date');
        
        if(!dateInput.value) dateInput.value = window.appState.currentSessionId;
        const targetDate = dateInput.value;
        const session = window.appState.sessions.find(s => s.id === targetDate);

        if (!session) {
            container.innerHTML = `<div class="text-center py-10 text-slate-300">Aucune session enregistrée à cette date.</div>`;
            return;
        }

        container.innerHTML = window.appState.students.map(s => {
            const res = session.results[s.id];
            if (!res || res.total === 0) return '';
            
            return `
            <div class="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center">
                <span class="font-bold text-slate-700">${s.name}</span>
                <span class="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded text-xs">
                    ${this.formatTime(res.total)}
                </span>
            </div>`;
        }).join('') || `<div class="text-center py-10 text-slate-300">Aucune activité ce jour-là.</div>`;
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
    
    // Listeners supplémentaires
    const input = document.getElementById('new-student-input');
    if(input) input.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') window.app.addStudent();
    });

    const histDate = document.getElementById('history-date');
    if(histDate) histDate.addEventListener('change', () => window.app.renderHistory());
});
