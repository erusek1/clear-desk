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
  applyCaseTemplate,
  addCaseItem,
  updateCaseItem,
  removeCaseItem
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
  
  // State for item management
  const [addItemFormOpen, setAddItemFormOpen] = useState<boolean>(false);
  const [addItemFormData, setAddItemFormData] = useState({
    materialId: '',
    quantity: 1
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
    }
  );
  
  // Mutation for adding a new item to a case
  const addItemMutation = useMutation<
    EmployeeCase, 
    Error, 
    {caseId: string, materialId: string, quantity: number}
  >(
    async ({caseId, materialId, quantity}) => {
      try {
        if (!caseId || !materialId || quantity <= 0) {
          throw new Error('Case, material, and quantity are required');
        }
        
        return await addCaseItem(caseId, materialId, quantity);
      } catch (error) {
        console.error('Error adding item:', error);
        throw error instanceof Error ? error : new Error('Unknown error adding item');
      }
    },
    {
      onSuccess: (data) => {
        toast.success('Item added successfully');
        queryClient.invalidateQueries(['employeeCase', data.id]);
        setAddItemFormOpen(false);
        setAddItemFormData({
          materialId: '',
          quantity: 1
        });
      },
      onError: (error) => {
        toast.error(`Failed to add item: ${error.message || 'Unknown error'}`);
      }
    }
  );
  
  // Mutation for updating an item quantity
  const updateItemMutation = useMutation<
    EmployeeCase,
    Error,
    {caseId: string, itemId: string, quantity: number}
  >(
    async ({caseId, itemId, quantity}) => {
      try {
        if (!caseId || !itemId || quantity < 0) {
          throw new Error('Invalid parameters');
        }
        
        return await updateCaseItem(caseId, itemId, quantity);
      } catch (error) {
        console.error('Error updating item:', error);
        throw error instanceof Error ? error : new Error('Unknown error updating item');
      }
    },
    {
      onSuccess: (data) => {
        toast.success('Item updated successfully');
        queryClient.invalidateQueries(['employeeCase', data.id]);
      },
      onError: (error) => {
        toast.error(`Failed to update item: ${error.message || 'Unknown error'}`);
      }
    }
  );
  
  // Mutation for removing an item
  const removeItemMutation = useMutation<
    EmployeeCase,
    Error,
    {caseId: string, itemId: string}
  >(
    async ({caseId, itemId}) => {
      try {
        if (!caseId || !itemId) {
          throw new Error('Case and item IDs are required');
        }
        
        return await removeCaseItem(caseId, itemId);
      } catch (error) {
        console.error('Error removing item:', error);
        throw error instanceof Error ? error : new Error('Unknown error removing item');
      }
    },
    {
      onSuccess: (data) => {
        toast.success('Item removed successfully');
        queryClient.invalidateQueries(['employeeCase', data.id]);
      },
      onError: (error) => {
        toast.error(`Failed to remove item: ${error.message || 'Unknown error'}`);
      }
    }
  );

  // Filter cases based on search term
  const filteredCases = useMemo(() => {
    if (!searchTerm.trim() || !cases.length) {
      return cases;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return cases.filter(caseItem => 
      caseItem.name.toLowerCase().includes(searchLower) ||
      caseItem.employeeName.toLowerCase().includes(searchLower)
    );
  }, [cases, searchTerm]);

  // Handle search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  // Handle creating a new case
  const handleCreateCase = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!createFormData.name || !createFormData.employeeId) {
      toast.error('Name and employee are required');
      return;
    }
    
    createCaseMutation.mutate(createFormData);
  }, [createFormData, createCaseMutation]);

  // Handle applying a template
  const handleApplyTemplate = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!templateFormData.templateId || !templateFormData.caseId) {
      toast.error('Template and case are required');
      return;
    }
    
    applyTemplateMutation.mutate(templateFormData);
  }, [templateFormData, applyTemplateMutation]);
  
  // Handle adding a new item
  const handleAddItem = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedCaseId || !addItemFormData.materialId || addItemFormData.quantity <= 0) {
      toast.error('Material and quantity are required');
      return;
    }
    
    addItemMutation.mutate({
      caseId: selectedCaseId,
      materialId: addItemFormData.materialId,
      quantity: addItemFormData.quantity
    });
  }, [selectedCaseId, addItemFormData, addItemMutation]);
  
  // Handle updating an item quantity
  const handleUpdateItemQuantity = useCallback((itemId: string, quantity: number) => {
    if (!selectedCaseId || !itemId || quantity < 0) {
      toast.error('Invalid item or quantity');
      return;
    }
    
    updateItemMutation.mutate({
      caseId: selectedCaseId,
      itemId,
      quantity
    });
  }, [selectedCaseId, updateItemMutation]);
  
  // Handle removing an item
  const handleRemoveItem = useCallback((itemId: string) => {
    if (!selectedCaseId || !itemId) {
      toast.error('Invalid item');
      return;
    }
    
    if (confirm('Are you sure you want to remove this item?')) {
      removeItemMutation.mutate({
        caseId: selectedCaseId,
        itemId
      });
    }
  }, [selectedCaseId, removeItemMutation]);

  // Show loading state
  if (isLoadingCases) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="flex justify-center items-center py-10">
          <Spinner size="lg" aria-hidden="true" />
          <span className="ml-2">Loading employee cases...</span>
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (casesError) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="flex justify-center items-center py-10 text-red-500">
          <AlertCircle className="mr-2" aria-hidden="true" />
          <span>
            Error loading cases: {casesError instanceof Error ? casesError.message : 'Unknown error'}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-white shadow-md ${className}`}>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Employee Material Cases</CardTitle>
            <CardDescription>
              Manage material cases assigned to employees
            </CardDescription>
          </div>
          
          <Dialog open={createFormOpen} onOpenChange={setCreateFormOpen}>
            <DialogTrigger asChild>
              <Button variant="primary">
                <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                New Case
              </Button>
            </DialogTrigger>
            
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Material Case</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleCreateCase} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="caseName" className="text-sm font-medium">
                    Case Name
                  </label>
                  <Input
                    id="caseName"
                    placeholder="Enter case name"
                    value={createFormData.name}
                    onChange={(e) => setCreateFormData({
                      ...createFormData,
                      name: e.target.value
                    })}
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="employee" className="text-sm font-medium">
                    Employee
                  </label>
                  <Select
                    value={createFormData.employeeId}
                    onValueChange={(value) => setCreateFormData({
                      ...createFormData,
                      employeeId: value
                    })}
                  >
                    <SelectTrigger id="employee">
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Replace with actual employee data */}
                      <SelectItem value="employee1">John Doe</SelectItem>
                      <SelectItem value="employee2">Jane Smith</SelectItem>
                      <SelectItem value="employee3">Bob Johnson</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex justify-end mt-4">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={createCaseMutation.isLoading}
                  >
                    {createCaseMutation.isLoading ? (
                      <>
                        <Spinner className="mr-2" size="sm" aria-hidden="true" />
                        Creating...
                      </>
                    ) : (
                      'Create Case'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Search and filters */}
        <div className="flex gap-4 mb-6">
          <div className="relative flex-grow">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
            <Input
              placeholder="Search cases..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10"
              aria-label="Search cases"
            />
          </div>
          
          <Dialog open={templateFormOpen} onOpenChange={setTemplateFormOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={!selectedCaseId}>
                <ArrowRight className="h-4 w-4 mr-2" aria-hidden="true" />
                Apply Template
              </Button>
            </DialogTrigger>
            
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Apply Template to Case</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleApplyTemplate} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="templateSelect" className="text-sm font-medium">
                    Select Template
                  </label>
                  <Select
                    value={templateFormData.templateId}
                    onValueChange={(value) => setTemplateFormData({
                      ...templateFormData,
                      templateId: value,
                      caseId: selectedCaseId
                    })}
                  >
                    <SelectTrigger id="templateSelect">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingTemplates ? (
                        <SelectItem value="loading" disabled>
                          Loading templates...
                        </SelectItem>
                      ) : templates.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No templates available
                        </SelectItem>
                      ) : (
                        templates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {templateFormData.templateId && (
                    <p className="text-xs text-gray-500 mt-1">
                      {templates.find(t => t.id === templateFormData.templateId)?.description || 
                       'This template will add standard items to the selected case.'}
                    </p>
                  )}
                </div>
                
                <div className="flex justify-end mt-4">
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={
                      applyTemplateMutation.isLoading ||
                      !templateFormData.templateId ||
                      !selectedCaseId
                    }
                  >
                    {applyTemplateMutation.isLoading ? (
                      <>
                        <Spinner className="mr-2" size="sm" aria-hidden="true" />
                        Applying...
                      </>
                    ) : (
                      'Apply Template'
                    )}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
