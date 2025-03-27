// frontend/src/services/permit.service.ts

import { api } from './api';
import { PermitStatus, PermitType } from '../types/permit.types';

/**
 * Service for interacting with permit-related endpoints
 */
export const permitService = {
  /**
   * Get all permits for a project
   * 
   * @param projectId - Project ID
   * @returns List of permits
   */
  getProjectPermits: async (projectId: string) => {
    const response = await api.get(`/projects/${projectId}/permits`);
    return response.data;
  },
  
  /**
   * Get permit details
   * 
   * @param permitId - Permit ID
   * @returns Permit details
   */
  getPermit: async (permitId: string) => {
    const response = await api.get(`/permits/${permitId}`);
    return response.data;
  },
  
  /**
   * Generate an electrical permit
   * 
   * @param projectId - Project ID
   * @param jurisdictionName - Jurisdiction name
   * @param formData - Form data
   * @param notes - Optional notes
   * @returns Created permit and PDF URL
   */
  generateElectricalPermit: async (
    projectId: string,
    jurisdictionName: string,
    formData: any,
    notes?: string
  ) => {
    const response = await api.post('/permits/generate', {
      type: PermitType.ELECTRICAL,
      data: {
        projectId,
        jurisdictionName,
        formData,
        notes
      }
    });
    return response.data;
  },
  
  /**
   * Generate an electrical permit from estimate data
   * 
   * @param projectId - Project ID
   * @param estimateId - Estimate ID
   * @param jurisdictionName - Jurisdiction name
   * @param additionalData - Additional form data
   * @param notes - Optional notes
   * @returns Created permit and PDF URL
   */
  generateElectricalPermitFromEstimate: async (
    projectId: string,
    estimateId: string,
    jurisdictionName: string,
    additionalData?: any,
    notes?: string
  ) => {
    const response = await api.post('/permits/generate', {
      type: 'from_estimate',
      data: {
        projectId,
        estimateId,
        jurisdictionName,
        additionalData,
        notes
      }
    });
    return response.data;
  },
  
  /**
   * Submit a permit
   * 
   * @param permitId - Permit ID
   * @param notes - Optional notes
   * @returns Updated permit and PDF URL
   */
  submitPermit: async (permitId: string, notes?: string) => {
    const response = await api.post('/permits/submit', {
      permitId,
      notes
    });
    return response.data;
  },
  
  /**
   * Update permit status
   * 
   * @param permitId - Permit ID
   * @param status - New status
   * @param permitNumber - Optional permit number
   * @param expirationDate - Optional expiration date
   * @param notes - Optional notes
   * @returns Updated permit
   */
  updatePermitStatus: async (
    permitId: string,
    status: PermitStatus,
    permitNumber?: string,
    expirationDate?: string,
    notes?: string
  ) => {
    const response = await api.post(`/permits/${permitId}/status`, {
      status,
      permitNumber,
      expirationDate,
      notes
    });
    return response.data;
  },
  
  /**
   * Get permit PDF URL
   * 
   * @param permitId - Permit ID
   * @returns PDF download URL
   */
  getPermitPdfUrl: async (permitId: string) => {
    const response = await api.get(`/permits/${permitId}/pdf`);
    return response.data.url;
  },
  
  /**
   * Update permit details
   * 
   * @param permitId - Permit ID
   * @param updates - Permit updates
   * @returns Updated permit
   */
  updatePermit: async (permitId: string, updates: any) => {
    const response = await api.put(`/permits/${permitId}`, updates);
    return response.data;
  }
};