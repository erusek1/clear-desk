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
      // frontend/src/components/specialized/EmployeeCaseManager.tsx (continued)

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

  // Filter cases based on search term
  const filteredCases = useMemo(() => {
    if (!searchTerm.trim() || !cases.length) {
      return cases;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return cases.filter(
      caseItem => 
        caseItem.name.toLowerCase().includes(searchLower) ||
        caseItem.employeeName.toLowerCase().includes(searchLower)
    );
  }, [cases, searchTerm]);

  // Handle selecting a case
  const handleCaseSelect = useCallback((caseId: string) => {
    setSelectedCaseId(caseId);
    setSearchTerm('');
    
    // Pre-fill template form with case ID
    setTemplateFormData(prev => ({
      ...prev,
      caseId
    }));
  }, []);

  // Handle search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  // Handle create form input change
  const handleCreateFormChange = useCallback((field: string, value: string) => {
    setCreateFormData(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  // Handle create form submission
  const handleCreateFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!createFormData.name.trim()) {
      toast.error('Please enter a case name');
      return;
    }
    
    if (!createFormData.employeeId) {
      toast.error('Please select an employee');
      return;
    }
    
    createCaseMutation.mutate(createFormData);
  }, [createFormData, createCaseMutation]);

  // Handle template form submission
  const handleTemplateFormSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!templateFormData.templateId) {
      toast.error('Please select a template');
      return;
    }
    
    if (!templateFormData.caseId) {
      toast.error('Please select a case');
      return;
    }
    
    applyTemplateMutation.mutate(templateFormData);
  }, [templateFormData, applyTemplateMutation]);

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
            Error loading employee cases: {casesError instanceof Error ? casesError.message : 'Unknown error'}
          </span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-white shadow-md ${className}`}>
      <CardHeader>
        <div className="flex items-start justify-between">
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
                Create Case
              </Button>
            </DialogTrigger>
            
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Material Case</DialogTitle>
              </DialogHeader>
              
              <form onSubmit={handleCreateFormSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="caseName" className="text-sm font-medium">
                    Case Name
                  </label>
                  <Input
                    id="caseName"
                    value={createFormData.name}
                    onChange={(e) => handleCreateFormChange('name', e.target.value)}
                    placeholder="Enter case name"
                    required
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="employee" className="text-sm font-medium">
                    Employee
                  </label>
                  <Select
                    value={createFormData.employeeId}
                    onValueChange={(value) => handleCreateFormChange('employeeId', value)}
                  >
                    <SelectTrigger id="employee">
                      <SelectValue placeholder="Select employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* This would typically be populated from an API */}
                      <SelectItem value="emp1">John Doe</SelectItem>
                      <SelectItem value="emp2">Jane Smith</SelectItem>
                      <SelectItem value="emp3">Mike Johnson</SelectItem>
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
        <Tabs className="mb-6" value={selectedCaseId || 'none'}>
          <div className="flex justify-between items-center mb-4">
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <Input
                placeholder="Search cases..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-10"
                aria-label="Search cases"
              />
            </div>
            
            {selectedCaseId && (
              <Dialog open={templateFormOpen} onOpenChange={setTemplateFormOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <ArrowRight className="h-4 w-4 mr-2" aria-hidden="true" />
                    Apply Template
                  </Button>
                </DialogTrigger>
                
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Apply Template to Case</DialogTitle>
                  </DialogHeader>
                  
                  <form onSubmit={handleTemplateFormSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="templateSelect" className="text-sm font-medium">
                        Template
                      </label>
                      <Select
                        value={templateFormData.templateId}
                        onValueChange={(value) => setTemplateFormData(prev => ({
                          ...prev,
                          templateId: value
                        }))}
                      >
                        <SelectTrigger id="templateSelect">
                          <SelectValue placeholder="Select template" />
                        </SelectTrigger>
                        <SelectContent>
                          {isLoadingTemplates ? (
                            <div className="flex items-center justify-center p-2">
                              <Spinner size="sm" aria-hidden="true" />
                              <span className="ml-2">Loading...</span>
                            </div>
                          ) : templates.length === 0 ? (
                            <div className="p-2 text-center text-gray-500">
                              No templates found
                            </div>
                          ) : (
                            templates.map(template => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex justify-end mt-4">
                      <Button
                        type="submit"
                        variant="primary"
                        disabled={
                          applyTemplateMutation.isLoading ||
                          !templateFormData.templateId
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
            )}
          </div>
          
          <TabsList className="w-full flex overflow-x-auto pb-1">
            {filteredCases.length === 0 ? (
              <TabsTrigger value="none" disabled className="flex-shrink-0">
                No Cases Found
              </TabsTrigger>
            ) : (
              filteredCases.map(caseItem => (
                <TabsTrigger
                  key={caseItem.id}
                  value={caseItem.id}
                  className="flex-shrink-0"
                  onClick={() => handleCaseSelect(caseItem.id)}
                >
                  {caseItem.name} ({caseItem.employeeName})
                </TabsTrigger>
              ))
            )}
          </TabsList>
          
          {/* Case details and inventory */}
          {selectedCaseId ? (
            isLoadingSelectedCase ? (
              <div className="flex justify-center items-center py-10">
                <Spinner size="lg" aria-hidden="true" />
                <span className="ml-2">Loading case details...</span>
              </div>
            ) : selectedCaseError ? (
              <div className="flex justify-center items-center py-10 text-red-500">
                <AlertCircle className="mr-2" aria-hidden="true" />
                <span>
                  Error loading case details: {selectedCaseError instanceof Error ? selectedCaseError.message : 'Unknown error'}
                </span>
              </div>
            ) : !selectedCase ? (
              <div className="py-10 text-center">
                <Package className="h-16 w-16 mx-auto text-gray-400 mb-4" aria-hidden="true" />
                <h3 className="text-lg font-medium mb-2">Case Not Found</h3>
                <p className="text-gray-500">
                  The selected case could not be found.
                </p>
              </div>
            ) : (
              <div className="mt-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">
                    {selectedCase.name} - {selectedCase.employeeName}
                  </h3>
                  
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4 mr-2" aria-hidden="true" />
                      Edit Case
                    </Button>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                      Add Item
                    </Button>
                  </div>
                </div>
                
                {selectedCase.items.length === 0 ? (
                  <div className="py-10 text-center border rounded">
                    <Package className="h-16 w-16 mx-auto text-gray-400 mb-4" aria-hidden="true" />
                    <h3 className="text-lg font-medium mb-2">No Items in Case</h3>
                    <p className="text-gray-500 mb-4">
                      This case doesn't have any items yet.
                    </p>
                    <Button variant="outline">
                      <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                      Add Item
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Material</TableHead>
                          <TableHead className="w-32 text-right">Quantity</TableHead>
                          <TableHead className="w-32 text-right">Min. Quantity</TableHead>
                          <TableHead className="w-24 text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedCase.items.map(item => (
                          <TableRow key={item.id} className={
                            item.minQuantity && item.quantity < item.minQuantity ? 'bg-red-50' : ''
                          }>
                            <TableCell>{item.materialName}</TableCell>
                            <TableCell className="text-right">{item.quantity}</TableCell>
                            <TableCell className="text-right">{item.minQuantity || '-'}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  aria-label={`Edit ${item.materialName}`}
                                >
                                  <Edit className="h-4 w-4" aria-hidden="true" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  aria-label={`Delete ${item.materialName}`}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )
          ) : (
            <div className="py-10 text-center">
              <Package className="h-16 w-16 mx-auto text-gray-400 mb-4" aria-hidden="true" />
              <h3 className="text-lg font-medium mb-2">
                {filteredCases.length === 0 ? 'No Cases Found' : 'Select a Case'}
              </h3>
              <p className="text-gray-500">
                {filteredCases.length === 0 ? 
                  searchTerm ? 'No cases match your search criteria.' : 'Create a new case to get started.' : 
                  'Please select a case from the tabs above to view its details.'}
              </p>
            </div>
          )}
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default EmployeeCaseManager;