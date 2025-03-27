// frontend/src/services/employee-case.service.ts

import { api } from './api';

/**
 * Interface for case item in employee case
 */
export interface CaseItem {
  id: string;
  materialId: string;
  materialName: string;
  quantity: number;
  minQuantity?: number;
}

/**
 * Interface for employee case
 */
export interface EmployeeCase {
  id: string;
  name: string;
  employeeId: string;
  employeeName: string;
  items: CaseItem[];
}

/**
 * Interface for case template
 */
export interface CaseTemplate {
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

/**
 * Get all employee cases for a company
 * 
 * @param companyId - Company ID
 * @returns List of employee cases
 */
export const getCases = async (companyId: string): Promise<EmployeeCase[]> => {
  if (!companyId) {
    return [];
  }

  try {
    const response = await api.get(`/companies/${companyId}/employee-cases`);
    return response.data;
  } catch (error) {
    console.error('Error fetching employee cases:', error);
    throw error;
  }
};

/**
 * Get specific employee case by ID
 * 
 * @param caseId - Case ID
 * @returns Employee case details
 */
export const getCase = async (caseId: string): Promise<EmployeeCase> => {
  if (!caseId) {
    throw new Error('Case ID is required');
  }

  try {
    const response = await api.get(`/employee-cases/${caseId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching case details:', error);
    throw error;
  }
};

/**
 * Create a new employee case
 * 
 * @param companyId - Company ID
 * @param name - Case name
 * @param employeeId - Employee ID
 * @returns Created employee case
 */
export const createCase = async (
  companyId: string,
  name: string,
  employeeId: string
): Promise<EmployeeCase> => {
  if (!companyId || !name || !employeeId) {
    throw new Error('Company ID, name, and employee ID are required');
  }

  try {
    const response = await api.post(`/companies/${companyId}/employee-cases`, {
      name,
      employeeId
    });
    return response.data;
  } catch (error) {
    console.error('Error creating employee case:', error);
    throw error;
  }
};

/**
 * Update an employee case
 * 
 * @param caseId - Case ID
 * @param updates - Object containing case updates
 * @returns Updated employee case
 */
export const updateCase = async (
  caseId: string,
  updates: Partial<EmployeeCase>
): Promise<EmployeeCase> => {
  if (!caseId) {
    throw new Error('Case ID is required');
  }

  try {
    const response = await api.patch(`/employee-cases/${caseId}`, updates);
    return response.data;
  } catch (error) {
    console.error('Error updating employee case:', error);
    throw error;
  }
};

/**
 * Delete an employee case
 * 
 * @param caseId - Case ID
 * @returns Success status
 */
export const deleteCase = async (caseId: string): Promise<boolean> => {
  if (!caseId) {
    throw new Error('Case ID is required');
  }

  try {
    await api.delete(`/employee-cases/${caseId}`);
    return true;
  } catch (error) {
    console.error('Error deleting employee case:', error);
    throw error;
  }
};

/**
 * Get case templates for a company
 * 
 * @param companyId - Company ID
 * @returns List of case templates
 */
export const getCaseTemplates = async (companyId: string): Promise<CaseTemplate[]> => {
  if (!companyId) {
    return [];
  }

  try {
    const response = await api.get(`/companies/${companyId}/case-templates`);
    return response.data;
  } catch (error) {
    console.error('Error fetching case templates:', error);
    throw error;
  }
};

/**
 * Apply a template to an employee case
 * 
 * @param caseId - Target case ID
 * @param templateId - Template ID to apply
 * @returns Updated employee case
 */
export const applyCaseTemplate = async (
  caseId: string,
  templateId: string
): Promise<EmployeeCase> => {
  if (!caseId || !templateId) {
    throw new Error('Case ID and template ID are required');
  }

  try {
    const response = await api.post(`/employee-cases/${caseId}/apply-template`, {
      templateId
    });
    return response.data;
  } catch (error) {
    console.error('Error applying template to case:', error);
    throw error;
  }
};

/**
 * Add an item to an employee case
 * 
 * @param caseId - Case ID
 * @param materialId - Material ID
 * @param quantity - Quantity to add
 * @returns Updated employee case
 */
export const addCaseItem = async (
  caseId: string,
  materialId: string,
  quantity: number
): Promise<EmployeeCase> => {
  if (!caseId || !materialId || quantity <= 0) {
    throw new Error('Invalid parameters');
  }

  try {
    const response = await api.post(`/employee-cases/${caseId}/items`, {
      materialId,
      quantity
    });
    return response.data;
  } catch (error) {
    console.error('Error adding item to case:', error);
    throw error;
  }
};

/**
 * Update an item in an employee case
 * 
 * @param caseId - Case ID
 * @param itemId - Item ID
 * @param quantity - New quantity
 * @returns Updated employee case
 */
export const updateCaseItem = async (
  caseId: string,
  itemId: string,
  quantity: number
): Promise<EmployeeCase> => {
  if (!caseId || !itemId || quantity < 0) {
    throw new Error('Invalid parameters');
  }

  try {
    const response = await api.patch(`/employee-cases/${caseId}/items/${itemId}`, {
      quantity
    });
    return response.data;
  } catch (error) {
    console.error('Error updating case item:', error);
    throw error;
  }
};

/**
 * Remove an item from an employee case
 * 
 * @param caseId - Case ID
 * @param itemId - Item ID to remove
 * @returns Updated employee case
 */
export const removeCaseItem = async (
  caseId: string,
  itemId: string
): Promise<EmployeeCase> => {
  if (!caseId || !itemId) {
    throw new Error('Case ID and item ID are required');
  }

  try {
    const response = await api.delete(`/employee-cases/${caseId}/items/${itemId}`);
    return response.data;
  } catch (error) {
    console.error('Error removing item from case:', error);
    throw error;
  }
};
