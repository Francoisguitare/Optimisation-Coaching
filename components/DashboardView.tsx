import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts';
import { Session, Student, SessionResult } from '../types';
import { storageService } from '../services/storageService';
import { Clock, TrendingUp, Trophy, Calendar, Target, Zap, Medal } from 'lucide-react';

interface DashboardViewProps {
  students: Student[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({ students }) => {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    storageService.getAllSessions().then(setSessions);
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    
    const getFilteredStats = (days: number) => {
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - days);
      const startDateStr = startDate.toISOString().split('T')[0];

      const filtered = sessions.filter(s => s.id.split('_')[0] >= startDateStr);
      
      const agg: Record<string, number> = {};
      const activeDates = new Set<string>();

      filtered.forEach(session => {
        let sessionHasData = false;
        Object.entries(session.results).forEach(([studentId, result]) => {
          const res = result as SessionResult;
          if (res.total > 0) {
            agg[studentId] = (agg[studentId] || 0) + res.total;
            sessionHasData = true;
          }
        });
        if (sessionHasData) activeDates.add(session.id.split('_')[0]);
      });

      const totalSeconds = Object.values(agg).reduce((a, b) => a + b, 0);
      return { totalSeconds, activeDays: activeDates.size, studentAgg: agg };
    };

    const week = getFilteredStats(7);
    const month = getFilteredStats(30);

    // Goal: 10 hours per week (36000s)
    const weeklyGoal = 36000; 
    const progressValue = Math.min(100, (week.totalSeconds / weeklyGoal) * 100);
    
    // Coach Level Logic
    let level = "Coach Espoir";
    let levelColor = "text-blue-500 bg-blue-50 border-blue-100";
    if (month.totalSeconds > 180000) { 
      level = "Coach Élite"; 
      levelColor = "text-purple-600 bg-purple-50 border-purple-100"; 
    } else if (month.totalSeconds > 90000) { 
      level = "Coach Expert"; 
      levelColor = "text-indigo-600 bg-indigo-50 border-indigo-100"; 
    } else if (month.totalSeconds > 36000) { 
      level = "Coach Confirmé"; 
      levelColor = "text-emerald-600 bg-emerald-50 border-emerald-100"; 
    }

    const tableData = Object.keys(month.studentAgg).map(id => {
      const student = students.find(s => s.id === id);
      return {
        id,
        name: student?.name || 'Inconnu',
        seconds: month.studentAgg[id],
      };
    }).sort((a, b) => b.seconds - a.seconds);

    return { week, month, progress: progressValue, level, levelColor, tableData };
  }, [sessions, students]);

  const formatHours = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  const gaugeData = [
    { value: stats.progress, fill: '#4F46E5' },
    { value: 100 - stats.progress, fill: '#F1F5F9' }
  ];

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-4 md:p-8 animate-in custom-scrollbar">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header Hero */}
        <div className="flex flex-col md:flex-row gap-6">
          <div className="flex-1 bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col md:flex-row items-center gap-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-5">
              <Target size={120} className="text-indigo-600" />
            </div>

            {/* Circle Progress */}
            <div className="relative w-36 h-36 shrink-0">
               <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={gaugeData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={65}
                      startAngle={225}
                      endAngle={-45}
                      dataKey="value"
                      stroke="none"
                    />
                  </PieChart>
               </ResponsiveContainer>
               <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-black text-slate-800">{Math.round(stats.progress)}%</span>
                  <span className="text-[9px] uppercase font-bold text-slate-400">Objectif</span>
               </div>
            </div>

            <div className="flex-1 text-center md:text-left z-10">
              <div className="flex items-center justify-center md:justify-start gap-2 mb-3">
                 <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${stats.levelColor}`}>
                    {stats.level}
                 </span>
                 <Zap size={14} className="text-yellow-400 fill-current" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-1">Coach Dashboard</h2>
              <div className="text-slate-500 text-sm">
                Vous avez coaché <span className="font-bold text-indigo-600">{formatHours(stats.week.totalSeconds)}</span> sur <span className="font-bold text-slate-700">{stats.week.activeDays} jours actifs</span> cette semaine.
              </div>
              
              <div className="mt-5 flex gap-4 justify-center md:justify-start">
                 <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Moyenne / Jour Actif</p>
                    <div className="text-lg font-mono font-bold text-slate-700">
                        {stats.week.activeDays > 0 ? formatHours(stats.week.totalSeconds / stats.week.activeDays) : '0s'}
                    </div>
                 </div>
              </div>
            </div>
          </div>

          <div className="md:w-72 space-y-4">
             <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-5 rounded-[2rem] text-white shadow-xl shadow-indigo-100">
                <Calendar size={18} className="text-indigo-200 mb-4" />
                <h3 className="text-2xl font-black mb-0.5">{formatHours(stats.month.totalSeconds)}</h3>
                <p className="text-indigo-100/70 text-[10px] uppercase font-bold tracking-widest">Cumul 30 jours</p>
             </div>
             
             <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-sm">
                <Medal size={18} className="text-yellow-500 mb-4" />
                <h3 className="text-lg font-bold text-slate-800 truncate mb-0.5">
                    {stats.tableData[0]?.name || "-"}
                </h3>
                <p className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Top Performance</p>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-6 text-sm">
               <TrendingUp size={16} className="text-indigo-600" />
               Répartition par élève (30j)
            </h3>
            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.tableData.slice(0, 8)}>
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{fill: '#94A3B8', fontSize: 10, fontWeight: 600}} 
                      dy={10}
                    />
                    <Tooltip 
                      cursor={{fill: '#F8FAFC', radius: 8}}
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px'}}
                    />
                    <Bar dataKey="seconds" radius={[6, 6, 6, 6]} barSize={30}>
                      {stats.tableData.slice(0, 8).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={index === 0 ? '#4F46E5' : '#818CF8'} fillOpacity={1 - (index * 0.1)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-50 flex items-center justify-between">
               <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  <Trophy size={16} className="text-orange-500" />
                  Classement
               </h3>
               <span className="text-[10px] font-bold text-slate-400">30 JOURS</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
               {stats.tableData.length === 0 ? (
                 <div className="text-center py-10 text-slate-300 text-xs">Aucune donnée enregistrée</div>
               ) : (
                 <div className="space-y-1">
                   {stats.tableData.map((s, i) => (
                     <div key={s.id || i} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-colors group">
                        <div className="flex items-center gap-3">
                           <span className={`w-5 text-[10px] font-black ${i < 3 ? 'text-indigo-600' : 'text-slate-300'}`}>
                              {i + 1}
                           </span>
                           <span className="text-xs font-semibold text-slate-700 truncate max-w-[100px]">
                              {s.name}
                           </span>
                        </div>
                        <span className="font-mono text-[10px] font-bold text-slate-400">
                           {formatTime(s.seconds)}
                        </span>
                     </div>
                   ))}
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};