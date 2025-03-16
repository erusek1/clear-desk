// frontend/src/components/specialized/VehicleInventory.tsx

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
  Car, 
  CarFront, 
  Check, 
  Exchange,
  PenLine, 
  Plus, 
  Search, 
  Trash2, 
  Truck
} from 'lucide-react';
import { 
  getVehicleInventory, 
  updateVehicleInventory, 
  getCompanyVehicles,
  transferBetweenVehicles
} from '../../services/vehicle-inventory.service';
import { getInventoryItems } from '../../services/inventory.service';
import { useAuth } from '../../hooks/useAuth';

interface IVehicleInventoryProps {
  /** Company ID */
  companyId: string;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Vehicle inventory management component
 * 
 * Allows tracking and transferring materials across work vehicles
 */
export const VehicleInventory: React.FC<IVehicleInventoryProps> = ({
  companyId,
  className = '',
}) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  
  // State for adjustment dialog
  const [adjustmentDialogOpen, setAdjustmentDialogOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [adjustmentType, setAdjustmentType] = useState<string>('stock');
  const [adjustmentNotes, setAdjustmentNotes] = useState('');
  
  // State for transfer dialog
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferItems, setTransferItems] = useState<any[]>([]);
  const [destinationVehicleId, setDestinationVehicleId] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState('');
  
  // Query for company vehicles
  const { 
    data: vehicles = [],
    isLoading: isLoadingVehicles,
    isError: isVehiclesError
  } = useQuery(
    ['vehicles', companyId],
    () => getCompanyVehicles(companyId),
    {
      onSuccess: (data) => {
        if (data.length > 0 && !selectedVehicleId) {
          setSelectedVehicleId(data[0].vehicleId);
        }
      }
    }
  );
  
  // Query for vehicle inventory
  const {
    data: vehicleInventory = [],
    isLoading: isLoadingInventory,
    isError: isInventoryError
  } = useQuery(
    ['vehicle-inventory', selectedVehicleId, searchTerm, categoryFilter],
    () => getVehicleInventory(selectedVehicleId, {
      search: searchTerm || undefined,
      category: categoryFilter !== 'all' ? categoryFilter : undefined
    }),
    {
      enabled: !!selectedVehicleId,
      keepPreviousData: true,
    }
  );
  
  // Query for available inventory items (for adding to vehicle)
  const {
    data: inventoryItems = [],
    isLoading: isLoadingAvailableItems
  } = useQuery(
    ['inventory-items', companyId],
    () => getInventoryItems(companyId),
    {
      enabled: adjustmentDialogOpen && adjustmentType === 'stock',
    }
  );
  
  // Query for categories (derived from inventory data)
  const categories = React.useMemo(() => {
    const uniqueCategories = new Set<string>();
    vehicleInventory.forEach((item: any) => {
      if (item.category) {
        uniqueCategories.add(item.category);
      }
    });
    return Array.from(uniqueCategories).sort();
  }, [vehicleInventory]);
  
  // Mutation for updating vehicle inventory
  const updateInventoryMutation = useMutation(
    (data: { 
      items: any[];
      operation: 'add' | 'update' | 'remove';
      transactionType: string;
      notes?: string;
    }) => updateVehicleInventory(
      companyId,
      selectedVehicleId,
      data.items,
      data.operation,
      data.transactionType,
      {
        notes: data.notes
      }
    ),
    {
      onSuccess: () => {
        toast.success('Vehicle inventory updated successfully');
        queryClient.invalidateQueries(['vehicle-inventory', selectedVehicleId]);
        setAdjustmentDialogOpen(false);
        resetAdjustmentForm();
      },
      onError: (error: any) => {
        toast.error(`Failed to update inventory: ${error.message || 'Unknown error'}`);
      },
    }
  );
  
  // Mutation for transferring between vehicles
  const transferMutation = useMutation(
    (data: {
      sourceVehicleId: string;
      destinationVehicleId: string;
      items: any[];
      notes?: string;
    }) => transferBetweenVehicles(
      companyId,
      data.sourceVehicleId,
      data.destinationVehicleId,
      data.items,
      {
        notes: data.notes
      }
    ),
    {
      onSuccess: () => {
        toast.success('Materials transferred successfully');
        queryClient.invalidateQueries(['vehicle-inventory']);
        setTransferDialogOpen(false);
        resetTransferForm();
      },
      onError: (error: any) => {
        toast.error(`Failed to transfer materials: ${error.message || 'Unknown error'}`);
      },
    }
  );
  
  // Reset adjustment form
  const resetAdjustmentForm = () => {
    setSelectedMaterial(null);
    setAdjustmentAmount(0);
    setAdjustmentType('stock');
    setAdjustmentNotes('');
  };
  
  // Reset transfer form
  const resetTransferForm = () => {
    setTransferItems([]);
    setDestinationVehicleId('');
    setTransferNotes('');
  };
  
  // Handle adjustment dialog submit
  const handleAdjustmentSubmit = () => {
    if (!selectedMaterial) return;
    
    // Validate adjustment amount
    if (adjustmentAmount <= 0) {
      toast.error('Adjustment amount must be greater than zero');
      return;
    }
    
    // Create item object based on adjustment type
    const itemData = {
      materialId: selectedMaterial.materialId,
      quantity: adjustmentAmount,
      notes: adjustmentNotes || undefined
    };
    
    // Determine operation type
    let operation: 'add' | 'update' | 'remove';
    if (adjustmentType === 'usage') {
      operation = 'remove';
    } else if (adjustmentType === 'inventory_check') {
      operation = 'update';
    } else {
      operation = 'add';
    }
    
    updateInventoryMutation.mutate({
      items: [itemData],
      operation,
      transactionType: adjustmentType,
      notes: adjustmentNotes
    });
  };
  
  // Handle transfer dialog submit
  const handleTransferSubmit = () => {
    if (transferItems.length === 0 || !destinationVehicleId) return;
    
    transferMutation.mutate({
      sourceVehicleId: selectedVehicleId,
      destinationVehicleId,
      items: transferItems,
      notes: transferNotes
    });
  };
  
  // Open adjustment dialog for a material
  const openAdjustmentDialog = (material: any, defaultType: string = 'stock') => {
    setSelectedMaterial(material);
    setAdjustmentAmount(0);
    setAdjustmentType(defaultType);
    setAdjustmentNotes('');
    setAdjustmentDialogOpen(true);
  };
  
  // Open transfer dialog
  const openTransferDialog = () => {
    setTransferItems([]);
    setDestinationVehicleId('');
    setTransferNotes('');
    setTransferDialogOpen(true);
  };
  
  // Add item to transfer
  const addItemToTransfer = (item: any, quantity: number) => {
    if (quantity <= 0 || quantity > item.quantity) return;
    
    setTransferItems(prev => {
      // Check if item already exists
      const existingIndex = prev.findIndex(i => i.materialId === item.materialId);
      
      if (existingIndex >= 0) {
        // Update existing item
        const updated = [...prev];
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: quantity
        };
        return updated;
      } else {
        // Add new item
        return [...prev, {
          materialId: item.materialId,
          sku: item.sku,
          name: item.name,
          quantity: quantity,
          unitOfMeasure: item.unitOfMeasure
        }];
      }
    });
  };
  
  // Remove item from transfer
  const removeItemFromTransfer = (materialId: string) => {
    setTransferItems(prev => prev.filter(item => item.materialId !== materialId));
  };
  
  // Get vehicle name by ID
  const getVehicleName = (vehicleId: string) => {
    const vehicle = vehicles.find((v: any) => v.vehicleId === vehicleId);
    return vehicle ? vehicle.name : 'Unknown Vehicle';
  };
  
  // Filtered inventory items based on search and category
  const filteredItems = vehicleInventory;
  
  return (
    <Card className={`bg-white shadow-md ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Vehicle Inventory</CardTitle>
            <CardDescription>
              Manage materials in work vehicles
            </CardDescription>
          </div>
          
          {selectedVehicleId && (
            <Button 
              variant="primary"
              onClick={() => openAdjustmentDialog(null, 'stock')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Materials
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {/* Vehicle Selector */}
        <div className="mb-6">
          <Label>Select Vehicle</Label>
          {isLoadingVehicles ? (
            <div className="flex items-center mt-2">
              <Spinner size="sm" />
              <span className="ml-2">Loading vehicles...</span>
            </div>
          ) : isVehiclesError ? (
            <div className="flex items-center mt-2 text-red-500">
              <AlertCircle className="h-4 w-4 mr-2" />
              Error loading vehicles
            </div>
          ) : vehicles.length === 0 ? (
            <div className="mt-2 text-gray-500">
              No vehicles found. Add a vehicle to get started.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-2">
              {vehicles.map((vehicle: any) => (
                <Button
                  key={vehicle.vehicleId}
                  variant={selectedVehicleId === vehicle.vehicleId ? "default" : "outline"}
                  className="flex items-center justify-start h-auto py-3"
                  onClick={() => setSelectedVehicleId(vehicle.vehicleId)}
                >
                  {vehicle.type === 'truck' ? (
                    <Truck className="h-5 w-5 mr-2 flex-shrink-0" />
                  ) : (
                    <Car className="h-5 w-5 mr-2 flex-shrink-0" />
                  )}
                  <div className="text-left truncate">
                    <div className="font-medium">{vehicle.name}</div>
                    <div className="text-xs opacity-70">{vehicle.licensePlate}</div>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>
        
        {selectedVehicleId && (
          <>
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
            </div>
            
            {/* Inventory Table */}
            {isLoadingInventory ? (
              <div className="flex justify-center py-8">
                <Spinner size="lg" />
                <span className="ml-2">Loading vehicle inventory...</span>
              </div>
            ) : isInventoryError ? (
              <div className="flex justify-center py-8 text-red-500">
                <AlertCircle className="h-5 w-5 mr-2" />
                Error loading vehicle inventory
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No items found in this vehicle
                <div className="mt-2">
                  <Button 
                    variant="outline"
                    onClick={() => openAdjustmentDialog(null, 'stock')}
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
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item: any) => (
                      <TableRow key={item.materialId}>
                        <TableCell className="font-mono">{item.sku}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell className="text-right font-medium">
                          {item.quantity} {item.unitOfMeasure}
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openAdjustmentDialog(item, 'stock')}
                            title="Add Stock"
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openAdjustmentDialog(item, 'usage')}
                            title="Use Material"
                          >
                            <ArrowUpDown className="h-4 w-4" />
                          </Button>
                          {vehicles.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                addItemToTransfer(item, 1);
                                setTransferDialogOpen(true);
                              }}
                              title="Transfer to Another Vehicle"
                            >
                              <Exchange className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </CardContent>
      
      {/* Adjustment Dialog */}
      <Dialog open={adjustmentDialogOpen} onOpenChange={setAdjustmentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedMaterial 
                ? 'Update Vehicle Inventory' 
                : 'Add Materials to Vehicle'}
            </DialogTitle>
            <DialogDescription>
              {selectedMaterial ? (
                <span>
                  Adjust quantity for <strong>{selectedMaterial.name}</strong>
                </span>
              ) : (
                'Add materials from warehouse to this vehicle'
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {selectedMaterial && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Current Quantity:</span>
                <span className="font-medium">
                  {selectedMaterial?.quantity} {selectedMaterial?.unitOfMeasure}
                </span>
              </div>
            )}
            
            {!selectedMaterial && (
              <div>
                <Label htmlFor="materialSelect">Select Material</Label>
                <Select onValueChange={(value) => {
                  const material = inventoryItems.find((m: any) => m.materialId === value);
                  if (material) {
                    setSelectedMaterial(material);
                  }
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a material" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingAvailableItems ? (
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
              <Label htmlFor="adjustmentType">Transaction Type</Label>
              <Select value={adjustmentType} onValueChange={setAdjustmentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">Add from Warehouse</SelectItem>
                  <SelectItem value="usage">Use Material</SelectItem>
                  <SelectItem value="return">Return to Warehouse</SelectItem>
                  <SelectItem value="inventory_check">Inventory Count</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="amount">Quantity</Label>
              <Input
                id="amount"
                type="number"
                value={adjustmentAmount}
                onChange={e => setAdjustmentAmount(parseFloat(e.target.value) || 0)}
                step={1}
                min={0}
              />
              <p className="text-xs text-gray-500 mt-1">
                {adjustmentType === 'usage'
                  ? 'This will decrease vehicle inventory'
                  : adjustmentType === 'inventory_check'
                    ? 'This will set absolute quantity'
                    : 'This will increase vehicle inventory'}
              </p>
            </div>
            
            <div>
              <Label htmlFor="notes">Notes (Optional)</Label>
              <Input
                id="notes"
                value={adjustmentNotes}
                onChange={e => setAdjustmentNotes(e.target.value)}
                placeholder="Add notes about this transaction"
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
              disabled={updateInventoryMutation.isLoading || adjustmentAmount <= 0 || !selectedMaterial}
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
      
      {/* Transfer Dialog */}
      <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Transfer Materials</DialogTitle>
            <DialogDescription>
              Move materials from {getVehicleName(selectedVehicleId)} to another vehicle
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="destinationVehicle">Destination Vehicle</Label>
              <Select value={destinationVehicleId} onValueChange={setDestinationVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select destination vehicle" />
                </SelectTrigger>
                <SelectContent>
                  {vehicles
                    .filter((v: any) => v.vehicleId !== selectedVehicleId)
                    .map((vehicle: any) => (
                      <SelectItem key={vehicle.vehicleId} value={vehicle.vehicleId}>
                        {vehicle.name} ({vehicle.licensePlate})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <div className="flex justify-between items-center mb-2">
                <Label>Materials to Transfer</Label>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const item = vehicleInventory.find((i: any) => 
                      !transferItems.some(ti => ti.materialId === i.materialId));
                    if (item) {
                      addItemToTransfer(item, 1);
                    } else {
                      toast.info('All materials already added to transfer');
                    }
                  }}
                  disabled={
                    vehicleInventory.length === 0 ||
                    transferItems.length === vehicleInventory.length
                  }
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Material
                </Button>
              </div>
              
              {transferItems.length === 0 ? (
                <div className="text-center p-4 border border-dashed rounded text-gray-500">
                  No materials selected for transfer
                </div>
              ) : (
                <div className="border rounded overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Transfer Qty</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transferItems.map(item => {
                        const sourceItem = vehicleInventory.find(
                          (i: any) => i.materialId === item.materialId
                        );
                        const maxQuantity = sourceItem ? sourceItem.quantity : 0;
                        
                        return (
                          <TableRow key={item.materialId}>
                            <TableCell className="font-medium">
                              {item.name}
                            </TableCell>
                            <TableCell className="text-right">
                              {maxQuantity} {item.unitOfMeasure}
                            </TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={e => {
                                  const value = parseInt(e.target.value) || 0;
                                  if (value > 0 && value <= maxQuantity) {
                                    addItemToTransfer(item, value);
                                  }
                                }}
                                min={1}
                                max={maxQuantity}
                                className="w-16 text-right inline-block"
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeItemFromTransfer(item.materialId)}
                                className="text-red-500"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
            
            <div>
              <Label htmlFor="transferNotes">Notes (Optional)</Label>
              <Input
                id="transferNotes"
                value={transferNotes}
                onChange={e => setTransferNotes(e.target.value)}
                placeholder="Add notes about this transfer"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setTransferDialogOpen(false)}
              disabled={transferMutation.isLoading}
            >
              Cancel
            </Button>
            <Button 
              variant="primary"
              onClick={handleTransferSubmit}
              disabled={
                transferMutation.isLoading || 
                transferItems.length === 0 || 
                !destinationVehicleId
              }
            >
              {transferMutation.isLoading ? (
                <>
                  <Spinner className="mr-2" size="sm" />
                  Transferring...
                </>
              ) : (
                'Transfer Materials'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default VehicleInventory;
              variant="outline" 
              className="ml-auto mr-2"
              onClick={openTransferDialog}
              disabled={vehicleInventory.length === 0 || vehicles.length < 2}
            >
              <Exchange className="h-4 w-4 mr-2" />
              Transfer Materials
            </Button>
          )}
          
          {selectedVehicleId && (
            <Button