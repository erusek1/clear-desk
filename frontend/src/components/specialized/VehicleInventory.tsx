// frontend/src/components/specialized/VehicleInventory.tsx

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
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../common/Select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../common/Tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../common/Table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../common/Dialog';
import { Spinner } from '../common/Spinner';
import { Search, Plus, Truck, Transfer, Edit, AlertCircle } from 'lucide-react';
import { 
  getVehicleInventory,
  updateVehicleInventoryItem,
  transferMaterials,
  getCompanyVehicles
} from '../../services/vehicle.service';
import { useAuth } from '../../hooks/useAuth';

// Define TypeScript interfaces for better type safety
interface VehicleItem {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  minQuantity?: number;
  vehicleId: string;
}

interface Vehicle {
  id: string;
  name: string;
  type: string;
  licensePlate?: string;
}

interface IVehicleInventoryProps {
  companyId: string;
  className?: string;
}

/**
 * Vehicle inventory management component
 * 
 * Allows managing and transferring materials between vehicles and warehouse
 */
export const VehicleInventory: React.FC<IVehicleInventoryProps> = ({
  companyId,
  className = '',
}) => {
  // State for active filters and forms
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [transferFormOpen, setTransferFormOpen] = useState<boolean>(false);
  const [transferData, setTransferData] = useState({
    sourceId: '',
    targetId: '',
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

  // Query for fetching vehicles
  const { 
    data: vehicles = [], 
    isLoading: isLoadingVehicles, 
    error: vehiclesError 
  } = useQuery<Vehicle[], Error>(
    ['vehicles', companyId],
    () => getCompanyVehicles(companyId),
    {
      refetchOnWindowFocus: false,
      retry: 1,
      onError: (error) => {
        console.error('Error in vehicles query:', error);
      }
    }
  );

  // Query for fetching vehicle inventory based on selected vehicle
  const {
    data: inventory = [],
    isLoading: isLoadingInventory,
    error: inventoryError
  } = useQuery<VehicleItem[], Error>(
    ['vehicleInventory', selectedVehicle],
    async () => {
      try {
        if (!selectedVehicle) {
          return [];
        }
        
        return await getVehicleInventory(selectedVehicle);
      } catch (error) {
        console.error('Error fetching vehicle inventory:', error);
        throw error instanceof Error ? error : new Error('Unknown error fetching inventory');
      }
    },
    {
      enabled: !!selectedVehicle,
      refetchOnWindowFocus: false,
      retry: 1,
      onError: (error) => {
        console.error('Error in inventory query:', error);
      }
    }
  );

  // Mutation for updating inventory item
  const updateItemMutation = useMutation<any, Error, { itemId: string, quantity: number }>(
    async ({ itemId, quantity }) => {
      try {
        if (!itemId || quantity < 0) {
          throw new Error('Invalid item ID or quantity');
        }
        
        return await updateVehicleInventoryItem(itemId, quantity);
      } catch (error) {
        console.error('Error updating inventory item:', error);
        throw error instanceof Error ? error : new Error('Unknown error updating item');
      }
    },
    {
      onSuccess: () => {
        toast.success('Inventory updated successfully');
        queryClient.invalidateQueries(['vehicleInventory', selectedVehicle]);
      },
      onError: (error) => {
        toast.error(`Failed to update inventory: ${error.message || 'Unknown error'}`);
      }
    }
  );

  // Mutation for transferring materials
  const transferMutation = useMutation<any, Error, typeof transferData>(
    async (data) => {
      try {
        if (!data.sourceId || !data.targetId || !data.materialId || data.quantity <= 0) {
          throw new Error('Invalid transfer data');
        }
        
        return await transferMaterials(
          data.sourceId, 
          data.targetId, 
          data.materialId, 
          data.quantity
        );
      } catch (error) {
        console.error('Error transferring materials:', error);
        throw error instanceof Error ? error : new Error('Unknown error during transfer');
      }
    },
    {
      onSuccess: () => {
        toast.success('Materials transferred successfully');
        queryClient.invalidateQueries(['vehicleInventory']);
        setTransferFormOpen(false);
        setTransferData({
          sourceId: '',
          targetId: '',
          materialId: '',
          quantity: 1
        });
      },
      onError: (error) => {
        toast.error(`Failed to transfer materials: ${error.message || 'Unknown error'}`);
      }
    }
  );

  // Filter inventory based on search term
  const filteredInventory = useMemo(() => {
    if (!searchTerm.trim() || !inventory.length) {
      return inventory;
    }
    
    const searchLower = searchTerm.toLowerCase();
    return inventory.filter(item => 
      item.materialName.toLowerCase().includes(searchLower)
    );
  }, [inventory, searchTerm]);

  // Handle selecting a vehicle
  const handleVehicleSelect = useCallback((vehicleId: string) => {
    setSelectedVehicle(vehicleId);
    setSearchTerm('');
  }, []);

  // Handle search input change
  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  }, []);

  // Handle transfer form submission
  const handleTransferSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transferData.sourceId || !transferData.targetId) {
      toast.error('Please select source and target vehicles');
      return;
    }
    
    if (!transferData.materialId) {
      toast.error('Please select a material to transfer');
      return;
    }
    
    if (transferData.quantity <= 0) {
      toast.error('Quantity must be greater than zero');
      return;
    }
    
    transferMutation.mutate(transferData);
  }, [transferData, transferMutation]);

  // Handle quantity update for an item
  const handleQuantityUpdate = useCallback((itemId: string, quantity: number) => {
    if (quantity < 0) {
      toast.error('Quantity cannot be negative');
      return;
    }
    
    updateItemMutation.mutate({ itemId, quantity });
  }, [updateItemMutation]);

  // Show loading state
  if (isLoadingVehicles) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="flex justify-center items-center py-10">
          <Spinner size="lg" aria-hidden="true" />
          <span className="ml-2">Loading vehicles...</span>
        </CardContent>
      </Card>
    );
  }

  // Show error state
  if (vehiclesError) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="flex justify-center items-center py-10 text-red-500">
          <AlertCircle className="mr-2" aria-hidden="true" />
          <span>
            Error loading vehicles: {vehiclesError instanceof Error ? vehiclesError.message : 'Unknown error'}
          </span>
        </CardContent>
      </Card>
    );
  }

  // Show empty state if no vehicles
  if (!vehicles.length) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="py-10 text-center">
          <Truck className="h-16 w-16 mx-auto text-gray-400 mb-4" aria-hidden="true" />
          <h3 className="text-lg font-medium mb-2">No Vehicles Found</h3>
          <p className="text-gray-500 mb-4">
            Your company doesn't have any vehicles yet.
          </p>
          <Button variant="primary">
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            Add Vehicle
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-white shadow-md ${className}`}>
      <CardHeader>
        <CardTitle>Vehicle Inventory</CardTitle>
        <CardDescription>
          Manage inventory across your vehicles and transfer materials between vehicles
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {/* Vehicle selector */}
        <div className="mb-6">
          <Tabs
            value={selectedVehicle || 'select'}
            onValueChange={handleVehicleSelect}
            className="w-full"
          >
            <TabsList className="w-full flex overflow-x-auto pb-1">
              <TabsTrigger value="select" disabled className="flex-shrink-0">
                Select Vehicle
              </TabsTrigger>
              
              {vehicles.map(vehicle => (
                <TabsTrigger key={vehicle.id} value={vehicle.id} className="flex-shrink-0">
                  {vehicle.name} ({vehicle.licensePlate || vehicle.type})
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        
        {/* Search and actions */}
        {selectedVehicle && (
          <div className="flex gap-4 mb-6">
            <div className="relative flex-grow">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <Input
                placeholder="Search materials..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-10"
                aria-label="Search materials"
              />
            </div>
            
            <Dialog open={transferFormOpen} onOpenChange={setTransferFormOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Transfer className="h-4 w-4 mr-2" aria-hidden="true" />
                  Transfer Materials
                </Button>
              </DialogTrigger>
              
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Transfer Materials</DialogTitle>
                </DialogHeader>
                
                <form onSubmit={handleTransferSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label htmlFor="sourceVehicle" className="text-sm font-medium">
                        From
                      </label>
                      <Select
                        value={transferData.sourceId}
                        onValueChange={(value) => setTransferData({
                          ...transferData,
                          sourceId: value
                        })}
                      >
                        <SelectTrigger id="sourceVehicle">
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="warehouse">Warehouse</SelectItem>
                          {vehicles.map(vehicle => (
                            <SelectItem key={`source-${vehicle.id}`} value={vehicle.id}>
                              {vehicle.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="space-y-2">
                      <label htmlFor="targetVehicle" className="text-sm font-medium">
                        To
                      </label>
                      <Select
                        value={transferData.targetId}
                        onValueChange={(value) => setTransferData({
                          ...transferData,
                          targetId: value
                        })}
                      >
                        <SelectTrigger id="targetVehicle">
                          <SelectValue placeholder="Select target" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="warehouse">Warehouse</SelectItem>
                          {vehicles.map(vehicle => (
                            <SelectItem key={`target-${vehicle.id}`} value={vehicle.id}>
                              {vehicle.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="material" className="text-sm font-medium">
                      Material
                    </label>
                    <Select
                      value={transferData.materialId}
                      onValueChange={(value) => setTransferData({
                        ...transferData,
                        materialId: value
                      })}
                    >
                      <SelectTrigger id="material">
                        <SelectValue placeholder="Select material" />
                      </SelectTrigger>
                      <SelectContent>
                        {inventory.map(item => (
                          <SelectItem key={item.materialId} value={item.materialId}>
                            {item.materialName} ({item.quantity} in stock)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <label htmlFor="quantity" className="text-sm font-medium">
                      Quantity
                    </label>
                    <Input
                      id="quantity"
                      type="number"
                      min="1"
                      value={transferData.quantity}
                      onChange={(e) => setTransferData({
                        ...transferData,
                        quantity: parseInt(e.target.value) || 0
                      })}
                    />
                  </div>
                  
                  <div className="flex justify-end mt-4">
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={
                        transferMutation.isLoading ||
                        !transferData.sourceId ||
                        !transferData.targetId ||
                        !transferData.materialId ||
                        transferData.quantity <= 0
                      }
                    >
                      {transferMutation.isLoading ? (
                        <>
                          <Spinner className="mr-2" size="sm" aria-hidden="true" />
                          Transferring...
                        </>
                      ) : (
                        'Transfer Materials'
                      )}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        )}
        
        {/* Inventory table */}
        {selectedVehicle && (
          <>
            {isLoadingInventory ? (
              <div className="flex justify-center items-center py-10">
                <Spinner size="lg" aria-hidden="true" />
                <span className="ml-2">Loading inventory...</span>
              </div>
            ) : inventoryError ? (
              <div className="flex justify-center items-center py-10 text-red-500">
                <AlertCircle className="mr-2" aria-hidden="true" />
                <span>
                  Error loading inventory: {inventoryError instanceof Error ? inventoryError.message : 'Unknown error'}
                </span>
              </div>
            ) : filteredInventory.length === 0 ? (
              <div className="py-10 text-center">
                <h3 className="text-lg font-medium mb-2">No Items Found</h3>
                <p className="text-gray-500 mb-4">
                  {searchTerm ? 
                    'No items match your search criteria.' : 
                    'This vehicle has no inventory items.'}
                </p>
                {!searchTerm && (
                  <Button variant="outline">
                    <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
                    Add Item
                  </Button>
                )}
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
                    {filteredInventory.map(item => (
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
                              onClick={() => handleQuantityUpdate(item.id, item.quantity - 1)}
                              disabled={updateItemMutation.isLoading}
                              aria-label={`Decrease quantity of ${item.materialName}`}
                            >
                              -
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleQuantityUpdate(item.id, item.quantity + 1)}
                              disabled={updateItemMutation.isLoading}
                              aria-label={`Increase quantity of ${item.materialName}`}
                            >
                              +
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              aria-label={`Edit ${item.materialName}`}
                            >
                              <Edit className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
        
        {!selectedVehicle && (
          <div className="py-10 text-center">
            <Truck className="h-16 w-16 mx-auto text-gray-400 mb-4" aria-hidden="true" />
            <h3 className="text-lg font-medium mb-2">Select a Vehicle</h3>
            <p className="text-gray-500">
              Please select a vehicle from the tabs above to view its inventory.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default VehicleInventory;