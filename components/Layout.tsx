import React from 'react';
import { ViewType } from '../types';
import { Timer, PieChart, History, Users } from 'lucide-react';

interface LayoutProps {
  currentView: ViewType;
  onViewChange: (view: ViewType) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ currentView, onViewChange, children }) => {
  const NavButton = ({ view, label, icon: Icon }: { view: ViewType, label: string, icon: any }) => (
    <button
      onClick={() => onViewChange(view)}
      className={`flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
        currentView === view
          ? 'bg-white text-indigo-600 shadow-sm'
          : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
      }`}
    >
      <Icon size={16} className="mr-2" />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center shadow-sm z-30 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-indigo-600 to-indigo-500 text-white p-2 rounded-lg shadow-md shadow-indigo-200">
            <Timer size={20} />
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight text-slate-800 hidden md:block">
              Chrono-Track <span className="text-indigo-600">Ultimate</span>
            </h1>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <p className="text-xs text-gray-500 font-medium">En ligne</p>
            </div>
          </div>
        </div>

        <div className="flex bg-gray-100/80 p-1 rounded-xl overflow-x-auto no-scrollbar gap-1">
          <NavButton view="live" label="Live" icon={Timer} />
          <NavButton view="dashboard" label="Stats" icon={PieChart} />
          <NavButton view="history" label="Historique" icon={History} />
          <NavButton view="students" label="Élèves" icon={Users} />
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>
    </div>
  );
};