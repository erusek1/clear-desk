// frontend/src/components/specialized/InventoryManager.tsx

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent
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
import { 
  AlertCircle, 
  ArrowUpDown, 
  Download, 
  FileText, 
  Package, 
  Plus, 
  Search, 
  Truck, 
  Upload 
} from 'lucide-react';
import { 
  getInventoryItems, 
  updateInventoryLevel, 
  createPurchaseOrder,
  getMaterialsTakeoff
} from '../../services/inventory.service';
import { useAuth } from '../../hooks/useAuth';

interface IInventoryManagerProps {
  /** Company ID */
  companyId: string;
  /** Optional project ID for project-specific view */
  projectId?: string;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Inventory manager component for maintaining stock levels
 * 
 * Provides inventory tracking, purchase orders, and material takeoffs
 */
export const InventoryManager: React.FC<IInventoryManagerProps> = ({
  companyId,
  projectId,
  className = '',
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentTab, setCurrentTab] = useState('inventory');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showLowStock, setShowLowStock] = useState(false);
  
  // State for adjustment dialog
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [adjustmentType, setAdjustmentType] = useState<string>('purchase');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  
  // State for takeoff view
  const [selectedPhase, setSelectedPhase] = useState<string>('all');
  
  // Query for inventory items
  const { 
    data: inventoryItems = [], 
    isLoading: isLoadingInventory,
    isError: isInventoryError
  } = useQuery(
    ['inventory', companyId, showLowStock, categoryFilter, searchTerm],
    () => getInventoryItems(companyId, { 
      showLowStock, 
      category: categoryFilter !== 'all' ? categoryFilter : undefined,
      search: searchTerm || undefined
    }),
    {
      keepPreviousData: true,
    }
  );
  
  // Query for categories (derived from inventory data)
  const categories = React.useMemo(() => {
    const uniqueCategories = new Set<string>();
    inventoryItems.forEach(item => {
      if (item.category) {
        uniqueCategories.add(item.category);
      }
    });
    return Array.from(uniqueCategories).sort();
  }, [inventoryItems]);
  
  // Query for takeoff if in project context
  const {
    data: takeoffData,
    isLoading: isLoadingTakeoff,
    isError: isTakeoffError
  } = useQuery(
    ['takeoff', projectId, selectedPhase],
    () => getMaterialsTakeoff(projectId!, {
      includeInventory: true,
      includeAllocations: true,
      phase: selectedPhase !== 'all' ? selectedPhase : undefined
    }),
    {
      enabled: !!projectId && currentTab === 'takeoff',
    }
  );
  
  // Mutation for updating inventory level
  const updateInventoryMutation = useMutation(
    (data: { 
      materialId: string; 
      adjustment: number; 
      transactionType: string;
      notes?: string;
    }) => updateInventoryLevel(
      companyId,
      data.materialId,
      data.adjustment,
      data.transactionType,
      {
        projectId,
        notes: data.notes
      }
    ),
    {
      onSuccess: () => {
        toast.success('Inventory updated successfully');
        queryClient.invalidateQueries(['inventory', companyId]);
        setAdjustmentDialogOpen(false);
        resetAdjustmentForm();
      },
      onError: (error: any) => {
        toast.error(`Failed to update inventory: ${error.message || 'Unknown error'}`);
      },
    }
  );
  
  // Reset adjustment form
  const resetAdjustmentForm = () => {
    setSelectedMaterial(null);
    setAdjustmentAmount(0);
    setAdjustmentType('purchase');
    setAdjustmentNotes('');
  };
  
  // Handle adjustment dialog submit
  const handleAdjustmentSubmit = () => {
    if (!selectedMaterial) return;
    
    // Validate adjustment amount
    if (adjustmentAmount === 0) {
      toast.error('Adjustment amount cannot be zero');
      return;
    }
    
    // For certain transaction types, amount must be negative
    let finalAdjustment = adjustmentAmount;
    if (['allocation', 'damage'].includes(adjustmentType) && finalAdjustment > 0) {
      finalAdjustment = -finalAdjustment;
    }
    
    updateInventoryMutation.mutate({
      materialId: selectedMaterial.materialId,
      adjustment: finalAdjustment,
      transactionType: adjustmentType,
      notes: adjustmentNotes
    });
  };
  
  // Open adjustment dialog for a material
  const openAdjustmentDialog = (material: any, defaultType: string = 'purchase') => {
    setSelectedMaterial(material);
    setAdjustmentAmount(0);
    setAdjustmentType(defaultType);
    setAdjustmentNotes('');
    setAdjustmentDialogOpen(true);
  };
  
  // Filtered inventory items based on search and category
  const filteredItems = inventoryItems;
  
  // Get color for inventory level
  const getStockLevelColor = (item: any) => {
    if (!item.lowStockThreshold) return 'text-gray-600';
    
    const ratio = item.currentQuantity / item.lowStockThreshold;
    if (ratio <= 0.25) return 'text-red-600';
    if (ratio <= 0.75) return 'text-amber-600';
    return 'text-green-600';
  };
  
  return (
    <Card className={`bg-white shadow-md ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Inventory Management</CardTitle>
            <CardDescription>
              Manage materials, stock levels, and purchase orders
            </CardDescription>
          </div>
          
          {!projectId && (
            <Button variant="outline" className="ml-auto mr-2">
              <Upload className="h-4 w-4 mr-2" />
              Import CSV
            </Button>
          )}
          
          <Button variant="primary">
            <Plus className="h-4 w-4 mr-2" />
            Add Material
          </Button>
        </div>
      </CardHeader>
      
      <Tabs value={currentTab} onValueChange={setCurrentTab}>
        <div className="px-6 pt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="inventory" className="flex items-center">
              <Package className="h-4 w-4 mr-2" />
              Inventory
            </TabsTrigger>
            
            <TabsTrigger value="orders" className="flex items-center">
              <FileText className="h-4 w-4 mr-2" />
              Purchase Orders
            </TabsTrigger>
            
            <TabsTrigger 
              value="takeoff" 
              className="flex items-center"
              disabled={!projectId}
            >
              <Download className="h-4 w-4 mr-2" />
              Material Takeoff
            </TabsTrigger>
          </TabsList>
        </div>
        
        {/* Inventory Tab */}
        <TabsContent value="inventory" className="pt-4 px-6">
          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex-grow max-w-md">
              <div className="relative">
                <Search className="absolute left-2 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search materials..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Button 
              variant={showLowStock ? "default" : "outline"} 
              onClick={() => setShowLowStock(!showLowStock)}
              className="flex items-center"
            >
              <AlertCircle className="h-4 w-4 mr-2" />
              Low Stock Only
            </Button>
          </div>
          
          {/* Inventory Table */}
          {isLoadingInventory ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
              <span className="ml-2">Loading inventory...</span>
            </div>
          ) : isInventoryError ? (
            <div className="flex justify-center py-8 text-red-500">
              <AlertCircle className="h-5 w-5 mr-2" />
              Error loading inventory
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No items found matching your filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">In Stock</TableHead>
                    <TableHead className="text-right">Low Stock Threshold</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map(item => (
                    <TableRow key={item.materialId}>
                      <TableCell className="font-mono">{item.sku}</TableCell>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell className={`text-right font-medium ${getStockLevelColor(item)}`}>
                        {item.currentQuantity} {item.unitOfMeasure}
                      </TableCell>
                      <TableCell className="text-right">
                        {item.lowStockThreshold} {item.unitOfMeasure}
                      </TableCell>
                      <TableCell>{item.location || '-'}</TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAdjustmentDialog(item, 'purchase')}
                          title="Add Stock"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openAdjustmentDialog(item, 'allocation')}
                          title="Remove Stock"
                        >
                          <ArrowUpDown className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
        
        {/* Purchase Orders Tab */}
        <TabsContent value="orders" className="pt-4 px-6">
          <div className="text-center py-8 text-gray-500">
            Purchase orders functionality coming soon
          </div>
        </TabsContent>
        
        {/* Material Takeoff Tab */}
        <TabsContent value="takeoff" className="pt-4 px-6">
          {!projectId ? (
            <div className="text-center py-8 text-gray-500">
              Select a project to view material takeoffs
            </div>
          ) : isLoadingTakeoff ? (
            <div className="flex justify-center py-8">
              <Spinner size="lg" />
              <span className="ml-2">Loading material takeoff...</span>
            </div>
          ) : isTakeoffError ? (
            <div className="flex justify-center py-8 text-red-500">
              <AlertCircle className="h-5 w-5 mr-2" />
              Error loading material takeoff
            </div>
          ) : takeoffData ? (
            <div>
              <div className="flex justify-between items-center mb-4">
                <Select value={selectedPhase} onValueChange={setSelectedPhase}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Phase" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Phases</SelectItem>
                    {takeoffData.phases.map((phase: string) => (
                      <SelectItem key={phase} value={phase}>
                        {phase.charAt(0).toUpperCase() + phase.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Export Takeoff
                </Button>
              </div>
              
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">In Stock</TableHead>
                      <TableHead className="text-right">Need to Order</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {takeoffData.items.map((item: any) => (
                      <TableRow key={item.materialId}>
                        <TableCell className="font-mono">{item.sku}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          {item.phase.charAt(0).toUpperCase() + item.phase.slice(1)}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.quantity} {item.unitOfMeasure}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.inStock} {item.unitOfMeasure}
                        </TableCell>
                        <TableCell className="text-right">
                          {Math.max(0, item.quantity - item.inStock)} {item.unitOfMeasure}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              // Allocate stock from inventory to project
                              openAdjustmentDialog({
                                ...item,
                                currentQuantity: item.inStock
                              }, 'allocation');
                            }}
                            disabled={item.inStock <= 0}
                            title="Allocate from Inventory"
                          >
                            <ArrowUpDown className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No material takeoff available for this project
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Adjustment Dialog */}
      <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Inventory</DialogTitle>
            <DialogDescription>
              {selectedMaterial ? (
                <span>
                  Adjust stock level for <strong>{selectedMaterial.name}</strong>
                </span>
              ) : (
                'Adjust inventory stock level'
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Current Stock:</span>
              <span className="font-medium">
                {selectedMaterial?.currentQuantity} {selectedMaterial?.unitOfMeasure}
              </span>
            </div>
            
            <div>
              <Label htmlFor="adjustmentType">Adjustment Type</Label>
              <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Purchase/Add Stock</SelectItem>
                  <SelectItem value="allocation">Allocate to Project</SelectItem>
                  <SelectItem value="return">Return to Inventory</SelectItem>
                  <SelectItem value="damage">Damaged/Lost</SelectItem>
                  <SelectItem value="inventory_check">Inventory Count</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="amount">Adjustment Amount</Label>
              <Input
                id="amount"
                type="number"
                value={adjustmentAmount}
                onChange={e => setAdjustmentAmount(parseFloat(e.target.value) || 0)}
                step={1}
              />
              <p className="text-xs text-gray-500 mt-1">
                {['allocation', 'damage'].includes(adjustmentType) 
                  ? 'This will decrease inventory' 
                  : adjustmentType === 'inventory_check' 
                    ? 'This will set absolute quantity' 
                    : 'This will increase inventory'
                }
              </p>
            </div>
            
            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input
                id="notes"
                value={adjustmentNotes}
                onChange={e => setAdjustmentNotes(e.target.value)}
                placeholder="Add notes about this adjustment"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setAdjustmentDialogOpen(false)}
              disabled={updateInventoryMutation.isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary"
              onClick={handleAdjustmentSubmit}
              disabled={updateInventoryMutation.isLoading || adjustmentAmount === 0}
            >
              {updateInventoryMutation.isLoading ? (
                <>
                  <Spinner className="mr-2" size="sm" />
                  Updating...
                </>
              ) : (
                'Update Inventory'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default InventoryManager;