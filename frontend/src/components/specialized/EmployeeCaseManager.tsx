// frontend/src/components/specialized/EmployeeCaseManager.tsx

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent,
  CardFooter
} from '../common/Card';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';
import { Input } from '../common/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../common/Select';
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from '../common/Table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../common/Dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../common/Tabs';
import { Label } from '../common/Label';
import { Badge } from '../common/Badge';
import { Textarea } from '../common/Textarea';
import { 
  AlertCircle, 
  Box, 
  Check, 
  Clipboard, 
  FileText, 
  Package, 
  PenLine, 
  Plus, 
  Search, 
  Trash2, 
  User, 
  UserCircle,
  Users
} from 'lucide-react';
import { 
  getEmployeeCases, 
  getCaseDetails, 
  createCase,
  updateCaseInventory,
  applyCaseTemplate,
  getCaseTemplates
} from '../../services/employee-case.service';
import { getCompanyEmployees } from '../../services/user.service';
import { getInventoryItems } from '../../services/inventory.service';
import { useAuth } from '../../hooks/useAuth';

interface IEmployeeCaseManagerProps {
  /** Company ID */
  companyId: string;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Employee material case manager component
 * 
 * Manages packouts and material sets assigned to employees
 */
export const EmployeeCaseManager: React.FC<IEmployeeCaseManagerProps> = ({
  companyId,
  className = '',
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState('cases');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // State for new case dialog
  const [newCaseDialogOpen, setNewCaseDialogOpen] = useState(false);
  const [newCaseName, setNewCaseName] = useState('');
  const [newCaseEmployee, setNewCaseEmployee] = useState('');
  const [newCaseDescription, setNewCaseDescription] = useState('');
  const [newCaseTemplate, setNewCaseTemplate] = useState('');
  
  // State for add material dialog
  const [addMaterialDialogOpen, setAddMaterialDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<string>('');
  const [materialQuantity, setMaterialQuantity] = useState(1);
  const [materialNotes, setMaterialNotes] = useState('');
  
  // State for template dialog
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [replaceExisting, setReplaceExisting] = useState(false);
  
  // Query for employees
  const { 
    data: employees = [],
    isLoading: isLoadingEmployees
  } = useQuery(
    ['employees', companyId],
    () => getCompanyEmployees(companyId),
    {
      onSuccess: (data) => {
        if (data.length > 0 && !selectedEmployeeId) {
          setSelectedEmployeeId(data[0].id);
        }
      }
    }
  );
  
  // Query for employee cases
  const {
    data: cases = [],
    isLoading: isLoadingCases,
    isError: isCasesError
  } = useQuery(
    ['employee-cases', companyId, selectedEmployeeId, searchTerm],
    () => getEmployeeCases(companyId, {
      employeeId: selectedEmployeeId || undefined,
      search: searchTerm || undefined
    }),
    {
      keepPreviousData: true,
    }
  );
  
  // Query for case details
  const {
    data: caseDetails,
    isLoading: isLoadingCaseDetails,
    isError: isCaseDetailsError
  } = useQuery(
    ['case-details', selectedCaseId],
    () => getCaseDetails(selectedCaseId),
    {
      enabled: !!selectedCaseId,
    }
  );
  
  // Query for inventory items
  const {
    data: inventoryItems = [],
    isLoading: isLoadingInventory
  } = useQuery(
    ['inventory-items', companyId],
    () => getInventoryItems(companyId),
    {
      enabled: addMaterialDialogOpen,
    }
  );
  
  // Query for case templates
  const {
    data: templates = [],
    isLoading: isLoadingTemplates
  } = useQuery(
    ['case-templates', companyId],
    () => getCaseTemplates(companyId),
    {
      enabled: newCaseDialogOpen || templateDialogOpen,
    }
  );
  
  // Mutation for creating a new case
  const createCaseMutation = useMutation(
    (data: { 
      name: string; 
      employeeId: string; 
      description?: string;
      templateId?: string;
    }) => createCase(
      companyId,
      data.name,
      data.employeeId,
      data.description,
      data.templateId
    ),
    {
      onSuccess: (data) => {
        toast.success('Employee case created successfully');
        queryClient.invalidateQueries(['employee-cases', companyId]);
        setNewCaseDialogOpen(false);
        resetNewCaseForm();
        setSelectedCaseId(data.caseId);
      },
      onError: (error: any) => {
        toast.error(`Failed to create case: ${error.message || 'Unknown error'}`);
      },
    }
  );
  
  // Mutation for updating case inventory
  const updateInventoryMutation = useMutation(
    (data: { 
      materialId: string; 
      quantity: number; 
      notes?: string;
      operation: 'add' | 'update' | 'remove';
    }) => updateCaseInventory(
      selectedCaseId,
      [{
        materialId: data.materialId,
        quantity: data.quantity,
        notes: data.notes
      }],
      data.operation
    ),
    {
      onSuccess: () => {
        toast.success('Case inventory updated successfully');
        queryClient.invalidateQueries(['case-details', selectedCaseId]);
        setAddMaterialDialogOpen(false);
        resetAddMaterialForm();
      },
      onError: (error: any) => {
        toast.error(`Failed to update case: ${error.message || 'Unknown error'}`);
      },
    }
  );
  
  // Mutation for applying template
  const applyTemplateMutation = useMutation(
    (data: { 
      templateId: string; 
      replaceExisting: boolean;
    }) => applyCaseTemplate(
      selectedCaseId,
      data.templateId,
      data.replaceExisting
    ),
    {
      onSuccess: () => {
        toast.success('Template applied successfully');
        queryClient.invalidateQueries(['case-details', selectedCaseId]);
        setTemplateDialogOpen(false);
        resetTemplateForm();
      },
      onError: (error: any) => {
        toast.error(`Failed to apply template: ${error.message || 'Unknown error'}`);
      },
    }
  );
  
  // Reset new case form
  const resetNewCaseForm = () => {
    setNewCaseName('');
    setNewCaseEmployee('');
    setNewCaseDescription('');
    setNewCaseTemplate('');
  };
  
  // Reset add material form
  const resetAddMaterialForm = () => {
    setSelectedMaterial('');
    setMaterialQuantity(1);
    setMaterialNotes('');
  };
  
  // Reset template form
  const resetTemplateForm = () => {
    setSelectedTemplate('');
    setReplaceExisting(false);
  };
  
  // Handle new case form submit
  const handleNewCaseSubmit = () => {
    if (!newCaseName || !newCaseEmployee) {
      toast.error('Case name and employee are required');
      return;
    }
    
    createCaseMutation.mutate({
      name: newCaseName,
      employeeId: newCaseEmployee,
      description: newCaseDescription || undefined,
      templateId: newCaseTemplate || undefined
    });
  };
  
  // Handle add material form submit
  const handleAddMaterialSubmit = () => {
    if (!selectedMaterial || materialQuantity <= 0) {
      toast.error('Material and quantity are required');
      return;
    }
    
    updateInventoryMutation.mutate({
      materialId: selectedMaterial,
      quantity: materialQuantity,
      notes: materialNotes || undefined,
      operation: 'add'
    });
  };
  
  // Handle template form submit
  const handleTemplateSubmit = () => {
    if (!selectedTemplate) {
      toast.error('Please select a template');
      return;
    }
    
    applyTemplateMutation.mutate({
      templateId: selectedTemplate,
      replaceExisting
    });
  };
  
  // Handle remove material
  const handleRemoveMaterial = (materialId: string) => {
    updateInventoryMutation.mutate({
      materialId,
      quantity: 0,
      operation: 'remove'
    });
  };
  
  // Get employee name
  const getEmployeeName = (employeeId: string) => {
    const employee = employees.find((e: any) => e.id === employeeId);
    return employee ? `${employee.firstName} ${employee.lastName}` : 'Unknown Employee';
  };
  
  return (
    <Card className={`bg-white shadow-md ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Employee Material Cases</CardTitle>
            <CardDescription>
              Manage packouts and material sets assigned to employees
            </CardDescription>
          </div>
          
          <Button 
            variant="primary"
            onClick={() => setNewCaseDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Case
          </Button>
        </div>
      </CardHeader>
      
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <div className="px-6 pt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cases" className="flex items-center">
              <Box className="h-4 w-4 mr-2" />
              Material Cases
            </TabsTrigger>
            
            <TabsTrigger value="employees" className="flex items-center">
              <Users className="h-4 w-4 mr-2" />
              By Employee
            </TabsTrigger>
          </TabsList>
        </div>
        
        {/* Cases Tab */}
        <TabsContent value="cases" className="pt-4 px-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex-grow max-w-md">
              <div className="relative">
                <Search className="absolute left-2 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search cases..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <Select 
              value={selectedEmployeeId} 
              onValueChange={setSelectedEmployeeId}
            >
              <SelectTrigger className="w-52">
                <SelectValue placeholder="Filter by employee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Employees</SelectItem>
                {employees.map((employee: any) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.firstName} {employee.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Cases List */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {isLoadingCases ? (
              <div className="flex justify-center items-center py-8 col-span-full">
                <Spinner size="lg" />
                <span className="ml-2">Loading cases...</span>
              </div>
            ) : isCasesError ? (
              <div className="flex justify-center items-center py-8 text-red-500 col-span-full">
                <AlertCircle className="h-5 w-5 mr-2" />
                Error loading cases
              </div>
            ) : cases.length === 0 ? (
              <div className="text-center py-8 text-gray-500 col-span-full">
                No cases found matching your filters
                <div className="mt-2">
                  <Button 
                    variant="outline"
                    onClick={() => setNewCaseDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Case
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {cases.map((caseItem: any) => (
                  <Card 
                    key={caseItem.caseId} 
                    className={`border hover:border-blue-300 transition-colors cursor-pointer ${selectedCaseId === caseItem.caseId ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}
                    onClick={() => setSelectedCaseId(caseItem.caseId)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">{caseItem.name}</CardTitle>
                      <CardDescription className="flex items-center text-xs">
                        <UserCircle className="h-3 w-3 mr-1" />
                        {getEmployeeName(caseItem.employeeId)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="text-sm">
                        <div className="mb-1">
                          <Badge variant="secondary" className="mr-1">
                            {caseItem.itemCount} items
                          </Badge>
                          {caseItem.template && (
                            <Badge variant="outline">
                              Template
                            </Badge>
                          )}
                        </div>
                        {caseItem.description && (
                          <p className="text-gray-500 text-xs line-clamp-2">
                            {caseItem.description}
                          </p>
                        )}
                      </div>
                    </CardContent>
                    <CardFooter className="text-xs text-gray-500">
                      Last updated: {new Date(caseItem.updated).toLocaleDateString()}
                    </CardFooter>
                  </Card>
                ))}
              </>
            )}
          </div>
          
          {/* Case Details */}
          {selectedCaseId && (
            <div className="mt-6 border-t pt-4">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-medium">Case Details</h3>
                {caseDetails && (
                  <div className="flex space-x-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setTemplateDialogOpen(true)}
                    >
                      <Clipboard className="h-4 w-4 mr-1" />
                      Apply Template
                    </Button>
                    <Button 
                      variant="primary" 
                      size="sm"
                      onClick={() => setAddMaterialDialogOpen(true)}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Material
                    </Button>
                  </div>
                )}
              </div>
              
              {isLoadingCaseDetails ? (
                <div className="flex justify-center py-8">
                  <Spinner size="lg" />
                  <span className="ml-2">Loading case details...</span>
                </div>
              ) : isCaseDetailsError ? (
                <div className="flex justify-center py-8 text-red-500">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Error loading case details
                </div>
              ) : caseDetails ? (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <h4 className="text-sm font-medium mb-1">Case Information</h4>
                      <div className="bg-gray-50 p-3 rounded">
                        <div className="grid grid-cols-3 gap-y-2 text-sm">
                          <div className="text-gray-500">Name:</div>
                          <div className="col-span-2 font-medium">{caseDetails.name}</div>
                          
                          <div className="text-gray-500">Employee:</div>
                          <div className="col-span-2">{getEmployeeName(caseDetails.employeeId)}</div>
                          
                          <div className="text-gray-500">Created:</div>
                          <div className="col-span-2">{new Date(caseDetails.created).toLocaleDateString()}</div>
                          
                          <div className="text-gray-500">Updated:</div>
                          <div className="col-span-2">{new Date(caseDetails.updated).toLocaleDateString()}</div>
                          
                          {caseDetails.description && (
                            <>
                              <div className="text-gray-500">Description:</div>
                              <div className="col-span-2">{caseDetails.description}</div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="text-sm font-medium mb-1">Case Contents</h4>
                      <div className="bg-gray-50 p-3 rounded">
                        <div className="grid grid-cols-3 gap-y-2 text-sm">
                          <div className="text-gray-500">Total Items:</div>
                          <div className="col-span-2 font-medium">{caseDetails.items?.length || 0} unique items</div>
                          
                          <div className="text-gray-500">Total Quantity:</div>
                          <div className="col-span-2 font-medium">
                            {caseDetails.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0} units
                          </div>
                          
                          <div className="text-gray-500">Categories:</div>
                          <div className="col-span-2">
                            {Array.from(new Set(caseDetails.items?.map((item: any) => item.category) || [])).join(', ') || 'None'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Materials Table */}
                  <h4 className="text-sm font-medium mb-2">Materials</h4>
                  {caseDetails.items?.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 border border-dashed rounded">
                      No materials in this case
                      <div className="mt-2">
                        <Button 
                          variant="outline"
                          onClick={() => setAddMaterialDialogOpen(true)}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add Materials
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>SKU</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead className="text-right">Quantity</TableHead>
                            <TableHead>Notes</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {caseDetails.items?.map((item: any) => (
                            <TableRow key={item.materialId}>
                              <TableCell className="font-mono">{item.sku}</TableCell>
                              <TableCell className="font-medium">{item.name}</TableCell>
                              <TableCell>{item.category}</TableCell>
                              <TableCell className="text-right font-medium">
                                {item.quantity} {item.unitOfMeasure}
                              </TableCell>
                              <TableCell>{item.notes || '-'}</TableCell>
                              <TableCell className="text-right space-x-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedMaterial(item.materialId);
                                    setMaterialQuantity(item.quantity);
                                    setMaterialNotes(item.notes || '');
                                    setAddMaterialDialogOpen(true);
                                  }}
                                  title="Edit Quantity"
                                >
                                  <PenLine className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (window.confirm(`Remove ${item.name} from this case?`)) {
                                      handleRemoveMaterial(item.materialId);
                                    }
                                  }}
                                  className="text-red-500"
                                  title="Remove Material"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </TabsContent>
        
        {/* Employees Tab */}
        <TabsContent value="employees" className="pt-4 px-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isLoadingEmployees ? (
              <div className="flex justify-center items-center py-8 col-span-full">
                <Spinner size="lg" />
                <span className="ml-2">Loading employees...</span>
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-8 text-gray-500 col-span-full">
                No employees found
              </div>
            ) : (
              <>
                {employees.map((employee: any) => {
                  const employeeCases = cases.filter((c: any) => c.employeeId === employee.id);
                  
                  return (
                    <Card key={employee.id} className="border hover:border-blue-200 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center">
                          <UserCircle className="h-5 w-5 mr-2" />
                          {employee.firstName} {employee.lastName}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {employee.role} · {employee.email}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <h4 className="text-sm font-medium mb-2">Material Cases</h4>
                        {employeeCases.length === 0 ? (
                          <div className="text-center py-2 text-xs text-gray-500 border border-dashed rounded">
                            No cases assigned
                          </div>
                        ) : (
                          <ul className="space-y-2">
                            {employeeCases.map((caseItem: any) => (
                              <li 
                                key={caseItem.caseId}
                                className="p-2 bg-gray-50 rounded text-sm hover:bg-gray-100 cursor-pointer"
                                onClick={() => {
                                  setSelectedCaseId(caseItem.caseId);
                                  setSelectedTab('cases');
                                }}
                              >
                                <div className="font-medium">{caseItem.name}</div>
                                <div className="text-xs text-gray-500 flex justify-between mt-1">
                                  <span>{caseItem.itemCount} items</span>
                                  <span>{new Date(caseItem.updated).toLocaleDateString()}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </CardContent>
                      <CardFooter>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="w-full"
                          onClick={() => {
                            setNewCaseEmployee(employee.id);
                            setNewCaseDialogOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add Case
                        </Button>
                      </CardFooter>
                    </Card>
                  );
                })}
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
      
      {/* New Case Dialog */}
      <Dialog open={newCaseDialogOpen} onOpenChange={setNewCaseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Material Case</DialogTitle>
            <DialogDescription>
              Assign a new material case or packout to an employee
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="caseName">Case Name</Label>
              <Input
                id="caseName"
                value={newCaseName}
                onChange={e => setNewCaseName(e.target.value)}
                placeholder="e.g., Main Packout, Service Kit"
              />
            </div>
            
            <div>
              <Label htmlFor="employee">Employee</Label>
              <Select value={newCaseEmployee} onValueChange={setNewCaseEmployee}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingEmployees ? (
                    <SelectItem value="loading" disabled>
                      Loading employees...
                    </SelectItem>
                  ) : (
                    employees.map((employee: any) => (
                      <SelectItem key={employee.id} value={employee.id}>
                        {employee.firstName} {employee.lastName}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                value={newCaseDescription}
                onChange={e => setNewCaseDescription(e.target.value)}
                placeholder="Describe the purpose of this case"
              />
            </div>
            
            <div>
              <Label htmlFor="template">Template (Optional)</Label>
              <Select value={newCaseTemplate} onValueChange={setNewCaseTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Apply a template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Template</SelectItem>
                  {isLoadingTemplates ? (
                    <SelectItem value="loading" disabled>
                      Loading templates...
                    </SelectItem>
                  ) : (
                    templates.map((template: any) => (
                      <SelectItem key={template.templateId} value={template.templateId}>
                        {template.name} ({template.itemCount} items)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Templates will pre-populate the case with common materials
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setNewCaseDialogOpen(false)}
              disabled={createCaseMutation.isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary"
              onClick={handleNewCaseSubmit}
              disabled={createCaseMutation.isLoading || !newCaseName || !newCaseEmployee}
            >
              {createCaseMutation.isLoading ? (
                <>
                  <Spinner className="mr-2" size="sm" />
                  Creating...
                </>
              ) : (
                'Create Case'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Add Material Dialog */}
      <Dialog open={addMaterialDialogOpen} onOpenChange={setAddMaterialDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedMaterial ? 'Update Material Quantity' : 'Add Material to Case'}
            </DialogTitle>
            <DialogDescription>
              {selectedMaterial ? 
                'Change the quantity of this material in the case' : 
                'Add a new material to this employee case'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {!selectedMaterial && (
              <div>
                <Label htmlFor="material">Material</Label>
                <Select onValueChange={setSelectedMaterial}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingInventory ? (
                      <SelectItem value="loading" disabled>
                        Loading materials...
                      </SelectItem>
                    ) : (
                      inventoryItems.map((item: any) => (
                        <SelectItem key={item.materialId} value={item.materialId}>
                          {item.name} ({item.currentQuantity} {item.unitOfMeasure} available)
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div>
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                value={materialQuantity}
                onChange={e => setMaterialQuantity(parseInt(e.target.value) || 0)}
                min={1}
              />
            </div>
            
            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input
                id="notes"
                value={materialNotes}
                onChange={e => setMaterialNotes(e.target.value)}
                placeholder="Add notes about this material"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setAddMaterialDialogOpen(false)}
              disabled={updateInventoryMutation.isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary"
              onClick={handleAddMaterialSubmit}
              disabled={
                updateInventoryMutation.isLoading || 
                !selectedMaterial || 
                materialQuantity <= 0
              }
            >
              {updateInventoryMutation.isLoading ? (
                <>
                  <Spinner className="mr-2" size="sm" />
                  Updating...
                </>
              ) : (
                selectedMaterial ? 'Update Material' : 'Add Material'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Apply Template Dialog */}
      <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply Template</DialogTitle>
            <DialogDescription>
              Apply a pre-defined template to this case
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="template">Template</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingTemplates ? (
                    <SelectItem value="loading" disabled>
                      Loading templates...
                    </SelectItem>
                  ) : (
                    templates.map((template: any) => (
                      <SelectItem key={template.templateId} value={template.templateId}>
                        {template.name} ({template.itemCount} items)
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-start space-x-2">
              <div className="pt-1">
                <input
                  type="checkbox"
                  id="replaceExisting"
                  checked={replaceExisting}
                  onChange={e => setReplaceExisting(e.target.checked)}
                />
              </div>
              <div>
                <Label htmlFor="replaceExisting">Replace existing materials</Label>
                <p className="text-xs text-gray-500">
                  If checked, this will remove all existing materials before applying the template.
                  If unchecked, template materials will be added to existing materials.
                </p>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setTemplateDialogOpen(false)}
              disabled={applyTemplateMutation.isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary"
              onClick={handleTemplateSubmit}
              disabled={applyTemplateMutation.isLoading || !selectedTemplate}
            >
              {applyTemplateMutation.isLoading ? (
                <>
                  <Spinner className="mr-2" size="sm" />
                  Applying...
                </>
              ) : (
                'Apply Template'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default EmployeeCaseManager;