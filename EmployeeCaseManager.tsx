// frontend/src/components/specialized/EmployeeCaseManager.tsx

import React, { useState, useCallback, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from '../common/Card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../common/Tabs';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../common/Select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../common/Dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../common/Table';
import { Spinner } from '../common/Spinner';
import { 
  Package, 
  Plus, 
  Edit, 
  Trash2, 
  ArrowRight, 
  AlertCircle,
  CheckCircle,
  Search
} from 'lucide-react';
import { 
  getCases, 
  createCase, 
  getCase, 
  updateCase, 
  getCaseTemplates,
  applyCaseTemplate 
} from '../../services/employee-case.service';
import { useAuth } from '../../hooks/useAuth';

// Define TypeScript interfaces for better type safety
interface CaseItem {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  minQuantity?: number;
}

interface EmployeeCase {
  id: string;
  name: string;
  employeeId: string;
  employeeName: string;
  items: CaseItem[];
}

interface CaseTemplate {
  id: string;
  name: string;
  description?: string;
  items: {
    materialId: string;
    materialName: string;
    quantity: number;
    minQuantity?: number;
  }[];
}

interface IEmployeeCaseManagerProps {
  companyId: string;
  className?: string;
}

/**
 * Employee case manager component
 * 
 * Allows managing material cases assigned to employees
 */
export const EmployeeCaseManager: React.FC<IEmployeeCaseManagerProps> = ({
  companyId,
  className = '',
}) => {
  // State for active case and forms
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [createFormOpen, setCreateFormOpen] = useState<boolean>(false);
  const [templateFormOpen, setTemplateFormOpen] = useState<boolean>(false);
  const [createFormData, setCreateFormData] = useState({
    name: '',
    employeeId: ''
  });
  const [templateFormData, setTemplateFormData] = useState({
    templateId: '',
    caseId: ''
  });

  // Hooks
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Input validation
  const isValidCompanyId = useMemo(() => 
    typeof companyId === 'string' && companyId.trim() !== '', 
  [companyId]);

  if (!isValidCompanyId) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="py-6">
          <div className="text-red-500 flex items-center justify-center">
            <AlertCircle className="mr-2" aria-hidden="true" />
            <span>Invalid company ID provided</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Query for fetching employee cases
  const { 
    data: cases = [], 
    isLoading: isLoadingCases,
    error: casesError
  } = useQuery<EmployeeCase[], Error>(
    ['employeeCases', companyId],
    async () => {
      try {
        return await getCases(companyId);
      } catch (error) {
        console.error('Error fetching employee cases:', error);
        throw error instanceof Error ? error : new Error('Unknown error fetching cases');
      }
    },
    {
      refetchOnWindowFocus: false,
      retry: 1,
      onError: (error) => {
        console.error('Error in cases query:', error);
      }
    }
  );

  // Query for fetching case templates
  const { 
    data: templates = [], 
    isLoading: isLoadingTemplates,
    error: templatesError
  } = useQuery<CaseTemplate[], Error>(
    ['caseTemplates', companyId],
    async () => {
      try {
        return await getCaseTemplates(companyId);
      } catch (error) {
        console.error('Error fetching case templates:', error);
        throw error instanceof Error ? error : new Error('Unknown error fetching templates');
      }
    },
    {
      refetchOnWindowFocus: false,
      retry: 1,
      onError: (error) => {
        console.error('Error in templates query:', error);
      }
    }
  );

  // Query for fetching selected case details
  const {
    data: selectedCase,
    isLoading: isLoadingSelectedCase,
    error: selectedCaseError
  } = useQuery<EmployeeCase, Error>(
    ['employeeCase', selectedCaseId],
    async () => {
      try {
        if (!selectedCaseId) {
          throw new Error('No case selected');
        }
        
        return await getCase(selectedCaseId);
      } catch (error) {
        console.error('Error fetching case details:', error);
        throw error instanceof Error ? error : new Error('Unknown error fetching case details');
      }
    },
    {
      enabled: !!selectedCaseId,
      refetchOnWindowFocus: false,
      retry: 1,
      onError: (error) => {
        console.error('Error in selected case query:', error);
      }
    }
  );

  // Mutation for creating a new case
  const createCaseMutation = useMutation<EmployeeCase, Error, typeof createFormData>(
    async (data) => {
      try {
        if (!data.name || !data.employeeId) {
          throw new Error('Name and employee are required');
        }
        
        return await createCase(companyId, data.name, data.employeeId);
      } catch (error) {
        console.error('Error creating case:', error);
        throw error instanceof Error ? error : new Error('Unknown error creating case');
      }
    },
    {
      onSuccess: (data) => {
        toast.success('Case created successfully');
        queryClient.invalidateQueries(['employeeCases', companyId]);
        setCreateFormOpen(false);
        setSelectedCaseId(data.id);
        setCreateFormData({
          name: '',
          employeeId: ''
        });
      },
      onError: (error) => {
        toast.error(`Failed to create case: ${error.message || 'Unknown error'}`);
      }
    }
  );

  // Mutation for applying a template to a case
  const applyTemplateMutation = useMutation<EmployeeCase, Error, typeof templateFormData>(
    async (data) => {
      try {
        if (!data.templateId || !data.caseId) {
          throw new Error('Template and case are required');
        }
        
        return await applyCaseTemplate(data.caseId, data.templateId);
      } catch (error) {
        console.error('Error applying template:', error);
        throw error instanceof Error ? error : new Error('Unknown error applying template');
      }
    },
    {
      onSuccess: (data) => {
        toast.success('Template applied successfully');
        queryClient.invalidateQueries(['employeeCase', data.id]);
        setTemplateFormOpen(false);
        setTemplateFormData({
          templateId: '',
          caseId: ''
        });
      },
      onError: (error) => {
        toast.error(`Failed to apply template: ${error.message || 'Unknown error'}`);
      }