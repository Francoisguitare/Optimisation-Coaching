import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- GLOBAL STATE ---
window.appState = {
    view: 'stats',
    students: [],
    sessions: [],
    currentSessionId: new Date().toISOString().split('T')[0],
    activeTimes: {},
    chartMode: 'week',
    db: null,
    auth: null,
    isFirebaseReady: false,
    lastError: null
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

    return { students: students || [], sessions: sessions || [] };
}

// --- APP LOGIC ---
window.app = {
    async init() {
        // 1. Load Local Data First
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

        // 2. Initial Render
        this.navigate('stats');
        if (window.lucide) window.lucide.createIcons();
        
        // 3. Status Debug Click
        const statusContainer = document.getElementById('sync-status-text').parentElement;
        if(statusContainer) {
            statusContainer.style.cursor = 'pointer';
            statusContainer.onclick = () => this.retryConnection();
        }

        // 4. Connect Firebase
        await this.connectFirebase();

        // 5. Start Tick
        setInterval(() => { this.tick(); }, 1000);
    },

    async connectFirebase() {
        if (!window.FIREBASE_CONFIG || !window.FIREBASE_CONFIG.apiKey) {
            console.warn("Firebase Config missing.");
            this.updateSyncStatus('error', "CONFIG MANQUANTE");
            return;
        }

        if (window.location.protocol === 'file:') {
            this.updateSyncStatus('offline', "MODE FICHIER (OFFLINE)");
            // On ne bloque pas l'appli, mais on prévient
            return;
        }

        try {
            this.updateSyncStatus('syncing');
            
            // Initialize only if not already done
            if (!window.appState.db) {
                const fbApp = initializeApp(window.FIREBASE_CONFIG);
                window.appState.db = getFirestore(fbApp);
                window.appState.auth = getAuth(fbApp);
            }

            // Auth Listener
            onAuthStateChanged(window.appState.auth, async (user) => {
                if (user) {
                    console.log("🔒 Secured Connection Established (UID: " + user.uid + ")");
                    window.appState.isFirebaseReady = true;
                    this.updateSyncStatus('online');
                    await this.syncFromFirebase(true); 
                } else {
                    window.appState.isFirebaseReady = false;
                }
            });

            // Trigger Login
            await signInAnonymously(window.appState.auth);

        } catch (e) {
            console.error("Firebase Init Error:", e);
            window.appState.lastError = e;
            
            let shortError = "ERREUR";
            if (e.code === 'auth/operation-not-allowed') {
                shortError = "ACTIVER AUTH !"; // Message spécifique
                alert("ATTENTION : Vous devez activer l'authentification ANONYME dans la console Firebase (Menu Authentication > Sign-in method).");
            }
            else if (e.code === 'auth/network-request-failed') shortError = "PAS D'INTERNET";
            else if (e.message && e.message.includes("domain")) shortError = "DOMAINE NON AUTORISÉ";
            
            this.updateSyncStatus('error', shortError);
        }
    },

    async retryConnection() {
        if (window.appState.isFirebaseReady) {
            alert("Tout fonctionne ! Vous êtes connecté et synchronisé.");
        } else if (window.appState.lastError) {
            const e = window.appState.lastError;
            alert(`ERREUR DÉTECTÉE :\n\nCode: ${e.code || 'Inconnu'}\nMessage: ${e.message}\n\nSOLUTIONS:\n1. Activez "Anonyme" dans Firebase Authentication.\n2. Ajoutez votre IP/Domaine dans Firebase Auth Settings.`);
            this.connectFirebase();
        } else {
            alert("Mode Fichier détecté. Utilisez un serveur local (Live Server) pour synchroniser.");
            this.connectFirebase();
        }
    },

    tick() {
        const activeIds = Object.keys(window.appState.activeTimes);
        if (activeIds.length > 0) {
            activeIds.forEach(sid => { this.updateStudentSessionTime(sid); });
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

    saveLocal() {
        localStorage.setItem('chrono_track_students', JSON.stringify(window.appState.students));
        localStorage.setItem('chrono_track_sessions', JSON.stringify(window.appState.sessions));
        
        if (window.appState.isFirebaseReady) {
            this.saveToFirebase();
        }
    },

    async saveToFirebase() {
        if (!window.appState.db || !window.appState.isFirebaseReady) return;
        this.updateSyncStatus('syncing');
        try {
            await setDoc(doc(window.appState.db, "data", "students"), { list: window.appState.students });
            await setDoc(doc(window.appState.db, "data", "sessions"), { list: window.appState.sessions });
            this.updateSyncStatus('online');
        } catch (e) {
            console.error(e);
            this.updateSyncStatus('error', "ERREUR SAUVEGARDE");
            window.appState.lastError = e;
        }
    },

    async syncFromFirebase(forceUpdate = false) {
        if (!window.appState.db || !window.appState.isFirebaseReady) return;
        try {
            const snapStudents = await getDoc(doc(window.appState.db, "data", "students"));
            const snapSessions = await getDoc(doc(window.appState.db, "data", "sessions"));
            
            let hasChanges = false;

            if (snapStudents.exists()) {
                const remoteList = snapStudents.data().list || [];
                if (forceUpdate || remoteList.length > 0) {
                     window.appState.students = remoteList;
                     hasChanges = true;
                }
            }

            if (snapSessions.exists()) {
                const remoteSessions = snapSessions.data().list || [];
                if (forceUpdate || remoteSessions.length > 0) {
                    window.appState.sessions = remoteSessions;
                    hasChanges = true;
                }
            }

            if (hasChanges) {
                console.log("📥 Data synchronized from cloud");
                this.saveLocal();
                this.navigate(window.appState.view);
            }

        } catch (e) { 
            console.error("Sync Error:", e);
            window.appState.lastError = e;
            if(e.code === 'permission-denied') {
                this.updateSyncStatus('error', "RÈGLES REFUSÉES");
            }
        }
    },

    updateSyncStatus(status, labelOverride = null) {
        const dot = document.getElementById('sync-status-dot');
        const text = document.getElementById('sync-status-text');
        if (!dot || !text) return;

        if (status === 'online') {
            dot.innerHTML = `<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>`;
            text.innerText = labelOverride || "ONLINE";
            text.className = "text-[10px] text-green-600 font-bold uppercase tracking-wider";
        } else if (status === 'syncing') {
            dot.innerHTML = `<span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>`;
            text.innerText = labelOverride || "CONNEXION...";
            text.className = "text-[10px] text-blue-600 font-bold uppercase tracking-wider";
        } else if (status === 'error') {
            dot.innerHTML = `<span class="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>`;
            text.innerText = labelOverride || "ERREUR (cliquer)";
            text.className = "text-[10px] text-red-500 font-bold uppercase tracking-wider cursor-pointer underline";
        } else {
            dot.innerHTML = `<span class="relative inline-flex rounded-full h-2 w-2 bg-slate-400"></span>`;
            text.innerText = labelOverride || "LOCAL (cliquer)";
            text.className = "text-[10px] text-slate-400 font-bold uppercase tracking-wider cursor-pointer";
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
    },

    deleteStudent(id) {
        if (!confirm("Supprimer ?")) return;
        window.appState.students = window.appState.students.filter(s => s.id !== id);
        this.saveLocal();
        this.renderStudents();
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

    resetStudentSession(studentId) {
        if(!confirm("Réinitialiser le temps de cet élève pour cette session ?")) return;
        if (window.appState.activeTimes[studentId]) delete window.appState.activeTimes[studentId];

        const session = window.appState.sessions.find(s => s.id === window.appState.currentSessionId);
        if(session && session.results[studentId]) {
            session.results[studentId] = { total: 0, passages: [] };
            this.saveLocal();
            this.renderLive();
        }
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
            let passages = res.passages ? [...res.passages] : [0];
            if (passages.length === 0) passages = [0];
            passages[passages.length - 1] += elapsed;

            session.results[studentId] = { total: newTotal, passages: passages };
            window.appState.activeTimes[studentId] = now;
            localStorage.setItem('chrono_track_sessions', JSON.stringify(window.appState.sessions));
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
        const totalLiveEl = document.getElementById('live-total-time');
        if(totalLiveEl) {
             let totalSec = 0;
             Object.values(session.results).forEach(r => totalSec += (r.total || 0));
             totalLiveEl.innerText = this.formatTime(totalSec);
        }
    },

    renderLive() {
        const container = document.getElementById('live-list');
        const dateEl = document.getElementById('live-session-date');
        if(dateEl) dateEl.innerText = new Date().toLocaleDateString('fr-FR');

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
                    <button onclick="window.app.toggleTimer('${s.id}')" class="timer-btn h-8 w-8 rounded-full border border-slate-200 flex items-center justify-center shadow-sm transition-all ${isActive ? '' : 'bg-white text-slate-600'}">
                        <i data-lucide="${isActive ? 'pause' : 'play'}" class="w-3 h-3 ml-0.5"></i>
                    </button>
                    <button onclick="window.app.resetStudentSession('${s.id}')" class="h-8 w-8 rounded-lg bg-red-50 text-red-400 flex items-center justify-center hover:bg-red-100 transition-colors ml-1">
                        <i data-lucide="trash-2" class="w-3 h-3"></i>
                    </button>
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
            <div class="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                <div class="flex items-center gap-3">
                    <div class="h-8 w-8 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center font-bold text-xs">
                        ${s.name.charAt(0)}
                    </div>
                    <span class="font-bold text-slate-700 text-sm">${s.name}</span>
                </div>
                <button onclick="window.app.deleteStudent('${s.id}')" class="text-slate-300 hover:text-red-500 transition-colors p-2">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
    },

    toggleChart(mode) {
        window.appState.chartMode = mode;
        const btnWeek = document.getElementById('chart-btn-week');
        const btnMonth = document.getElementById('chart-btn-month');
        
        if(mode === 'week') {
            btnWeek.className = "px-3 py-1 rounded bg-white text-indigo-600 shadow-sm transition-all";
            btnMonth.className = "px-3 py-1 rounded text-slate-500 hover:bg-white/50 transition-all";
        } else {
            btnWeek.className = "px-3 py-1 rounded text-slate-500 hover:bg-white/50 transition-all";
            btnMonth.className = "px-3 py-1 rounded bg-white text-indigo-600 shadow-sm transition-all";
        }
        this.renderStats();
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
    
    formatTime(s) {
        if (!s) return "00:00";
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return (m<10?"0"+m:m) + ":" + (sec<10?"0"+sec:sec);
    },

    renderStats() {
        const today = new Date().toISOString().split('T')[0];
        const now = new Date();
        const oneWeekAgo = new Date(); oneWeekAgo.setDate(now.getDate() - 7);
        const currentMonthPrefix = today.substring(0, 7); 

        let dailyTotal = 0;
        let weeklyTotal = 0;
        let monthlyTotal = 0;
        let weeklyStudentTimes = {}; 
        let weeklyActiveCountSet = new Set();
        let monthlyActiveCountSet = new Set();
        const allStudentTimes = {};

        window.appState.sessions.forEach(sess => {
            const sDate = new Date(sess.id);
            let sessTotal = 0;
            const isThisWeek = (sDate >= oneWeekAgo && sDate <= now);
            const isThisMonth = sess.id.startsWith(currentMonthPrefix);

            Object.entries(sess.results).forEach(([sid, r]) => {
                const t = r.total || 0;
                sessTotal += t;
                if(t > 0) {
                    allStudentTimes[sid] = (allStudentTimes[sid] || 0) + t;
                    if(isThisWeek) {
                         weeklyActiveCountSet.add(sid);
                         weeklyStudentTimes[sid] = (weeklyStudentTimes[sid] || 0) + t;
                    }
                    if(isThisMonth) monthlyActiveCountSet.add(sid);
                }
            });
            if (sess.id === today) dailyTotal += sessTotal;
            if (isThisMonth) monthlyTotal += sessTotal;
            if (isThisWeek) weeklyTotal += sessTotal;
        });

        const weekActiveCount = weeklyActiveCountSet.size || 1;
        const monthActiveCount = monthlyActiveCountSet.size || 1;
        const avgWeek = weeklyTotal / weekActiveCount;
        const avgMonth = monthlyTotal / monthActiveCount;

        const elDaily = document.getElementById('stat-daily-hours');
        if(elDaily) elDaily.innerText = this.formatDurationHM(dailyTotal);
        const elWeekly = document.getElementById('stat-weekly-hours');
        if(elWeekly) elWeekly.innerText = this.formatDurationHM(weeklyTotal);
        const elMonthly = document.getElementById('stat-monthly-hours');
        if(elMonthly) elMonthly.innerText = this.formatDurationHM(monthlyTotal);
        const elAvgWeek = document.getElementById('stat-avg-week');
        if(elAvgWeek) elAvgWeek.innerText = this.formatDurationMS(avgWeek);
        const elAvgMonth = document.getElementById('stat-avg-month');
        if(elAvgMonth) elAvgMonth.innerText = this.formatDurationMS(avgMonth);
        const elActive = document.getElementById('stat-active-students');
        if(elActive) elActive.innerText = Object.keys(allStudentTimes).length;

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

        const ctx = document.getElementById('mainChart');
        if (ctx && window.Chart) {
            if (window.myChart instanceof Chart) window.myChart.destroy();
            let labels = [];
            let dataPoints = [];
            
            if (window.appState.chartMode === 'week') {
                for(let i=6; i>=0; i--) {
                    const d = new Date(); d.setDate(now.getDate() - i);
                    const dateStr = d.toISOString().split('T')[0];
                    const dayName = d.toLocaleDateString('fr-FR', { weekday: 'short' });
                    labels.push(dayName);
                    const sess = window.appState.sessions.find(s => s.id === dateStr);
                    let val = 0;
                    if(sess) Object.values(sess.results).forEach(r => val += (r.total||0));
                    dataPoints.push(Math.floor(val/60)); 
                }
            } else {
                for(let i=14; i>=0; i--) {
                    const d = new Date(); d.setDate(now.getDate() - i);
                    const dateStr = d.toISOString().split('T')[0];
                    const dayNum = d.getDate();
                    labels.push(dayNum);
                    const sess = window.appState.sessions.find(s => s.id === dateStr);
                    let val = 0;
                    if(sess) Object.values(sess.results).forEach(r => val += (r.total||0));
                    dataPoints.push(Math.floor(val/60));
                }
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
                        barThickness: window.appState.chartMode === 'week' ? 20 : 10
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
            <div class="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center shadow-sm">
                <span class="font-bold text-slate-700 text-sm">${s.name}</span>
                <span class="font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded text-xs">
                    ${this.formatDurationHM(res.total)}
                </span>
            </div>`;
        }).join('') || `<div class="text-center py-10 text-slate-300">Aucune activité ce jour-là.</div>`;
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
