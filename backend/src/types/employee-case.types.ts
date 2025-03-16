// backend/src/types/employee-case.types.ts

import { TransactionType } from './inventory.types';

/**
 * Case status enum
 */
export enum CaseStatus {
  ACTIVE = 'active',
  MAINTENANCE = 'maintenance',
  MISSING = 'missing',
  RETIRED = 'retired'
}

/**
 * Employee case interface
 */
export interface IEmployeeCase {
  caseId: string;
  companyId: string;
  userId: string; // Employee ID
  name: string;
  status: CaseStatus;
  caseType: string; // e.g., "Milwaukee Packout Large", "DeWalt ToughSystem", etc.
  serialNumber?: string;
  assignmentDate: string;
  lastCheckDate?: string;
  notes?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Case inventory level interface
 */
export interface ICaseInventoryLevel {
  caseId: string;
  materialId: string;
  currentQuantity: number;
  standardQuantity: number; // What should be in the case
  location?: string; // Location within the case
  lastStockCheck?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Case inventory transaction interface
 */
export interface ICaseInventoryTransaction {
  transactionId: string;
  caseId: string;
  materialId: string;
  type: TransactionType;
  quantity: number;
  sourceId?: string; // Source location/vehicle/warehouse ID for transfers
  projectId?: string;
  notes?: string;
  created: string;
  createdBy: string;
}

/**
 * Case inventory check interface
 */
export interface ICaseInventoryCheck {
  checkId: string;
  caseId: string;
  date: string;
  performedBy: string;
  items: {
    materialId: string;
    expectedQuantity: number;
    actualQuantity: number;
    notes?: string;
  }[];
  variance: {
    missing: {
      materialId: string;
      quantity: number;
    }[];
    extra: {
      materialId: string;
      quantity: number;
    }[];
  };
  notes?: string;
  completed: boolean;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Standard case template
 */
export interface ICaseTemplate {
  templateId: string;
  companyId: string;
  name: string;
  description?: string;
  caseType: string;
  items: {
    materialId: string;
    standardQuantity: number;
    location?: string;
  }[];
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}
