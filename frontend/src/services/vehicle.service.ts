// frontend/src/services/vehicle.service.ts

import { api } from './api';

/**
 * Interface for vehicle item in inventory
 */
export interface VehicleItem {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  minQuantity?: number;
  vehicleId: string;
}

/**
 * Interface for query parameters
 */
interface QueryParams {
  search?: string;
  sort?: string;
  category?: string;
}

/**
 * Get inventory for a specific vehicle
 * 
 * @param vehicleId - Vehicle ID to retrieve inventory for
 * @param params - Optional query parameters
 * @returns Vehicle inventory items
 */
export const getVehicleInventory = async (
  vehicleId: string,
  params?: QueryParams
): Promise<VehicleItem[]> => {
  if (!vehicleId) {
    return [];
  }

  try {
    // Build query string for optional parameters
    const queryParams = new URLSearchParams();
    if (params?.search) queryParams.append('search', params.search);
    if (params?.sort) queryParams.append('sort', params.sort);
    if (params?.category) queryParams.append('category', params.category);
    
    const queryString = queryParams.toString() ? `?${queryParams.toString()}` : '';
    
    const response = await api.get(`/vehicles/${vehicleId}/inventory${queryString}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching vehicle inventory:', error);
    throw error;
  }
};

/**
 * Update a specific item in vehicle inventory
 * 
 * @param itemId - ID of the inventory item to update
 * @param quantity - New quantity
 * @returns Updated inventory item
 */
export const updateVehicleInventoryItem = async (
  itemId: string,
  quantity: number
): Promise<any> => {
  if (!itemId) {
    throw new Error('Item ID is required');
  }

  try {
    const response = await api.patch(`/vehicle-items/${itemId}`, {
      quantity
    });
    return response.data;
  } catch (error) {
    console.error('Error updating vehicle inventory item:', error);
    throw error;
  }
};

/**
 * Transfer materials between vehicles or warehouse
 * 
 * @param sourceId - Source vehicle ID or "warehouse"
 * @param targetId - Target vehicle ID or "warehouse"
 * @param materialId - Material ID to transfer
 * @param quantity - Quantity to transfer
 * @returns Result of transfer operation
 */
export const transferMaterials = async (
  sourceId: string,
  targetId: string,
  materialId: string,
  quantity: number
): Promise<any> => {
  if (!sourceId || !targetId || !materialId || quantity <= 0) {
    throw new Error('Invalid transfer parameters');
  }

  try {
    const response = await api.post('/vehicle-transfers', {
      sourceId,
      targetId,
      materialId,
      quantity
    });
    return response.data;
  } catch (error) {
    console.error('Error transferring materials:', error);
    throw error;
  }
};

/**
 * Get all vehicles for a company
 * 
 * @param companyId - Company ID
 * @returns List of company vehicles
 */
export const getCompanyVehicles = async (companyId: string): Promise<any[]> => {
  if (!companyId) {
    return [];
  }

  try {
    const response = await api.get(`/companies/${companyId}/vehicles`);
    return response.data;
  } catch (error) {
    console.error('Error fetching company vehicles:', error);
    throw error;
  }
};
