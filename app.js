import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- UTILS ---
function getLocalDateString() {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

function getWeekNumber(d) {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    var weekNo = Math.ceil(( ( (d - yearStart) / 86400000) + 1)/7);
    return weekNo;
}

// --- GLOBAL STATE ---
window.appState = {
    view: 'stats',
    students: [],
    sessions: [],
    currentSessionId: getLocalDateString(),
    activeTimes: {},
    chartMode: 'week', // 'week' | 'month'
    dashboardDate: new Date(), // Selected Month
    selectedWeekIndex: -1, // -1 = current/auto, 0-4 specific week index in month
    db: null,
    auth: null,
    isFirebaseReady: false,
    lastError: null,
    lastAutoSave: 0
};

// --- DATA RECOVERY (FALLBACK ONLY) ---
function recoverData() {
    let students = [];
    let sessions = [];
    try {
        const storedStudents = localStorage.getItem('chrono_track_students');
        if (storedStudents) students = JSON.parse(storedStudents);
        const storedSessions = localStorage.getItem('chrono_track_sessions');
        if (storedSessions) sessions = JSON.parse(storedSessions);
    } catch (e) { console.error("Data parse error", e); }
    return { students: students || [], sessions: sessions || [] };
}

// --- APP LOGIC ---
window.app = {
    async init() {
        const data = recoverData();
        window.appState.students = data.students;
        window.appState.sessions = data.sessions;
        
        window.appState.currentSessionId = getLocalDateString();
        this.ensureCurrentSessionExists();

        this.navigate('stats');
        if (window.lucide) window.lucide.createIcons();
        
        await this.connectFirebase();

        setInterval(() => { this.tick(); }, 1000);
    },
    
    ensureCurrentSessionExists() {
        let todaySession = window.appState.sessions.find(s => s.id === window.appState.currentSessionId);
        if (!todaySession) {
            todaySession = { id: window.appState.currentSessionId, date: new Date().toISOString(), results: {} };
            window.appState.sessions.push(todaySession);
        }
        return todaySession;
    },

    async connectFirebase() {
        if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) {
            window.appState.lastError = new Error("Firebase Config missing");
            this.updateSaveStatus('error', "CONFIG ERROR");
            return;
        }

        try {
            this.updateSaveStatus('syncing');
            
            if (!window.appState.db) {
                const fbApp = initializeApp(window.FIREBASE_CONFIG);
                window.appState.db = getFirestore(fbApp);
                window.appState.auth = getAuth(fbApp);
            }

            onAuthStateChanged(window.appState.auth, async (user) => {
                if (user) {
                    window.appState.isFirebaseReady = true;
                    this.subscribeToData();
                } else {
                    window.appState.isFirebaseReady = false;
                }
            });

            await signInAnonymously(window.appState.auth);

        } catch (e) {
            console.error("Firebase Init Error:", e);
            window.appState.lastError = e;
            this.updateSaveStatus('error', "OFFLINE");
        }
    },

    retryConnection() {
        if(window.appState.lastError) {
             alert(`Erreur: ${window.appState.lastError.message}`);
             this.connectFirebase();
        } else if(!window.appState.isFirebaseReady) {
            this.connectFirebase();
        } else {
            alert("Connecté au Cloud.");
        }
    },

    subscribeToData() {
        if (!window.appState.db) return;

        onSnapshot(doc(window.appState.db, "data", "students"), (doc) => {
            if (doc.exists() && doc.data().list) {
                window.appState.students = doc.data().list;
                this.persistLocal(false); 
                if(window.appState.view === 'students') this.renderStudents();
                if(window.appState.view === 'live') this.renderLive();
            }
        });

        onSnapshot(doc(window.appState.db, "data", "sessions"), (doc) => {
            if (doc.exists() && doc.data().list) {
                window.appState.sessions = doc.data().list;
                this.ensureCurrentSessionExists(); 
                this.persistLocal(false); 
                this.updateSaveStatus('saved');
                
                if(window.appState.view === 'live') this.updateLiveUI();
                if(window.appState.view === 'stats') this.renderStats();
            }
        });
    },

    tick() {
        const nowId = getLocalDateString();
        if (nowId !== window.appState.currentSessionId) {
            window.appState.currentSessionId = nowId;
            this.ensureCurrentSessionExists();
            this.renderLive();
        }

        const activeIds = Object.keys(window.appState.activeTimes);
        if (activeIds.length > 0) {
            activeIds.forEach(sid => { this.updateStudentSessionTime(sid); });
            const now = Date.now();
            if (now - window.appState.lastAutoSave > 10000) {
                this.saveToFirebase();
                window.appState.lastAutoSave = now;
            }
        }

        if (window.appState.view === 'live') {
            this.updateLiveUI();
        }
    },

    navigate(viewName) {
        window.appState.view = viewName;
        document.querySelectorAll('.nav-btn').forEach(btn => {
            const isActive = btn.id === `nav-${viewName}`;
            btn.className = isActive 
                ? "nav-btn active flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap bg-white text-indigo-600 shadow-sm"
                : "nav-btn flex items-center px-4 py-2 rounded-lg text-xs font-bold transition-all text-slate-500 hover:bg-white/50 whitespace-nowrap";
        });

        const views = ['live', 'stats', 'history', 'students'];
        views.forEach(v => {
            const el = document.getElementById(`view-${v}`);
            if(!el) return;
            el.classList.toggle('section-hidden', v !== viewName);
        });

        if (viewName === 'live') this.renderLive();
        if (viewName === 'students') this.renderStudents();
        if (viewName === 'history') this.renderHistory();
        if (viewName === 'stats') this.renderStats();
        
        if (window.lucide) window.lucide.createIcons();
    },

    persistLocal(pushToCloud = true) {
        localStorage.setItem('chrono_track_students', JSON.stringify(window.appState.students));
        localStorage.setItem('chrono_track_sessions', JSON.stringify(window.appState.sessions));
        if (pushToCloud) this.saveToFirebase();
    },

    async saveToFirebase() {
        if (!window.appState.db || !window.appState.isFirebaseReady) return;
        this.updateSaveStatus('saving'); 
        try {
            await setDoc(doc(window.appState.db, "data", "students"), { list: window.appState.students });
            await setDoc(doc(window.appState.db, "data", "sessions"), { list: window.appState.sessions });
            setTimeout(() => { this.updateSaveStatus('saved'); }, 600);
        } catch (e) {
            window.appState.lastError = e;
            this.updateSaveStatus('error', "ECHEC");
        }
    },

    updateSaveStatus(status, textOverride) {
        const text = document.getElementById('save-text');
        const currentIcon = document.getElementById('save-icon');
        if (!text) return;

        let iconName = 'loader-2';
        let iconClass = "w-4 h-4 text-slate-400 animate-spin";
        let labelText = "INIT...";
        let labelClass = "text-[10px] text-slate-400 font-bold uppercase tracking-wider";

        if (status === 'saving') {
            iconName = 'cloud-upload';
            iconClass = "w-4 h-4 text-blue-500 animate-pulse";
            labelText = "SAVING...";
            labelClass = "text-[10px] text-blue-500 font-bold uppercase tracking-wider";
        } else if (status === 'saved') {
            iconName = 'check-circle-2';
            iconClass = "w-4 h-4 text-emerald-500";
            labelText = "SAVED";
            labelClass = "text-[10px] text-emerald-500 font-bold uppercase tracking-wider";
        } else if (status === 'error') {
            iconName = 'alert-circle';
            iconClass = "w-4 h-4 text-red-500";
            labelText = textOverride || "ERROR";
            labelClass = "text-[10px] text-red-500 font-bold uppercase tracking-wider";
        } else if (status === 'syncing') {
            iconName = 'refresh-cw';
            iconClass = "w-4 h-4 text-slate-400 animate-spin";
            labelText = "SYNC...";
            labelClass = "text-[10px] text-slate-400 font-bold uppercase tracking-wider";
        }

        text.innerText = labelText;
        text.className = labelClass;
        
        if (currentIcon) {
            const newIcon = document.createElement('i');
            newIcon.id = 'save-icon';
            newIcon.setAttribute('data-lucide', iconName);
            newIcon.className = iconClass;
            currentIcon.replaceWith(newIcon);
            if (window.lucide) window.lucide.createIcons();
        }
    },

    addStudent() {
        const input = document.getElementById('new-student-input');
        if (!input) return;
        const name = input.value.trim();
        if (!name) return;
        window.appState.students.push({ id: 'st_' + Date.now(), name: name, createdAt: new Date().toISOString() });
        window.appState.students.sort((a,b) => a.name.localeCompare(b.name));
        input.value = '';
        this.persistLocal(true);
        this.renderStudents();
    },

    editStudent(id) {
        const student = window.appState.students.find(s => s.id === id);
        if (!student) return;
        const newName = prompt("Modifier le nom de l'élève :", student.name);
        if (newName && newName.trim() !== "") {
            student.name = newName.trim();
            window.appState.students.sort((a,b) => a.name.localeCompare(b.name));
            this.persistLocal(true);
            this.renderStudents();
            if(window.appState.view === 'live') this.renderLive();
        }
    },

    deleteStudent(id) {
        if (!confirm("Supprimer ?")) return;
        window.appState.students = window.appState.students.filter(s => s.id !== id);
        this.persistLocal(true);
        this.renderStudents();
    },

    toggleTimer(studentId) {
        if (window.appState.activeTimes[studentId]) {
            this.updateStudentSessionTime(studentId);
            delete window.appState.activeTimes[studentId];
        } else {
            window.appState.activeTimes[studentId] = Date.now();
        }
        this.persistLocal(true); 
        this.renderLive();
    },

    addManualTime(studentId) {
        const input = prompt("Temps à ajouter en minutes (ex: 5 pour ajouter, -5 pour retirer) :");
        if (input === null) return;
        const minutes = parseInt(input);
        if (isNaN(minutes)) { alert("Nombre invalide"); return; }
        const secondsToAdd = minutes * 60;
        const session = this.ensureCurrentSessionExists();
        const res = session.results[studentId] || { total: 0, passages: [] };
        let newTotal = (res.total || 0) + secondsToAdd;
        if(newTotal < 0) newTotal = 0;
        let newPassages = res.passages ? [...res.passages] : [0];
        if(newPassages.length === 0) newPassages = [0];
        newPassages[newPassages.length - 1] += secondsToAdd;
        if(newPassages[newPassages.length - 1] < 0) newPassages[newPassages.length - 1] = 0;
        session.results[studentId] = { total: newTotal, passages: newPassages };
        this.persistLocal(true); 
        this.renderLive();
    },

    resetStudentSession(studentId) {
        if(!confirm("Réinitialiser ?")) return;
        if (window.appState.activeTimes[studentId]) delete window.appState.activeTimes[studentId];
        const session = this.ensureCurrentSessionExists();
        if(session) {
            session.results[studentId] = { total: 0, passages: [] };
            this.persistLocal(true); 
            this.renderLive();
        }
    },

    stepPassage(studentId) {
        if (window.appState.activeTimes[studentId]) {
            this.updateStudentSessionTime(studentId);
            window.appState.activeTimes[studentId] = Date.now();
        }
        const session = this.ensureCurrentSessionExists();
        const res = session.results[studentId] || { total: 0, passages: [] };
        const newPassages = res.passages ? [...res.passages, 0] : [res.total || 0, 0];
        session.results[studentId] = { ...res, passages: newPassages };
        this.persistLocal(true); 
        this.renderLive();
    },

    updateStudentSessionTime(studentId) {
        if (!window.appState.activeTimes[studentId]) return;
        const now = Date.now();
        const start = window.appState.activeTimes[studentId];
        const elapsed = Math.floor((now - start) / 1000);
        if (elapsed > 0) {
            const session = this.ensureCurrentSessionExists();
            const res = session.results[studentId] || { total: 0, passages: [0] };
            const newTotal = (res.total || 0) + elapsed;
            let passages = res.passages ? [...res.passages] : [0];
            if (passages.length === 0) passages = [0];
            passages[passages.length - 1] += elapsed;
            session.results[studentId] = { total: newTotal, passages: passages };
            window.appState.activeTimes[studentId] = now;
        }
    },

    updateLiveUI() {
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
        let totalSec = 0;
        let activeStudentCount = 0;
        Object.values(session.results).forEach(r => {
            const t = r.total || 0;
            totalSec += t;
            if (t > 0) activeStudentCount++;
        });
        const totalLiveEl = document.getElementById('live-total-time');
        if(totalLiveEl) totalLiveEl.innerText = this.formatTime(totalSec);
        const avgLiveEl = document.getElementById('live-avg-time');
        if(avgLiveEl) {
            const avg = activeStudentCount > 0 ? Math.floor(totalSec / activeStudentCount) : 0;
            avgLiveEl.innerText = this.formatTime(avg);
        }
    },

    renderLive() {
        const container = document.getElementById('live-list');
        const dateEl = document.getElementById('live-session-date');
        if(dateEl) {
            const [y, m, d] = window.appState.currentSessionId.split('-');
            dateEl.innerText = `${d}/${m}/${y}`;
        }
        if (!container) return;
        let session = window.appState.sessions.find(s => s.id === window.appState.currentSessionId);
        if (!session) session = this.ensureCurrentSessionExists();
        if (!window.appState.students || window.appState.students.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-400">Aucun élève.</div>`;
            return;
        }
        container.innerHTML = window.appState.students.map(s => {
            const res = (session.results && session.results[s.id]) || { total: 0, passages: [0] };
            const isActive = !!window.appState.activeTimes[s.id];
            const currentPassage = res.passages ? res.passages[res.passages.length - 1] : 0;
            return `
            <div class="bg-white p-2 rounded-xl border transition-all flex items-center justify-between gap-2 ${isActive ? 'timer-active shadow-md' : 'border-slate-100'}">
                <div class="flex items-center gap-3 overflow-hidden flex-1">
                    <div class="h-8 w-8 rounded-full flex items-center justify-center font-black text-[10px] shrink-0 ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}">
                        ${res.passages ? res.passages.length : 1}
                    </div>
                    <div class="min-w-0">
                        <h4 class="font-bold text-sm truncate text-slate-800 leading-tight">${s.name}</h4>
                        <div class="flex items-center gap-2">
                             <p class="text-[9px] font-bold text-slate-400 uppercase">Tot: ${this.formatTime(res.total)}</p>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <div id="time-${s.id}" class="font-mono font-bold text-lg tabular-nums w-14 text-right ${isActive ? 'text-indigo-600' : 'text-slate-300'}">
                        ${this.formatTime(currentPassage)}
                    </div>
                    <button onclick="window.app.stepPassage('${s.id}')" class="h-8 w-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-indigo-100 transition-colors">
                        <i data-lucide="step-forward" class="w-3 h-3"></i>
                    </button>
                    <button onclick="window.app.addManualTime('${s.id}')" class="h-8 w-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-indigo-100 transition-colors">
                        <i data-lucide="clock-4" class="w-3 h-3"></i>
                    </button>
                    <button onclick="window.app.toggleTimer('${s.id}')" class="timer-btn h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center shadow-sm transition-all ${isActive ? '' : 'bg-white text-slate-600'}">
                        <i data-lucide="${isActive ? 'pause' : 'play'}" class="w-3 h-3 ml-0.5"></i>
                    </button>
                    <button onclick="window.app.resetStudentSession('${s.id}')" class="h-8 w-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-100 transition-colors ml-1">
                        <i data-lucide="trash-2" class="w-3 h-3"></i>
                    </button>
                </div>
            </div>`;
        }).join('');
        this.updateLiveUI();
        if (window.lucide) window.lucide.createIcons();
    },

    formatTime(s) {
        if (!s) return "00:00";
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return (m<10?"0"+m:m) + ":" + (sec<10?"0"+sec:sec);
    },
    
    formatDurationHM(seconds) {
        if (!seconds) return "0m";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    },

    formatDurationMS(seconds) {
        if (!seconds) return "0s";
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    },

    // INVERSE TREND LOGIC: Lower = Green (Better), Higher = Red (Worse)
    renderTrend(current, previous, isReversed = true) {
        if (previous === 0) return '';
        const diff = current - previous;
        const isBetter = isReversed ? (diff < 0) : (diff > 0);
        const isNeutral = diff === 0;

        if (isNeutral) return `<span class="ml-2 text-slate-300"><i data-lucide="minus" class="w-4 h-4 inline"></i></span>`;
        
        const color = isBetter ? 'text-emerald-500' : 'text-red-400';
        const icon = diff < 0 ? 'trending-down' : 'trending-up'; // Icon follows numeric direction
        
        return `<span class="ml-2 ${color}"><i data-lucide="${icon}" class="w-4 h-4 inline"></i></span>`;
    },

    // --- DASHBOARD NAVIGATION ---
    
    changeDashboardMonth(delta) {
        const newDate = new Date(window.appState.dashboardDate);
        newDate.setMonth(newDate.getMonth() + delta);
        window.appState.dashboardDate = newDate;
        window.appState.selectedWeekIndex = -1; // Reset week on month change
        this.renderStats();
    },

    changeDashboardWeek(delta) {
        if (window.appState.chartMode !== 'week') return;
        
        let newIndex = window.appState.selectedWeekIndex;
        if (newIndex === -1) {
            // Initializing week navigation inside a month
            // If current month, try to find current week index, else start at 0
            newIndex = 0; 
        }
        newIndex += delta;
        if (newIndex < 0) newIndex = 0;
        if (newIndex > 4) newIndex = 4; // Cap at 5 weeks roughly
        
        window.appState.selectedWeekIndex = newIndex;
        this.renderStats();
    },

    toggleChart(mode) {
        window.appState.chartMode = mode;
        window.appState.selectedWeekIndex = -1; // Reset to default "Current" view
        this.renderStats();
    },

    // --- CORE STATS ENGINE ---

    getDatesForPeriod(date, mode, weekIndex) {
        const year = date.getFullYear();
        const month = date.getMonth();
        let start, end, label;

        if (mode === 'month') {
            start = new Date(year, month, 1);
            end = new Date(year, month + 1, 0); // Last day of month
            label = start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        } else {
            // Week Mode
            
            // Helper: Calculate week range for a logical index (0 = week containing 1st of month logic, etc.)
            const getWeekRange = (idx) => {
                let s = new Date(year, month, 1 + (idx * 7));
                // Align to Monday
                let day = s.getDay();
                let diff = s.getDate() - day + (day == 0 ? -6 : 1); 
                s.setDate(diff);
                
                let e = new Date(s);
                e.setDate(s.getDate() + 6);
                return { start: s, end: e };
            };

            let targetWeekIndex = weekIndex;
            
            // Auto-detect current week if index is -1
            if (targetWeekIndex === -1) {
                const today = new Date();
                today.setHours(0,0,0,0);
                
                // Only default to "Today's week" if we are viewing the current month
                if (today.getMonth() === month && today.getFullYear() === year) {
                     targetWeekIndex = 0; // Default fallback
                     // Scan weeks to find which one contains today
                     for(let i=0; i<6; i++) {
                         const r = getWeekRange(i);
                         // Normalize for comparison
                         const rStart = new Date(r.start); rStart.setHours(0,0,0,0);
                         const rEnd = new Date(r.end); rEnd.setHours(23,59,59,999);
                         
                         if (today >= rStart && today <= rEnd) {
                             targetWeekIndex = i;
                             break;
                         }
                     }
                } else {
                     targetWeekIndex = 0; // Default to first week for other months
                }
            }
            window.appState.selectedWeekIndex = targetWeekIndex;

            const range = getWeekRange(targetWeekIndex);
            start = range.start;
            end = range.end;
            
            // Formatting label
            const startDay = start.getDate();
            const endDay = end.getDate();
            const startMonth = start.toLocaleDateString('fr-FR', { month: 'short' });
            const endMonth = end.toLocaleDateString('fr-FR', { month: 'short' });
            
            if (start.getMonth() !== end.getMonth()) {
                label = `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
            } else {
                label = `Semaine du ${startDay} au ${endDay} ${endMonth}`;
            }
        }
        
        // Return YYYY-MM-DD strings
        const offset = start.getTimezoneOffset() * 60000;
        const sStr = new Date(start.getTime() - offset).toISOString().split('T')[0];
        const eStr = new Date(end.getTime() - offset).toISOString().split('T')[0];

        return { start: sStr, end: eStr, label: label, startDateObj: start };
    },

    calculatePeriodStats(startStr, endStr) {
        let totalTime = 0;
        let sessionsCount = 0;
        let activeStudents = new Set();
        let studentTimes = {};
        
        // Robust filtering: Use string comparison on ISO dates (YYYY-MM-DD)
        window.appState.sessions.forEach(sess => {
            if (sess.id >= startStr && sess.id <= endStr) {
                let hasActivity = false;
                Object.entries(sess.results).forEach(([sid, r]) => {
                    const t = r.total || 0;
                    if (t > 0) {
                        totalTime += t;
                        // Count student-sessions (interventions)
                        sessionsCount++; 
                        activeStudents.add(sid);
                        studentTimes[sid] = (studentTimes[sid] || 0) + t;
                        hasActivity = true;
                    }
                });
            }
        });
        
        return { totalTime, sessionsCount, activeStudents, studentTimes };
    },

    renderStats() {
        const mode = window.appState.chartMode;
        const currentMonthDate = window.appState.dashboardDate;

        // 1. Determine Current Period Range
        const currentRange = this.getDatesForPeriod(currentMonthDate, mode, window.appState.selectedWeekIndex);
        
        // 2. Determine Previous Period Range for Comparison
        let prevDateBase;
        // Shift base date back
        if (mode === 'month') {
            prevDateBase = new Date(currentMonthDate);
            prevDateBase.setMonth(prevDateBase.getMonth() - 1);
        } else {
            prevDateBase = new Date(currentRange.startDateObj);
            prevDateBase.setDate(prevDateBase.getDate() - 7);
        }
        
        // Use prevDateBase to get range. If mode is week, we just shifted the start date, so we reuse logic implicitly or manually.
        let prevStart = new Date(currentRange.start);
        let prevEnd = new Date(currentRange.end);
        
        if (mode === 'month') {
             prevStart.setMonth(prevStart.getMonth() - 1);
        } else {
            prevStart.setDate(prevStart.getDate() - 7);
            prevEnd.setDate(prevEnd.getDate() - 7);
        }
        
        // Re-generate strings for Prev Range
        const pOffset1 = prevStart.getTimezoneOffset() * 60000;
        const pOffset2 = prevEnd.getTimezoneOffset() * 60000;
        const prevRange = {
            start: new Date(prevStart.getTime() - pOffset1).toISOString().split('T')[0],
            end: new Date(prevEnd.getTime() - pOffset2).toISOString().split('T')[0]
        };

        // 3. Calculate Stats
        const currStats = this.calculatePeriodStats(currentRange.start, currentRange.end);
        const prevStats = this.calculatePeriodStats(prevRange.start, prevRange.end);

        // Derived Metrics
        const currActiveCount = currStats.activeStudents.size || 0;
        const prevActiveCount = prevStats.activeStudents.size || 0;
        
        const currAvgSession = currStats.sessionsCount > 0 ? (currStats.totalTime / currStats.sessionsCount) : 0;
        const prevAvgSession = prevStats.sessionsCount > 0 ? (prevStats.totalTime / prevStats.sessionsCount) : 0;

        const currAvgStudent = currActiveCount > 0 ? (currStats.totalTime / currActiveCount) : 0;
        const prevAvgStudent = prevActiveCount > 0 ? (prevStats.totalTime / prevActiveCount) : 0;
        
        // Daily Average (Period Total / Number of days in period (7 or ~30))
        const daysInPeriod = mode === 'week' ? 7 : 30; 
        const currAvgDay = currStats.totalTime / daysInPeriod;
        const prevAvgDay = prevStats.totalTime / daysInPeriod;

        // 4. Update UI
        const monthLabel = document.getElementById('dashboard-month-label');
        if (monthLabel) monthLabel.innerText = currentMonthDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        
        const weekNav = document.getElementById('week-navigation-controls');
        if (weekNav) {
            if (mode === 'week') {
                weekNav.classList.remove('section-hidden');
                document.getElementById('dashboard-week-label').innerText = currentRange.label;
                document.getElementById('chart-btn-week').className = "bg-white text-indigo-600 px-4 py-2 rounded-md shadow-sm transition-all";
                document.getElementById('chart-btn-month').className = "text-slate-500 hover:bg-white/50 px-4 py-2 rounded-md transition-all";
            } else {
                weekNav.classList.add('section-hidden');
                document.getElementById('chart-btn-week').className = "text-slate-500 hover:bg-white/50 px-4 py-2 rounded-md transition-all";
                document.getElementById('chart-btn-month').className = "bg-white text-indigo-600 px-4 py-2 rounded-md shadow-sm transition-all";
            }
        }

        const updateCard = (id, val, prev, formatter) => {
            const el = document.getElementById(id);
            if(el) el.innerHTML = `${formatter(val)} ${this.renderTrend(val, prev, true)}`; 
        };
        
        updateCard('stat-total-period', currStats.totalTime, prevStats.totalTime, this.formatDurationHM);
        updateCard('stat-avg-day', currAvgDay, prevAvgDay, this.formatDurationHM);
        updateCard('stat-avg-student', currAvgStudent, prevAvgStudent, this.formatDurationHM);
        updateCard('stat-avg-session', currAvgSession, prevAvgSession, this.formatDurationMS);
        
        const elTotalSess = document.getElementById('stat-total-sessions');
        if(elTotalSess) elTotalSess.innerHTML = `${currStats.sessionsCount} ${this.renderTrend(currStats.sessionsCount, prevStats.sessionsCount, false)}`;

        const elTotalActive = document.getElementById('stat-active-students');
        if(elTotalActive) elTotalActive.innerHTML = `${currActiveCount} ${this.renderTrend(currActiveCount, prevActiveCount, false)}`;

        // Top 5 Students
        const topContainer = document.getElementById('dashboard-top-students');
        if(topContainer) {
            const sorted = Object.entries(currStats.studentTimes).sort(([, a], [, b]) => b - a).slice(0, 5);
            if(sorted.length === 0) topContainer.innerHTML = '<div class="text-slate-400 text-xs italic">Aucune donnée.</div>';
            else {
                topContainer.innerHTML = sorted.map(([sid, time], index) => {
                    const s = window.appState.students.find(x => x.id === sid);
                    return `<div class="flex justify-between items-center text-sm border-b border-slate-50 last:border-0 py-2">
                        <div class="flex items-center gap-3"><div class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center">${index + 1}</div><span class="text-slate-700 font-bold">${s ? s.name : sid}</span></div>
                        <span class="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-500">${this.formatDurationHM(time)}</span>
                    </div>`;
                }).join('');
            }
        }
        
        // Monthly Ranking
        const rankContainer = document.getElementById('dashboard-monthly-ranking');
        const rankLabel = document.getElementById('monthly-ranking-label');
        if(rankLabel) rankLabel.innerText = `(${currentRange.label})`;
        
        if (rankContainer) {
            const sorted = Object.entries(currStats.studentTimes).sort(([, a], [, b]) => b - a);
            if (sorted.length === 0) {
                 rankContainer.innerHTML = '<div class="text-center py-4 text-slate-400 text-xs">Aucune activité.</div>';
            } else {
                 rankContainer.innerHTML = sorted.map(([sid, time], index) => {
                    const s = window.appState.students.find(x => x.id === sid);
                    let rankColor = "bg-slate-100 text-slate-500";
                    if(index === 0) rankColor = "bg-yellow-100 text-yellow-600";
                    if(index === 1) rankColor = "bg-slate-200 text-slate-600";
                    if(index === 2) rankColor = "bg-orange-100 text-orange-600";
                    return `<div class="flex justify-between items-center text-sm bg-slate-50 p-2 rounded-lg border border-slate-100 mb-2">
                        <div class="flex items-center gap-3"><div class="w-6 h-6 rounded-full ${rankColor} font-bold text-xs flex items-center justify-center shrink-0">${index + 1}</div>
                        <span class="text-slate-700 font-bold leading-tight">${s ? s.name : sid}</span></div>
                        <span class="font-mono text-xs font-bold text-indigo-600">${this.formatDurationHM(time)}</span>
                    </div>`;
                }).join('');
            }
        }

        // 5. Chart Update
        const ctx = document.getElementById('mainChart');
        if (ctx && window.Chart) {
            if (window.myChart instanceof Chart) window.myChart.destroy();
            let labels = [];
            let dataPoints = [];
            
            const start = new Date(currentRange.start);
            const end = new Date(currentRange.end);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const offset = d.getTimezoneOffset() * 60000;
                const dateStr = new Date(d.getTime() - offset).toISOString().split('T')[0];
                
                labels.push(mode === 'week' 
                    ? d.toLocaleDateString('fr-FR', { weekday: 'short' }) 
                    : d.getDate());

                // Get Data
                let val = 0;
                const sess = window.appState.sessions.find(s => s.id === dateStr);
                if(sess) Object.values(sess.results).forEach(r => { val += (r.total || 0); });
                dataPoints.push(Math.floor(val/60)); 
            }

            window.myChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Minutes',
                        data: dataPoints,
                        backgroundColor: '#4f46e5',
                        borderRadius: 4,
                        barThickness: mode === 'week' ? 20 : 6
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
        
        if (window.lucide) window.lucide.createIcons();
    },

    renderHistory() {
        const container = document.getElementById('history-content');
        const dateInput = document.getElementById('history-date');
        if(!dateInput.value) dateInput.value = window.appState.currentSessionId;
        const targetDate = dateInput.value;
        const session = window.appState.sessions.find(s => s.id === targetDate);
        if (!session) { container.innerHTML = `<div class="text-center py-10 text-slate-300">Aucune session.</div>`; return; }
        if (!window.appState.students || window.appState.students.length === 0) { container.innerHTML = `<div class="text-center py-10 text-slate-300">Vide.</div>`; return; }
        const html = window.appState.students.map(s => {
            const res = session.results[s.id] || { total: 0 };
            const isZero = res.total === 0;
            return `<div class="bg-white p-3 rounded-xl border ${isZero ? 'border-slate-100 opacity-60' : 'border-indigo-100'} flex justify-between items-center shadow-sm">
                <span class="font-bold text-slate-700 text-sm">${s.name}</span>
                <span class="font-mono font-bold ${isZero ? 'text-slate-400 bg-slate-50' : 'text-indigo-600 bg-indigo-50'} px-2 py-1 rounded text-xs">${this.formatDurationHM(res.total)}</span>
            </div>`;
        }).join('');
        container.innerHTML = html || `<div class="text-center py-10 text-slate-300">Aucune activité.</div>`;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.app.init();
    const input = document.getElementById('new-student-input');
    if(input) input.addEventListener('keypress', (e) => {
        if(e.key === 'Enter') window.app.addStudent();
    });
    const histDate = document.getElementById('history-date');
    if(histDate) histDate.addEventListener('change', () => window.app.renderHistory());
});