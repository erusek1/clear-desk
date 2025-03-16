// backend/src/types/user.types.ts

/**
 * User interface
 */
export interface IUser {
  userId: string;
  companyId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  status: UserStatus;
  phone?: string;
  title?: string;
  passwordHash?: string;
  lastLogin?: string;
  settings?: IUserSettings;
  permissions: UserPermission[];
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * User role enum
 */
export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  ESTIMATOR = 'estimator',
  FOREMAN = 'foreman',
  ELECTRICIAN = 'electrician',
  APPRENTICE = 'apprentice',
  OFFICE_ADMIN = 'office-admin',
  CUSTOMER = 'customer',
  GENERAL_CONTRACTOR = 'general-contractor'
}

/**
 * User status enum
 */
export enum UserStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended'
}

/**
 * User permission enum
 */
export enum UserPermission {
  // Project Permissions
  VIEW_PROJECTS = 'view-projects',
  CREATE_PROJECTS = 'create-projects',
  EDIT_PROJECTS = 'edit-projects',
  DELETE_PROJECTS = 'delete-projects',
  MANAGE_PROJECT_MEMBERS = 'manage-project-members',
  
  // Estimate Permissions
  VIEW_ESTIMATES = 'view-estimates',
  CREATE_ESTIMATES = 'create-estimates',
  EDIT_ESTIMATES = 'edit-estimates',
  DELETE_ESTIMATES = 'delete-estimates',
  APPROVE_ESTIMATES = 'approve-estimates',
  
  // Blueprint Permissions
  VIEW_BLUEPRINTS = 'view-blueprints',
  UPLOAD_BLUEPRINTS = 'upload-blueprints',
  PROCESS_BLUEPRINTS = 'process-blueprints',
  
  // Inspection Permissions
  VIEW_INSPECTIONS = 'view-inspections',
  CREATE_INSPECTIONS = 'create-inspections',
  COMPLETE_INSPECTIONS = 'complete-inspections',
  
  // Inventory Permissions
  VIEW_INVENTORY = 'view-inventory',
  MANAGE_INVENTORY = 'manage-inventory',
  
  // Timetracking Permissions
  VIEW_TIMETRACKING = 'view-timetracking',
  SUBMIT_TIMETRACKING = 'submit-timetracking',
  APPROVE_TIMETRACKING = 'approve-timetracking',
  
  // User Management Permissions
  VIEW_USERS = 'view-users',
  CREATE_USERS = 'create-users',
  EDIT_USERS = 'edit-users',
  DELETE_USERS = 'delete-users',
  
  // Company Management Permissions
  VIEW_COMPANY = 'view-company',
  EDIT_COMPANY = 'edit-company',
  
  // Financial Permissions
  VIEW_FINANCIALS = 'view-financials',
  MANAGE_FINANCIALS = 'manage-financials'
}

/**
 * User settings interface
 */
export interface IUserSettings {
  theme?: 'light' | 'dark' | 'system';
  notifications?: {
    email?: boolean;
    inApp?: boolean;
    sms?: boolean;
  };
  dashboardLayout?: any;
  timezone?: string;
  dateFormat?: string;
  language?: string;
}

/**
 * User invitation interface
 */
export interface IUserInvitation {
  invitationId: string;
  companyId: string;
  email: string;
  role: UserRole;
  permissions: UserPermission[];
  status: 'pending' | 'accepted' | 'expired';
  expiresAt: string;
  token: string;
  created: string;
  createdBy: string;
}

/**
 * Login credentials interface
 */
export interface ILoginCredentials {
  email: string;
  password: string;
}

/**
 * Authentication result interface
 */
export interface IAuthResult {
  token: string;
  refreshToken: string;
  user: Omit<IUser, 'passwordHash'>;
  expiresAt: number;
}

/**
 * Password reset request interface
 */
export interface IPasswordResetRequest {
  email: string;
}

/**
 * Password reset interface
 */
export interface IPasswordReset {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * User profile update interface
 */
export interface IUserProfileUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string;
  title?: string;
  settings?: Partial<IUserSettings>;
}

/**
 * User password change interface
 */
export interface IUserPasswordChange {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Company interface
 */
export interface ICompany {
  companyId: string;
  name: string;
  address: {
    street: string;
    city: string;
    state: string;
    zip: string;
    country: string;
  };
  phone: string;
  email: string;
  website?: string;
  taxId?: string;
  logo?: string;
  financialSettings: {
    laborRate: number;
    overhead: number;
    profit: number;
    workersComp: number;
    liability: number;
  };
  subscription: {
    plan: 'free' | 'basic' | 'professional' | 'enterprise';
    status: 'active' | 'trialing' | 'past_due' | 'canceled';
    expiresAt?: string;
  };
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}
