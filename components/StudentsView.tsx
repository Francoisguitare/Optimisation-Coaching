import React, { useState } from 'react';
import { Student } from '../types';
import { storageService } from '../services/storageService';
import { Button } from './ui/Button';
import { Trash2, UserPlus, Search } from 'lucide-react';
import { Modal } from './ui/Modal';

interface StudentsViewProps {
  students: Student[];
  onStudentsChange: () => void;
}

export const StudentsView: React.FC<StudentsViewProps> = ({ students, onStudentsChange }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');

  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddStudent = async () => {
    if (!newStudentName.trim()) return;
    await storageService.addStudent(newStudentName.trim());
    setNewStudentName('');
    setIsAddModalOpen(false);
    onStudentsChange();
  };

  const handleDeleteStudent = async (id: string) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer cet élève ?')) {
      await storageService.deleteStudent(id);
      onStudentsChange();
    }
  };

  return (
    <div className="h-full bg-gray-50 p-4 md:p-8 animate-in fade-in duration-300 flex flex-col">
      <div className="max-w-4xl mx-auto w-full flex-1 flex flex-col">
        
        <div className="flex flex-col md:flex-row justify-between items-end md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">Liste des Élèves</h2>
            <p className="text-gray-500 text-sm">Gérez votre classe et ajoutez de nouveaux participants.</p>
          </div>
          <Button onClick={() => setIsAddModalOpen(true)} className="w-full md:w-auto">
            <UserPlus size={18} className="mr-2" />
            Nouvel Élève
          </Button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-2 mb-4 flex items-center gap-2">
          <Search className="text-gray-400 ml-2" size={20} />
          <input 
            type="text" 
            placeholder="Rechercher un élève..." 
            className="flex-1 p-2 outline-none text-gray-700 placeholder-gray-400"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 flex-1 overflow-hidden flex flex-col">
          <div className="overflow-y-auto custom-scrollbar flex-1 p-2">
            {filteredStudents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 py-12">
                <p>Aucun élève trouvé.</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredStudents.map(student => (
                  <div key={student.id} className="flex justify-between items-center p-4 hover:bg-gray-50 rounded-xl group transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold">
                        {student.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-gray-700">{student.name}</span>
                    </div>
                    <button 
                      onClick={() => handleDeleteStudent(student.id)}
                      className="text-gray-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                      title="Supprimer"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-4 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 text-center">
            {filteredStudents.length} élèves affichés
          </div>
        </div>
      </div>

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Ajouter un élève">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
            <input 
              type="text" 
              className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              placeholder="Ex: Jean Dupont"
              value={newStudentName}
              onChange={(e) => setNewStudentName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddStudent()}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setIsAddModalOpen(false)}>Annuler</Button>
            <Button onClick={handleAddStudent}>Créer</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};