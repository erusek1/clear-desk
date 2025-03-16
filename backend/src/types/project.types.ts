// backend/src/types/project.types.ts

/**
 * Project interface
 */
export interface IProject {
  projectId: string;
  companyId: string;
  name: string;
  status: ProjectStatus;
  address: IAddress;
  customer: ICustomer;
  generalContractor?: IGeneralContractor;
  manager?: IProjectMember;
  foreman?: IProjectMember;
  members: IProjectMember[];
  blueprint?: {
    s3Key?: string;
    uploadDate?: string;
    uploadedBy?: string;
    processingStatus?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
    extractedData?: any;
  };
  sqFootage?: number;
  classification?: string;
  startDate?: string;
  endDate?: string;
  tags?: string[];
  notes?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Project status enum
 */
export enum ProjectStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  ON_HOLD = 'on-hold',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

/**
 * Address interface
 */
export interface IAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
}

/**
 * Customer interface
 */
export interface ICustomer {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: IAddress;
}

/**
 * General contractor interface
 */
export interface IGeneralContractor {
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: IAddress;
}

/**
 * Project member interface
 */
export interface IProjectMember {
  userId: string;
  role: ProjectRole;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  joinedDate: string;
  permissions: ProjectPermission[];
}

/**
 * Project role enum
 */
export enum ProjectRole {
  MANAGER = 'manager',
  FOREMAN = 'foreman',
  ESTIMATOR = 'estimator',
  ELECTRICIAN = 'electrician',
  APPRENTICE = 'apprentice',
  OFFICE_ADMIN = 'office-admin',
  VIEWER = 'viewer'
}

/**
 * Project permission enum
 */
export enum ProjectPermission {
  VIEW = 'view',
  EDIT = 'edit',
  DELETE = 'delete',
  MANAGE_MEMBERS = 'manage-members',
  MANAGE_ESTIMATES = 'manage-estimates',
  APPROVE_ESTIMATES = 'approve-estimates',
  MANAGE_INSPECTIONS = 'manage-inspections',
  MANAGE_INVENTORY = 'manage-inventory',
  MANAGE_TIMETRACKING = 'manage-timetracking',
  VIEW_FINANCIALS = 'view-financials'
}

/**
 * Project Phase interface
 */
export interface IProjectPhase {
  phaseId: string;
  projectId: string;
  name: string;
  status: PhaseStatus;
  startDate?: string;
  endDate?: string;
  progress: number;
  estimatedHours: number;
  actualHours: number;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Phase status enum
 */
export enum PhaseStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in-progress',
  INSPECTION_READY = 'inspection-ready',
  INSPECTION_SCHEDULED = 'inspection-scheduled',
  INSPECTION_PASSED = 'inspection-passed',
  INSPECTION_FAILED = 'inspection-failed',
  COMPLETED = 'completed'
}

/**
 * Project notification interface
 */
export interface IProjectNotification {
  notificationId: string;
  projectId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityId?: string;
  relatedEntityType?: string;
  isRead: boolean;
  recipients: string[];
  created: string;
  createdBy: string;
}

/**
 * Notification type enum
 */
export enum NotificationType {
  MEMBER_ADDED = 'member-added',
  MEMBER_REMOVED = 'member-removed',
  ESTIMATE_CREATED = 'estimate-created',
  ESTIMATE_UPDATED = 'estimate-updated',
  ESTIMATE_APPROVED = 'estimate-approved',
  ESTIMATE_REJECTED = 'estimate-rejected',
  INSPECTION_READY = 'inspection-ready',
  INSPECTION_SCHEDULED = 'inspection-scheduled',
  INSPECTION_COMPLETED = 'inspection-completed',
  FORM_SUBMITTED = 'form-submitted',
  DAILY_REPORT_SUBMITTED = 'daily-report-submitted',
  MATERIAL_REQUEST = 'material-request',
  GENERAL = 'general'
}

/**
 * Project comment interface
 */
export interface IProjectComment {
  commentId: string;
  projectId: string;
  parentId?: string;
  content: string;
  attachments?: {
    s3Key: string;
    fileName: string;
    fileType: string;
    uploadDate: string;
  }[];
  mentions?: string[];
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Project form response interface
 */
export interface IProjectFormResponse {
  responseId: string;
  projectId: string;
  formId: string;
  formName: string;
  responses: {
    questionId: string;
    question: string;
    answer: string;
    type: string;
  }[];
  attachments?: {
    s3Key: string;
    fileName: string;
    fileType: string;
    uploadDate: string;
  }[];
  submittedDate: string;
  submittedBy: string;
}

/**
 * Project activity interface
 */
export interface IProjectActivity {
  activityId: string;
  projectId: string;
  entityId?: string;
  entityType?: string;
  action: string;
  details?: any;
  timestamp: string;
  userId: string;
}
