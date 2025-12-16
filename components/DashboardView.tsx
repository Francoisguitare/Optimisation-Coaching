import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DashboardFilter, Session, Student } from '../types';
import { storageService } from '../services/storageService';
import { Clock, TrendingUp, Trophy } from 'lucide-react';

interface DashboardViewProps {
  students: Student[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({ students }) => {
  const [filter, setFilter] = useState<DashboardFilter>('daily');
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    storageService.getAllSessions().then(setSessions);
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    // Filter sessions based on time range
    const filteredSessions = sessions.filter(s => {
      const sessionDate = s.id.split('_')[0]; // Assuming ID starts with YYYY-MM-DD
      
      if (filter === 'daily') {
        return sessionDate === todayStr;
      } else if (filter === 'weekly') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        return sessionDate >= d.toISOString().split('T')[0];
      } else {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 1);
        return sessionDate >= d.toISOString().split('T')[0];
      }
    });

    // Aggregate data per student
    const agg: Record<string, number> = {};
    filteredSessions.forEach(session => {
      Object.entries(session.results).forEach(([studentId, result]) => {
        agg[studentId] = (agg[studentId] || 0) + result.total;
      });
    });

    // Transform to array for chart/table
    const data = Object.keys(agg).map(id => {
      const student = students.find(s => s.id === id);
      return {
        id,
        name: student?.name || 'Inconnu',
        seconds: agg[id],
        formattedTime: formatHours(agg[id])
      };
    }).sort((a, b) => b.seconds - a.seconds);

    const totalSeconds = data.reduce((acc, curr) => acc + curr.seconds, 0);
    const averageSeconds = data.length ? Math.floor(totalSeconds / data.length) : 0;
    const topStudent = data.length > 0 ? data[0] : null;

    return { data, totalSeconds, averageSeconds, topStudent };
  }, [sessions, filter, students]);

  function formatHours(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    const sec = s % 60;
    return `${m}m ${sec}s`;
  }

  function formatTime(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header & Filter */}
        <div className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl border border-gray-200 shadow-sm gap-4">
          <h2 className="font-bold text-xl text-gray-800 flex items-center gap-2">
            <TrendingUp className="text-indigo-600" />
            Analyses
          </h2>
          <div className="flex bg-gray-100 p-1 rounded-xl">
            {(['daily', 'weekly', 'monthly'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === f 
                    ? 'bg-white text-indigo-600 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                }`}
              >
                {f === 'daily' ? "Aujourd'hui" : f === 'weekly' ? 'Hebdo' : 'Mensuel'}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-700 text-white p-6 rounded-2xl shadow-xl shadow-indigo-200">
            <div className="flex justify-between items-start mb-4">
              <div className="bg-white/20 p-2 rounded-lg"><Clock size={20} /></div>
              <span className="text-indigo-100 text-xs font-medium uppercase tracking-wider">Total</span>
            </div>
            <h3 className="text-4xl font-bold">{formatHours(stats.totalSeconds)}</h3>
            <p className="text-indigo-200 text-sm mt-1">Temps de parole cumulé</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-start mb-4">
               <div className="bg-orange-100 text-orange-600 p-2 rounded-lg"><TrendingUp size={20} /></div>
               <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Moyenne</span>
            </div>
            <h3 className="text-3xl font-bold text-gray-800">{formatTime(stats.averageSeconds)}</h3>
            <p className="text-gray-500 text-sm mt-1">Par élève actif</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-start mb-4">
               <div className="bg-yellow-100 text-yellow-600 p-2 rounded-lg"><Trophy size={20} /></div>
               <span className="text-gray-400 text-xs font-medium uppercase tracking-wider">Top Orateur</span>
            </div>
            <h3 className="text-2xl font-bold text-gray-800 truncate" title={stats.topStudent?.name}>
              {stats.topStudent?.name || '-'}
            </h3>
            <p className="text-indigo-500 font-mono font-medium mt-1">
              {stats.topStudent ? formatTime(stats.topStudent.seconds) : '00:00'}
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
          <h3 className="text-gray-500 text-sm font-semibold uppercase tracking-wider mb-6">Répartition du temps</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.data.slice(0, 10)}>
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#9CA3AF', fontSize: 12}} 
                  dy={10}
                />
                <Tooltip 
                  cursor={{fill: '#F3F4F6'}}
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="seconds" radius={[6, 6, 0, 0]}>
                  {stats.data.slice(0, 10).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#4F46E5' : '#818CF8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 font-semibold text-gray-500 uppercase text-xs">Rang</th>
                <th className="px-6 py-4 font-semibold text-gray-500 uppercase text-xs">Nom de l'élève</th>
                <th className="px-6 py-4 font-semibold text-gray-500 uppercase text-xs text-right">Temps</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.data.map((s, i) => (
                <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 text-gray-400 font-mono w-16">{i + 1}</td>
                  <td className="px-6 py-4 font-medium text-gray-700">{s.name}</td>
                  <td className="px-6 py-4 text-right font-mono text-indigo-600 font-bold">{formatTime(s.seconds)}</td>
                </tr>
              ))}
              {stats.data.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-gray-400">Aucune donnée disponible pour cette période</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};