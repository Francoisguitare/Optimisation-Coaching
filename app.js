import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, doc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- UTILS ---
function getLocalDateString() {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
}

// --- GLOBAL STATE ---
window.appState = {
    view: 'stats',
    students: [],
    sessions: [],
    currentSessionId: getLocalDateString(),
    activeTimes: {},
    chartMode: 'week',
    dashboardDate: new Date(), // Nouvelle variable pour la navigation par mois
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
        // 1. Initial Render with Local Cache (Instant Load)
        const data = recoverData();
        window.appState.students = data.students;
        window.appState.sessions = data.sessions;
        
        // 2. Setup Session
        window.appState.currentSessionId = getLocalDateString();
        this.ensureCurrentSessionExists();

        // 3. Render Initial View
        this.navigate('stats');
        if (window.lucide) window.lucide.createIcons();
        
        // 4. Connect Firebase & Setup Realtime Listeners
        // The onclick handler is now defined in index.html directly
        await this.connectFirebase();

        // 5. Start Tick
        setInterval(() => { this.tick(); }, 1000);
    },
    
    ensureCurrentSessionExists() {
        let todaySession = window.appState.sessions.find(s => s.id === window.appState.currentSessionId);
        if (!todaySession) {
            todaySession = { id: window.appState.currentSessionId, date: new Date().toISOString(), results: {} };
            window.appState.sessions.push(todaySession);
            // We do NOT save immediately here. We wait for user action or Cloud sync.
        }
        return todaySession;
    },

    async connectFirebase() {
        if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) {
            window.appState.lastError = new Error("Firebase Config missing");
            this.updateSaveStatus('error', "CONFIG ERROR");
            return;
        }

        if (window.location.protocol === 'file:') {
            console.warn("File Protocol detected. Firebase Auth might fail.");
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
                    console.log("🔒 Connected as " + user.uid);
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
            
            let label = "OFFLINE";
            if (e.code === "auth/operation-not-allowed") label = "AUTH DISABLED";
            if (window.location.protocol === 'file:') label = "FILE PROTOCOL";
            
            this.updateSaveStatus('error', label);
        }
    },

    retryConnection() {
        if(window.appState.lastError) {
             const e = window.appState.lastError;
             let msg = `ERREUR: ${e.message}\n\n`;
             if(e.code) msg += `CODE: ${e.code}\n\n`;
             if(window.location.protocol === 'file:') msg += "NOTE: Firebase ne fonctionne généralement pas directement depuis un fichier (file://). Utilisez un serveur local (ex: Live Server sur VS Code).\n";
             alert(msg);
             this.connectFirebase();
        } else if(!window.appState.isFirebaseReady) {
            this.connectFirebase();
        } else {
            alert("Tout semble fonctionner. Vous êtes connecté au Cloud.");
        }
    },

    // REAL-TIME SYNC ENGINE (GOOGLE SHEETS STYLE)
    subscribeToData() {
        if (!window.appState.db) return;

        // Listen for Student List Changes
        const unsubStudents = onSnapshot(
            doc(window.appState.db, "data", "students"), 
            (doc) => {
                if (doc.exists()) {
                    const data = doc.data();
                    if(data.list) {
                        window.appState.students = data.list;
                        this.persistLocal(false); 
                        if(window.appState.view === 'students') this.renderStudents();
                        if(window.appState.view === 'live') this.renderLive();
                    }
                } else {
                    // Init Cloud if empty
                    if(window.appState.students.length > 0) this.saveToFirebase();
                }
            },
            (error) => {
                console.error("Students Sync Error:", error);
                window.appState.lastError = error;
                this.updateSaveStatus('error', "PERM. DENIED");
            }
        );

        // Listen for Session/Results Changes
        const unsubSessions = onSnapshot(
            doc(window.appState.db, "data", "sessions"), 
            (doc) => {
                if (doc.exists()) {
                    const data = doc.data();
                    if(data.list) {
                        window.appState.sessions = data.list;
                        this.ensureCurrentSessionExists(); 
                        this.persistLocal(false); 
                        this.updateSaveStatus('saved');
                        
                        if(window.appState.view === 'live') this.updateLiveUI();
                        if(window.appState.view === 'stats') this.renderStats();
                    }
                } else {
                    if(window.appState.sessions.length > 0) this.saveToFirebase();
                }
            },
            (error) => {
                console.error("Sessions Sync Error:", error);
                window.appState.lastError = error;
                this.updateSaveStatus('error', "PERM. DENIED");
            }
        );
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
            
            // Auto-Save every 10s if active
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
            
            setTimeout(() => {
                this.updateSaveStatus('saved'); 
            }, 600);
            
        } catch (e) {
            console.error("Save Error:", e);
            window.appState.lastError = e;
            this.updateSaveStatus('error', "ECHEC SAUVEGARDE");
        }
    },

    updateSaveStatus(status, textOverride) {
        const text = document.getElementById('save-text');
        // Retrieve current element (could be <i> or <svg> after Lucide renders)
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

        // Update Text
        text.innerText = labelText;
        text.className = labelClass;
        
        // FIX: Replace the icon element completely to avoid SVG className errors
        if (currentIcon) {
            const newIcon = document.createElement('i');
            newIcon.id = 'save-icon';
            newIcon.setAttribute('data-lucide', iconName);
            newIcon.className = iconClass; // Safe on HTMLElement
            
            currentIcon.replaceWith(newIcon);
            
            if (window.lucide) window.lucide.createIcons();
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
        this.persistLocal(true);
        this.renderStudents();
    },

    editStudent(id) {
        const student = window.appState.students.find(s => s.id === id);
        if (!student) return;
        
        const newName = prompt("Modifier le nom de l'élève :", student.name);
        if (newName && newName.trim() !== "") {
            student.name = newName.trim();
            // Re-trier la liste alphabétiquement
            window.appState.students.sort((a,b) => a.name.localeCompare(b.name));
            this.persistLocal(true);
            this.renderStudents();
            // Rafraichir les autres vues au cas où
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
        if (isNaN(minutes)) {
            alert("Veuillez entrer un nombre valide.");
            return;
        }

        const secondsToAdd = minutes * 60;
        const session = this.ensureCurrentSessionExists();
        const res = session.results[studentId] || { total: 0, passages: [] };
        
        let newTotal = (res.total || 0) + secondsToAdd;
        if(newTotal < 0) newTotal = 0;

        // On ajoute ce temps comme un nouveau "passage" fictif ou on l'ajoute au dernier
        let newPassages = res.passages ? [...res.passages] : [0];
        if(newPassages.length === 0) newPassages = [0];
        
        // On ajoute simplement au dernier passage pour simplifier
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

        // Compute Totals
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
            container.innerHTML = `<div class="text-center py-10 text-slate-400">Aucun élève. Allez dans l'onglet "Élèves" pour commencer.</div>`;
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
                    <button onclick="window.app.stepPassage('${s.id}')" class="h-8 w-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-indigo-100 transition-colors" title="Nouveau passage">
                        <i data-lucide="step-forward" class="w-3 h-3"></i>
                    </button>
                    <!-- Ajout Temps Manuel -->
                    <button onclick="window.app.addManualTime('${s.id}')" class="h-8 w-8 rounded-lg bg-slate-50 text-slate-400 flex items-center justify-center hover:bg-indigo-100 transition-colors" title="Ajout manuel">
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

    renderStudents() {
        const container = document.getElementById('students-list-container');
        if (!container) return;
        
        if (!window.appState.students || window.appState.students.length === 0) {
            container.innerHTML = '<div class="text-slate-400 text-center text-sm py-4">Ajoutez votre premier élève ci-dessus.</div>';
            return;
        }

        container.innerHTML = window.appState.students.map(s => `
            <div class="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="h-8 w-8 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs">
                        ${s.name.charAt(0)}
                    </div>
                    <span class="font-bold text-slate-700 text-sm">${s.name}</span>
                </div>
                <div class="flex items-center">
                    <button onclick="window.app.editStudent('${s.id}')" class="text-slate-300 hover:text-indigo-500 transition-colors p-2">
                        <i data-lucide="pencil" class="w-4 h-4"></i>
                    </button>
                    <button onclick="window.app.deleteStudent('${s.id}')" class="text-slate-300 hover:text-red-500 transition-colors p-2">
                        <i data-lucide="trash-2" class="w-4 h-4"></i>
                    </button>
                </div>
            </div>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
    },

    changeDashboardMonth(delta) {
        // Modifie le mois sélectionné
        const newDate = new Date(window.appState.dashboardDate);
        newDate.setMonth(newDate.getMonth() + delta);
        window.appState.dashboardDate = newDate;
        
        // Force le graphique en mode 'mois' quand on navigue
        window.appState.chartMode = 'month'; 
        this.renderStats();
    },

    toggleChart(mode) {
        if (mode === 'week') {
            // Si on demande la semaine, on revient au temps réel (Mois en cours) pour que "Semaine" ait du sens
            window.appState.dashboardDate = new Date();
            window.appState.chartMode = 'week';
        } else {
            window.appState.chartMode = 'month';
        }
        
        // Update Buttons UI
        const btnWeek = document.getElementById('chart-btn-week');
        const btnMonth = document.getElementById('chart-btn-month');
        if(!btnWeek || !btnMonth) return;
        
        if(window.appState.chartMode === 'week') {
            btnWeek.className = "px-3 py-1 rounded bg-white text-indigo-600 shadow-sm transition-all";
            btnMonth.className = "px-3 py-1 rounded text-slate-500 hover:bg-white/50 transition-all";
        } else {
            btnWeek.className = "px-3 py-1 rounded text-slate-500 hover:bg-white/50 transition-all";
            btnMonth.className = "px-3 py-1 rounded bg-white text-indigo-600 shadow-sm transition-all";
        }
        
        this.renderStats();
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

    // Helper pour générer l'HTML de tendance
    renderTrend(current, previous) {
        if (previous === 0) return ''; // Pas de données précédentes
        const diff = current - previous;
        const isImprovement = diff > 0;
        const isNeutral = diff === 0;

        if (isNeutral) return `<span class="ml-2 text-slate-300"><i data-lucide="minus" class="w-4 h-4 inline"></i></span>`;
        
        const color = isImprovement ? 'text-emerald-500' : 'text-red-400';
        const icon = isImprovement ? 'trending-up' : 'trending-down';
        
        return `<span class="ml-2 ${color}"><i data-lucide="${icon}" class="w-4 h-4 inline"></i></span>`;
    },

    renderStats() {
        const today = getLocalDateString();
        
        // --- 1. GESTION DE LA NAVIGATION PAR MOIS ---
        const selectedDate = window.appState.dashboardDate;
        const selectedYear = selectedDate.getFullYear();
        const selectedMonthIndex = selectedDate.getMonth(); // 0-11
        
        // Update Label
        const monthLabel = document.getElementById('dashboard-month-label');
        if (monthLabel) {
            const monthName = selectedDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
            monthLabel.innerText = monthName;
        }
        
        // Update Monthly Ranking Label
        const rankingLabel = document.getElementById('monthly-ranking-label');
        if (rankingLabel) {
            rankingLabel.innerText = "(" + selectedDate.toLocaleDateString('fr-FR', { month: 'long' }) + ")";
        }

        // Labels dynamiques pour les cartes Mensuelles
        const monthShortName = selectedDate.toLocaleDateString('fr-FR', { month: 'short' });
        const lblMonth = document.getElementById('label-stat-month');
        if(lblMonth) lblMonth.innerText = "MOIS (" + monthShortName.toUpperCase() + ")";
        const lblAvgMonth = document.getElementById('label-stat-avg-month');
        if(lblAvgMonth) lblAvgMonth.innerText = "MOYENNE (" + monthShortName.toUpperCase() + ")";
        const lblStudents = document.getElementById('label-stat-students');
        if(lblStudents) lblStudents.innerText = "ÉLÈVES (" + monthShortName.toUpperCase() + ")";

        // Prefix pour filtrer les sessions du mois sélectionné (ex: "2023-10")
        const selectedMonthPadded = (selectedMonthIndex + 1).toString().padStart(2, '0');
        const selectedMonthPrefix = `${selectedYear}-${selectedMonthPadded}`;
        
        // Calculation pour le mois précédent (Trend)
        const prevMonthDate = new Date(selectedYear, selectedMonthIndex - 1, 1);
        const prevMonthPadded = (prevMonthDate.getMonth() + 1).toString().padStart(2, '0');
        const prevMonthPrefix = `${prevMonthDate.getFullYear()}-${prevMonthPadded}`;

        // --- 2. GENERATION DES DATES POUR LE GRAPHIQUE/STATS ---
        const last7Days = [];
        const prev7Days = []; // Pour Trend Semaine
        
        // Pour les stats "Semaine", on garde toujours les 7 derniers jours réels
        for(let i=0; i<7; i++) {
            const d = new Date(); d.setDate(d.getDate() - i);
            const offset = d.getTimezoneOffset() * 60000;
            last7Days.push(new Date(d.getTime() - offset).toISOString().split('T')[0]);
        }
        // Semaine précédente
        for(let i=7; i<14; i++) {
             const d = new Date(); d.setDate(d.getDate() - i);
             const offset = d.getTimezoneOffset() * 60000;
             prev7Days.push(new Date(d.getTime() - offset).toISOString().split('T')[0]);
        }

        // ACCUMULATEURS
        let dailyTotal = 0;
        let weeklyTotal = 0;
        let prevWeeklyTotal = 0; // Trend
        let monthlyTotal = 0;
        let prevMonthlyTotal = 0; // Trend
        
        // SETS POUR COMPTER LES ELEVES UNIQUES ACTIFS
        let weeklyActiveStudents = new Set();
        let monthlyActiveStudents = new Set();
        let weeklyStudentTimes = {}; // Pour le Top 5 (toujours basé sur la semaine réelle)
        let monthlyStudentStats = {}; // Pour le classement mensuel complet

        window.appState.sessions.forEach(sess => {
            const isToday = sess.id === today;
            const isRealWeek = last7Days.includes(sess.id);
            const isPrevWeek = prev7Days.includes(sess.id);
            // Est-ce que cette session appartient au mois SÉLECTIONNÉ ?
            const isSelectedMonth = sess.id.startsWith(selectedMonthPrefix);
            const isPrevMonth = sess.id.startsWith(prevMonthPrefix);

            Object.entries(sess.results).forEach(([sid, r]) => {
                const t = r.total || 0;
                
                if (t > 0) {
                    // Les stats "Aujourd'hui" et "Semaine" restent Temps Réel
                    if (isToday) dailyTotal += t;
                    if (isRealWeek) {
                        weeklyTotal += t;
                        weeklyActiveStudents.add(sid);
                        weeklyStudentTimes[sid] = (weeklyStudentTimes[sid] || 0) + t;
                    }
                    if (isPrevWeek) {
                        prevWeeklyTotal += t;
                    }
                    
                    // Les stats "Mois" suivent la navigation
                    if (isSelectedMonth) {
                        monthlyTotal += t;
                        monthlyActiveStudents.add(sid);
                        
                        // Accumulation pour le classement mensuel
                        if(!monthlyStudentStats[sid]) monthlyStudentStats[sid] = { total: 0, sessionsCount: 0 };
                        monthlyStudentStats[sid].total += t;
                        monthlyStudentStats[sid].sessionsCount += 1;
                    }

                    if (isPrevMonth) {
                        prevMonthlyTotal += t;
                    }
                }
            });
        });

        // CALCULS MOYENNES
        const weekCount = weeklyActiveStudents.size || 1;
        const monthCount = monthlyActiveStudents.size || 1;
        
        const avgWeek = weeklyActiveStudents.size > 0 ? (weeklyTotal / weekCount) : 0;
        const avgMonth = monthlyActiveStudents.size > 0 ? (monthlyTotal / monthCount) : 0;
        const activeStudentTotal = monthlyActiveStudents.size;

        // MISE A JOUR DU DOM AVEC TENDANCES
        const elDaily = document.getElementById('stat-daily-hours');
        if(elDaily) elDaily.innerText = this.formatDurationHM(dailyTotal);
        
        const elWeekly = document.getElementById('stat-weekly-hours');
        if(elWeekly) elWeekly.innerHTML = `${this.formatDurationHM(weeklyTotal)} ${this.renderTrend(weeklyTotal, prevWeeklyTotal)}`;
        
        const elMonthly = document.getElementById('stat-monthly-hours');
        if(elMonthly) elMonthly.innerHTML = `${this.formatDurationHM(monthlyTotal)} ${this.renderTrend(monthlyTotal, prevMonthlyTotal)}`;
        
        const elAvgWeek = document.getElementById('stat-avg-week');
        if(elAvgWeek) elAvgWeek.innerText = this.formatDurationMS(avgWeek);
        
        const elAvgMonth = document.getElementById('stat-avg-month');
        if(elAvgMonth) elAvgMonth.innerText = this.formatDurationMS(avgMonth);
        
        const elActive = document.getElementById('stat-active-students');
        if(elActive) elActive.innerText = activeStudentTotal;

        // TOP 5 STUDENTS (Semaine)
        const topContainer = document.getElementById('dashboard-top-students');
        if(topContainer) {
            const sortedStudents = Object.entries(weeklyStudentTimes).sort(([, a], [, b]) => b - a).slice(0, 5);
            if(sortedStudents.length === 0) {
                topContainer.innerHTML = '<div class="text-slate-400 text-xs italic">Aucune activité cette semaine.</div>';
            } else {
                topContainer.innerHTML = sortedStudents.map(([sid, time], index) => {
                    const student = window.appState.students.find(s => s.id === sid);
                    const name = student ? student.name : sid;
                    return `
                    <div class="flex justify-between items-center text-sm border-b border-slate-50 last:border-0 py-2">
                        <div class="flex items-center gap-3">
                             <div class="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 font-bold text-xs flex items-center justify-center">${index + 1}</div>
                             <span class="text-slate-700 font-bold">${name}</span>
                        </div>
                        <span class="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-500">${this.formatDurationHM(time)}</span>
                    </div>`;
                }).join('');
            }
        }
        
        // CLASSEMENT MENSUEL COMPLET
        const monthlyRankingContainer = document.getElementById('dashboard-monthly-ranking');
        if (monthlyRankingContainer) {
            const sortedMonthly = Object.entries(monthlyStudentStats).sort(([, a], [, b]) => b.total - a.total);
            
            if (sortedMonthly.length === 0) {
                // Affichage d'un message plus explicite si aucune donnée n'est trouvée
                monthlyRankingContainer.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-8 bg-slate-50 rounded-xl border border-slate-100 border-dashed">
                        <i data-lucide="calendar-x" class="w-6 h-6 text-slate-300 mb-2"></i>
                        <p class="text-slate-400 text-xs font-bold uppercase tracking-wider">Aucune activité</p>
                        <p class="text-slate-300 text-[10px] mt-1">Aucune session enregistrée pour ${selectedDate.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</p>
                    </div>`;
            } else {
                monthlyRankingContainer.innerHTML = sortedMonthly.map(([sid, stats], index) => {
                    const student = window.appState.students.find(s => s.id === sid);
                    const name = student ? student.name : sid;
                    let rankColor = "bg-slate-100 text-slate-500";
                    if(index === 0) rankColor = "bg-yellow-100 text-yellow-600";
                    if(index === 1) rankColor = "bg-slate-200 text-slate-600";
                    if(index === 2) rankColor = "bg-orange-100 text-orange-600";

                    return `
                    <div class="flex justify-between items-center text-sm bg-slate-50 p-2 rounded-lg border border-slate-100 hover:bg-white hover:shadow-sm transition-all">
                        <div class="flex items-center gap-3">
                             <div class="w-6 h-6 rounded-full ${rankColor} font-bold text-xs flex items-center justify-center shrink-0">${index + 1}</div>
                             <div class="flex flex-col">
                                <span class="text-slate-700 font-bold leading-tight">${name}</span>
                                <span class="text-[10px] text-slate-400 font-medium">${stats.sessionsCount} session${stats.sessionsCount > 1 ? 's' : ''}</span>
                             </div>
                        </div>
                        <span class="font-mono text-xs font-bold text-indigo-600">${this.formatDurationHM(stats.total)}</span>
                    </div>`;
                }).join('');
            }
            // IMPORTANT: Rafraîchir les icônes après insertion HTML
            if (window.lucide) window.lucide.createIcons();
        }

        // --- GRAPHIQUE ---
        const ctx = document.getElementById('mainChart');
        if (ctx && window.Chart) {
            if (window.myChart instanceof Chart) window.myChart.destroy();
            let labels = [];
            let dataPoints = [];
            
            // Si on est en mode MOIS : On affiche tous les jours du mois sélectionné
            if (window.appState.chartMode === 'month') {
                const daysInMonth = new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
                for(let i=1; i<=daysInMonth; i++) {
                     labels.push(i); 
                     const dayStr = i.toString().padStart(2, '0');
                     const dateStr = `${selectedMonthPrefix}-${dayStr}`;
                     
                     const sess = window.appState.sessions.find(s => s.id === dateStr);
                     let val = 0;
                     if(sess) {
                         Object.values(sess.results).forEach(r => {
                             const t = r.total || 0;
                             if (t > 0) val += t;
                         });
                     }
                     dataPoints.push(Math.floor(val/60)); 
                }
            } else {
                // Mode SEMAINE (Temps Réel)
                const datesToChart = [...last7Days].reverse();
                datesToChart.forEach(dateStr => {
                     const [y, m, d] = dateStr.split('-');
                     const dateObj = new Date(y, m-1, d);
                     labels.push(dateObj.toLocaleDateString('fr-FR', { weekday: 'short' }));

                     const sess = window.appState.sessions.find(s => s.id === dateStr);
                     let val = 0;
                     if(sess) {
                         Object.values(sess.results).forEach(r => {
                             const t = r.total || 0;
                             if (t > 0) val += t;
                         });
                     }
                     dataPoints.push(Math.floor(val/60));
                });
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
                        barThickness: window.appState.chartMode === 'week' ? 20 : 6
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
            container.innerHTML = `<div class="text-center py-10 text-slate-300">Aucune session enregistrée pour le ${targetDate}.</div>`;
            return;
        }
        
        if (!window.appState.students || window.appState.students.length === 0) {
            container.innerHTML = `<div class="text-center py-10 text-slate-300">Liste d'élèves vide.</div>`;
            return;
        }

        const html = window.appState.students.map(s => {
            const res = session.results[s.id] || { total: 0 };
            const isZero = res.total === 0;
            return `
            <div class="bg-white p-3 rounded-xl border ${isZero ? 'border-slate-100 opacity-60' : 'border-indigo-100'} flex justify-between items-center shadow-sm">
                <span class="font-bold text-slate-700 text-sm">${s.name}</span>
                <span class="font-mono font-bold ${isZero ? 'text-slate-400 bg-slate-50' : 'text-indigo-600 bg-indigo-50'} px-2 py-1 rounded text-xs">
                    ${this.formatDurationHM(res.total)}
                </span>
            </div>`;
        }).join('');

        container.innerHTML = html || `<div class="text-center py-10 text-slate-300">Aucune activité enregistrée ce jour-là.</div>`;
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