// backend/src/types/inspection.types.ts

/**
 * Inspection status enum
 */
export enum InspectionStatus {
    PENDING = 'pending',
    COMPLETED = 'completed',
    FAILED = 'failed',
    RESCHEDULED = 'rescheduled'
  }
  
  /**
   * Inspection item interface
   */
  export interface IInspectionItem {
    itemId: string;
    category: string;
    question: string;
    response: 'yes' | 'no' | 'n/a' | null;
    comment?: string;
    photos?: {
      s3Key: string;
      caption?: string;
      uploadTime: string;
    }[];
    required: boolean;
    estimateItemId?: string;
  }
  
  /**
   * Inspection checklist interface
   */
  export interface IInspectionChecklist {
    inspectionId: string;
    projectId: string;
    phase: string; // rough, service, finish, etc.
    status: InspectionStatus;
    scheduledDate?: string;
    completedDate?: string;
    inspector?: string;
    items: IInspectionItem[];
    notes?: string;
    created: string;
    updated: string;
    createdBy: string;
    updatedBy: string;
  }
  
  /**
   * Inspection template interface
   */
  export interface IInspectionTemplate {
    templateId: string;
    companyId: string;
    name: string;
    phase: string;
    items: {
      category: string;
      question: string;
      required: boolean;
    }[];
    created: string;
    updated: string;
    createdBy: string;
    updatedBy: string;
  }
  
  /**
   * Inspection summary interface for dashboard view
   */
  export interface IInspectionSummary {
    inspectionId: string;
    projectId: string;
    projectName: string;
    phase: string;
    status: InspectionStatus;
    scheduledDate?: string;
    completedDate?: string;
    inspector?: {
      id: string;
      name: string;
    };
    totalItems: number;
    completedItems: number;
    passedItems: number;
    failedItems: number;
    created: string;
  }
  
  /**
   * Inspection notification settings
   */
  export interface IInspectionNotificationSettings {
    notifyOnScheduled: boolean;
    notifyOnCompleted: boolean;
    notifyOnFailed: boolean;
    emailRecipients: string[];
    smsRecipients: string[];
  }
  
  /**
   * Phase requirements for inspection
   */
  export interface IPhaseRequirements {
    phase: string;
    description: string;
    requiredItems: {
      category: string;
      description: string;
      codeReference?: string;
    }[];
    recommendedItems: {
      category: string;
      description: string;
      codeReference?: string;
    }[];
  }