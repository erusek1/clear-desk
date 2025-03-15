// backend/src/types/estimation.types.ts

/**
 * Estimation interface
 */
export interface IEstimate {
  estimateId: string;
  projectId: string;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  version: number;
  totalLaborHours: number;
  totalMaterialCost: number;
  totalCost: number;
  phases: IEstimatePhase[];
  rooms: IEstimateRoom[];
  approvedDate?: string;
  approvedBy?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Estimate phase interface
 */
export interface IEstimatePhase {
  name: string;       // Phase name (e.g., "Rough", "Finish")
  laborHours: number; // Estimated labor hours
  materialCost: number; // Material cost
  totalCost: number;  // Total phase cost
}

/**
 * Estimate room interface
 */
export interface IEstimateRoom {
  name: string;       // Room name
  items: IEstimateItem[];
}

/**
 * Estimate item interface
 */
export interface IEstimateItem {
  id: string;
  assemblyId: string; // Reference to assembly
  assemblyName?: string; // Name of the assembly
  quantity: number;   // Quantity
  laborHours: number; // Calculated labor hours
  materialCost: number; // Calculated material cost
  totalCost: number;  // Total item cost
  notes?: string;     // Additional notes
}

/**
 * Materials takeoff interface
 */
export interface IMaterialsTakeoff {
  takeoffId: string;
  projectId: string;
  estimateId: string;
  status: 'draft' | 'final';
  version: number;
  items: IMaterialTakeoffItem[];
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Material takeoff item interface
 */
export interface IMaterialTakeoffItem {
  materialId: string;    // Reference to material
  name: string;          // Material name
  quantity: number;      // Quantity needed
  wasteFactor: number;   // Applied waste factor
  adjustedQuantity: number; // Quantity with waste factor
  unitCost: number;      // Unit cost
  totalCost: number;     // Total cost
  inventoryAllocated: number; // Amount allocated from inventory
  purchaseNeeded: number // Amount needed to purchase
}

/**
 * Estimate comparison interface
 */
export interface IEstimateComparison {
  projectId: string;
  originalEstimateId: string;
  revisedEstimateId: string;
  differenceAmount: number;
  differencePercent: number;
  laborHoursDifference: number;
  materialCostDifference: number;
  changes: {
    roomName: string;
    items: {
      id: string;
      assemblyName: string;
      original: {
        quantity: number;
        laborHours: number;
        materialCost: number;
        totalCost: number;
      } | null;
      revised: {
        quantity: number;
        laborHours: number;
        materialCost: number;
        totalCost: number;
      } | null;
      difference: {
        quantity: number;
        laborHours: number;
        materialCost: number;
        totalCost: number;
      };
      changeType: 'added' | 'removed' | 'modified';
    }[];
  }[];
  created: string;
  createdBy: string;
}
