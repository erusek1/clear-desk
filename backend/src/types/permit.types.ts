// backend/src/types/permit.types.ts

/**
 * Enum for permit types
 */
export enum PermitType {
  ELECTRICAL = 'electrical',
  FIRE = 'fire',
  BUILDING = 'building',
  MECHANICAL = 'mechanical',
  PLUMBING = 'plumbing',
  OTHER = 'other'
}

/**
 * Enum for permit status
 */
export enum PermitStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}

/**
 * Interface for permit data
 */
export interface IPermit {
  permitId: string;
  projectId: string;
  permitType: PermitType;
  permitNumber?: string;
  status: PermitStatus;
  submissionDate?: string;
  approvalDate?: string;
  expirationDate?: string;
  applicationData: {
    jurisdiction: string;
    propertyOwner: {
      name: string;
      address: string;
      phone: string;
      email?: string;
    };
    jobAddress: string;
    jobDescription: string;
    valuation: number;
    contractorInfo: {
      name: string;
      license: string;
      address: string;
      phone: string;
      email?: string;
    };
    // Specific data for electrical permits
    electrical?: {
      serviceSize: number;
      serviceType: string; // e.g., "Overhead", "Underground", "Temporary"
      voltageType: string; // e.g., "120/240V", "208/120V", "480/277V"
      phase: string; // e.g., "Single-phase", "Three-phase"
      newCircuits: number;
      outlets: number;
      switches: number;
      fixtures: number;
      appliances: number;
      hvacUnits: number;
    };
    // Specific data for fire permits
    fire?: {
      numberOfDevices: number;
      systemType: string; // e.g., "Fire Alarm", "Sprinkler", "Hood Suppression"
      occupancyType: string;
      buildingArea: number;
      constructionType: string;
    }
  };
  fees: {
    permitFee: number;
    planReviewFee: number;
    inspectionFees: number;
    otherFees?: number;
    totalFees: number;
  };
  inspections: {
    required: string[];
    scheduled?: {
      type: string;
      date: string;
      inspector?: string;
    }[];
    completed?: {
      type: string;
      date: string;
      inspector: string;
      passed: boolean;
      comments?: string;
    }[];
  };
  documents: {
    s3Key: string;
    name: string;
    type: string; // e.g., "application", "plans", "receipt"
    uploadDate: string;
  }[];
  notes?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Interface for permit assembly mapping
 */
export interface IPermitAssemblyMapping {
  assemblyId: string;
  permitType: PermitType;
  permitFieldMapping: string; // Which field this assembly contributes to, e.g., "outlets", "switches"
  countFactor: number; // How many permit items per assembly (usually 1, but could be different)
}

/**
 * Interface for permit application request
 */
export interface IPermitApplicationRequest {
  projectId: string;
  permitType: PermitType;
  jurisdiction: string;
  jobDescription: string;
  propertyOwner: {
    name: string;
    address: string;
    phone: string;
    email?: string;
  };
  valuation?: number;
}

/**
 * Interface for permit generation response
 */
export interface IPermitGenerationResponse {
  permitId: string;
  fileUrl?: string;
  previewUrl?: string;
  message?: string;
}

/**
 * Interface for permit submission response
 */
export interface IPermitSubmissionResponse {
  permitId: string;
  status: PermitStatus;
  permitNumber?: string;
  submissionDate: string;
  message?: string;
}
