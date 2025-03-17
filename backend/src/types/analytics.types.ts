// backend/src/types/analytics.types.ts

/**
 * Project performance interface
 */
export interface IProjectPerformance {
    projectId: string;
    projectName: string;
    projectStatus: string;
    estimatedLaborHours: number;
    actualLaborHours: number;
    laborEfficiency: number;
    estimatedMaterialCost: number;
    actualMaterialCost: number;
    materialVariance: number;
    projectedTotalCost: number;
    actualTotalCost: number;
    costVariance: number;
    scheduleAdherence: number;
    phaseAnalysis: IPhaseAnalysis[];
    deviceAnalysis: IDeviceAnalysis[];
  }
  
  /**
   * Phase analysis interface
   */
  export interface IPhaseAnalysis {
    phase: string;
    estimatedHours: number;
    actualHours: number;
    hourVariance: number;
    estimatedCost: number;
    actualCost: number;
  }
  
  /**
   * Device analysis interface
   */
  export interface IDeviceAnalysis {
    deviceType: string;
    count: number;
    laborHours: number;
    materialCost: number;
    totalCost: number;
  }
  
  /**
   * Estimate accuracy interface
   */
  export interface IEstimateAccuracy {
    companyId: string;
    projectCount: number;
    averageLaborAccuracy: number;
    averageMaterialAccuracy: number;
    averageTotalAccuracy: number;
    projectAccuracies: {
      projectId: string;
      projectName: string;
      laborAccuracy: number;
      materialAccuracy: number;
      totalAccuracy: number;
    }[];
  }
  
  /**
   * Project trend interface
   */
  export interface IProjectTrend {
    companyId: string;
    laborTrend: {
      period: string;
      estimatedHours: number;
      actualHours: number;
      variance: number;
    }[];
    materialTrend: {
      period: string;
      estimatedCost: number;
      actualCost: number;
      variance: number;
    }[];
    profitTrend: {
      period: string;
      projectedProfit: number;
      actualProfit: number;
      variance: number;
    }[];
  }