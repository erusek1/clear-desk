// frontend/src/pages/dashboard/DashboardPage.tsx

import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Clipboard, 
  FileText, 
  Package, 
  Calendar, 
  Clock, 
  AlertCircle,
  Plus
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Spinner } from '../../components/common/Spinner';

// Mock data for initial UI development
const mockProjects = [
  { id: '1', name: 'Smith Residence', status: 'In Progress', phase: 'Rough', dueDate: '2025-04-15' },
  { id: '2', name: 'Johnson Commercial', status: 'Pending Estimate', phase: 'Pre-Construction', dueDate: '2025-04-01' },
  { id: '3', name: 'Park Avenue Renovation', status: 'Approved', phase: 'Planning', dueDate: '2025-05-10' },
];

const mockTasks = [
  { id: '1', title: 'Review Smith blueprint', project: 'Smith Residence', dueDate: '2025-03-20', priority: 'High' },
  { id: '2', name: 'Order materials for Johnson', project: 'Johnson Commercial', dueDate: '2025-03-22', priority: 'Medium' },
  { id: '3', name: 'Schedule rough inspection', project: 'Park Avenue Renovation', dueDate: '2025-03-25', priority: 'Low' },
];

const DashboardPage = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  
  // Simulate data loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setProjects(mockProjects);
      setTasks(mockTasks);
      setLoading(false);
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Welcome, {user?.firstName || 'User'}
          </h1>
          <p className="text-gray-600">
            Here's what's happening with your projects today.
          </p>
        </div>
        <Link
          to="/projects/new"
          className="flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="mr-2 h-4 w-4" />
          New Project
        </Link>
      </div>

      {/* Stats overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100 text-blue-500">
              <Clipboard className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Active Projects</p>
              <p className="text-2xl font-semibold text-gray-900">{mockProjects.length}</p>
            </div>
          </div>
        </div>
        
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-100 text-green-500">
              <FileText className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pending Estimates</p>
              <p className="text-2xl font-semibold text-gray-900">2</p>
            </div>
          </div>
        </div>
        
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-100 text-purple-500">
              <Package className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Material Orders</p>
              <p className="text-2xl font-semibold text-gray-900">4</p>
            </div>
          </div>
        </div>
        
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-red-100 text-red-500">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Overdue Tasks</p>
              <p className="text-2xl font-semibold text-gray-900">1</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent projects */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent Projects</h2>
          <Link
            to="/projects"
            className="text-sm font-medium text-primary hover:text-primary/80"
          >
            View all
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Project Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Phase
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  Due Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {mockProjects.map((project) => (
                <tr key={project.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-6 py-4">
                    <Link
                      to={`/projects/${project.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {project.name}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {project.status}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {project.phase}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {new Date(project.dueDate).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upcoming tasks */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Upcoming Tasks</h2>
          <Link
            to="/tasks"
            className="text-sm font-medium text-primary hover:text-primary/80"
          >
            View all
          </Link>
        </div>
        
        <div className="space-y-3">
          {mockTasks.map((task) => (
            <div key={task.id} className="flex items-center rounded-md border border-gray-200 p-4 hover:bg-gray-50">
              <div className="mr-4 flex-shrink-0">
                {task.priority === 'High' ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-500">
                    <AlertCircle className="h-4 w-4" />
                  </div>
                ) : task.priority === 'Medium' ? (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-yellow-100 text-yellow-500">
                    <Clock className="h-4 w-4" />
                  </div>
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-500">
                    <Calendar className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-gray-900">{task.title || task.name}</p>
                <p className="text-sm text-gray-600">{task.project} • Due {new Date(task.dueDate).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;