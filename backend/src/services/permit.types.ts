// backend/src/types/permit.types.ts

/**
 * Permit status enum
 */
export enum PermitStatus {
    DRAFT = 'draft',
    SUBMITTED = 'submitted',
    APPROVED = 'approved',
    REJECTED = 'rejected',
    CLOSED = 'closed'
  }
  
  /**
   * Permit type enum
   */
  export enum PermitType {
    ELECTRICAL = 'electrical',
    FIRE = 'fire',
    MECHANICAL = 'mechanical',
    PLUMBING = 'plumbing',
    BUILDING = 'building'
  }
  
  /**
   * Permit interface
   */
  export interface IPermit {
    id: string;
    projectId: string;
    type: PermitType;
    status: PermitStatus;
    submissionDate?: string;
    approvalDate?: string;
    expirationDate?: string;
    permitNumber?: string;
    jurisdictionName: string;
    jurisdictionContact?: string;
    formData: Record<string, any>;
    pdfS3Key?: string;
    notes?: string;
    created: string;
    updated: string;
    createdBy: string;
    updatedBy: string;
  }
  
  /**
   * Permit form data interface for electrical permits
   */
  export interface IElectricalPermitFormData {
    // Project information
    jobAddress: string;
    jobCity: string;
    jobState: string;
    jobZip: string;
    
    // Owner information
    ownerName: string;
    ownerPhone?: string;
    ownerEmail?: string;
    
    // Contractor information
    contractorName: string;
    contractorLicense: string;
    contractorPhone: string;
    contractorEmail: string;
    
    // Electrical details
    serviceSize: number; // In amps
    serviceSizeUpgrade?: boolean;
    serviceSizePrevious?: number; // In amps, if upgrade
    phases: number; // 1 or 3
    voltage: number;
    temporaryService?: boolean;
    temporaryPoleRequired?: boolean;
    
    // Devices and fixtures
    receptacles: number;
    switches: number;
    lightFixtures: number;
    fanFixtures?: number;
    rangeCircuits?: number;
    dryerCircuits?: number;
    waterHeaterCircuits?: number;
    hvacCircuits?: number;
    subPanels?: number;
    
    // Special equipment
    generatorDetails?: {
      size: number; // In kW
      transferSwitch: boolean;
      location: string;
    };
    
    evChargerDetails?: {
      quantity: number;
      amperage: number;
    };
    
    solarDetails?: {
      size: number; // In kW
      inverterType: string;
      panels: number;
    };
    
    // Additional information
    estimatedValue: number;
    specialConditions?: string;
    additionalNotes?: string;
  }
  
  /**
   * Fire permit form data interface
   */
  export interface IFirePermitFormData {
    // Project information
    jobAddress: string;
    jobCity: string;
    jobState: string;
    jobZip: string;
    
    // Owner information
    ownerName: string;
    ownerPhone?: string;
    ownerEmail?: string;
    
    // Contractor information
    contractorName: string;
    contractorLicense: string;
    contractorPhone: string;
    contractorEmail: string;
    
    // Fire alarm system details
    hasFireAlarm: boolean;
    alarmSystemType?: string;
    numDetectors?: number;
    numPullStations?: number;
    numStrobes?: number;
    monitoringCompany?: string;
    
    // Sprinkler system details
    hasSprinklerSystem: boolean;
    sprinklerSystemType?: string;
    numSprinklerHeads?: number;
    waterFlowDetails?: string;
    
    // Special hazards
    specialHazards?: string[];
    hazardousMaterials?: {
      type: string;
      quantity: number;
      storageMethod: string;
    }[];
    
    // Occupancy information
    occupancyType: string;
    occupantLoad: number;
    buildingUse: string;
    
    // Additional information
    estimatedValue: number;
    specialConditions?: string;
    additionalNotes?: string;
  }
  
  /**
   * Permit submission result interface
   */
  export interface IPermitSubmissionResult {
    permit: IPermit;
    pdfUrl?: string;
    estimateId?: string;
    preConstructionChecklistId?: string;
  }
  
  /**
   * Permit status update request interface
   */
  export interface IPermitStatusUpdateRequest {
    status: PermitStatus;
    permitNumber?: string;
    expirationDate?: string;
    notes?: string;
  }
  
  /**
   * Permit timeline event interface
   */
  export interface IPermitTimelineEvent {
    id: string;
    permitId: string;
    eventType: 'created' | 'updated' | 'submitted' | 'approved' | 'rejected' | 'closed' | 'note';
    date: string;
    user: {
      id: string;
      name: string;
    };
    details?: string;
    oldStatus?: PermitStatus;
    newStatus?: PermitStatus;
  }
  
  /**
   * Permit statistics interface
   */
  export interface IPermitStatistics {
    total: number;
    byStatus: Record<PermitStatus, number>;
    byType: Record<PermitType, number>;
    averageApprovalTime: number; // In days
    pendingPermits: {
      id: string;
      projectId: string;
      type: PermitType;
      submissionDate: string;
      daysPending: number;
    }[];
  }
  
  /**
   * Permit notification settings interface
   */
  export interface IPermitNotificationSettings {
    sendEmailOnSubmission: boolean;
    sendEmailOnStatusChange: boolean;
    sendEmailBeforeExpiration: boolean;
    expirationReminderDays: number; // Days before expiration to send reminder
    ccEmails?: string[];
  }
  
  /**
   * Jurisdiction interface
   */
  export interface IJurisdiction {
    id: string;
    name: string;
    state: string;
    county?: string;
    city?: string;
    contactName?: string;
    contactPhone?: string;
    contactEmail?: string;
    website?: string;
    permitTypes: PermitType[];
    averageProcessingDays?: Record<PermitType, number>;
    requirementsUrl?: string;
    notes?: string;
  }