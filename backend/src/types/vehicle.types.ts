// backend/src/types/vehicle.types.ts

import { TransactionType } from './inventory.types';

/**
 * Vehicle status enum
 */
export enum VehicleStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  INACTIVE = 'inactive',
  RETIRED = 'retired'
}

/**
 * Vehicle interface
 */
export interface IVehicle {
  vehicleId: string;
  companyId: string;
  name: string;
  status: VehicleStatus;
  licensePlate: string;
  make: string;
  model: string;
  year: number;
  vin?: string;
  assignedTo?: string; // User ID of primary driver
  primaryLocation?: string;
  capacity?: number; // Capacity in cubic feet
  mileage?: number;
  lastServiceDate?: string;
  nextServiceDate?: string;
  notes?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Vehicle inventory level interface
 */
export interface IVehicleInventoryLevel {
  vehicleId: string;
  materialId: string;
  currentQuantity: number;
  minQuantity?: number; // Low stock threshold
  standardQuantity?: number; // What should normally be on the van
  location?: string; // Location within the vehicle (e.g., "Rear cabinet")
  lastStockCheck?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Vehicle inventory transaction interface
 */
export interface IVehicleInventoryTransaction {
  transactionId: string;
  vehicleId: string;
  materialId: string;
  type: TransactionType;
  quantity: number;
  sourceId?: string; // Source location/vehicle ID for transfers
  projectId?: string;
  notes?: string;
  created: string;
  createdBy: string;
}

/**
 * Vehicle inventory check interface
 */
export interface IVehicleInventoryCheck {
  checkId: string;
  vehicleId: string;
  date: string;
  performedBy: string;
  items: {
    materialId: string;
    expectedQuantity: number;
    actualQuantity: number;
    notes?: string;
  }[];
  notes?: string;
  completed: boolean;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Standard vehicle inventory template
 */
export interface IVehicleInventoryTemplate {
  templateId: string;
  companyId: string;
  name: string;
  description?: string;
  items: {
    materialId: string;
    standardQuantity: number;
    minQuantity: number;
    location?: string;
  }[];
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}
