// backend/src/types/time-tracking.types.ts

/**
 * Timesheet status enum
 */
export enum TimesheetStatus {
    SUBMITTED = 'submitted',
    APPROVED = 'approved',
    REJECTED = 'rejected'
  }
  
  /**
   * Timesheet interface
   */
  export interface ITimesheet {
    timesheetId: string;
    projectId: string;
    userId: string;
    date: string;  // ISO date string (YYYY-MM-DD)
    hours: number;
    phases: {
      phase: string;  // Project phase
      hours: number;  // Hours for this phase
      notes?: string; // Phase-specific notes
    }[];
    notes?: string;
    status: TimesheetStatus;
    approvedBy?: string;
    approvedDate?: string;
    created: string;
    updated: string;
    createdBy: string;
    updatedBy: string;
  }
  
  /**
   * Daily report status enum
   */
  export enum ReportStatus {
    DRAFT = 'draft',
    SUBMITTED = 'submitted',
    REVIEWED = 'reviewed'
  }
  
  /**
   * Daily report interface
   */
  export interface IDailyReport {
    reportId: string;
    projectId: string;
    date: string;  // ISO date string (YYYY-MM-DD)
    weather?: {
      conditions: string;
      temperature: number;
      impacts?: string;
    };
    crew: {
      userId: string;
      hours: number;
    }[];
    workCompleted: string;
    workPlanned?: string;
    issues?: {
      description: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      status: 'open' | 'in-progress' | 'resolved';
      assignedTo?: string;
    }[];
    materialRequests?: {
      materialId: string;
      quantity: number;
      urgency: 'low' | 'medium' | 'high';
      notes?: string;
    }[];
    extraWork?: {
      description: string;
      authorizedBy?: string;
      estimatedHours?: number;
      estimatedMaterials?: number;
    }[];
    photos?: {
      s3Key: string;
      caption?: string;
      uploadTime: string;
    }[];
    status: ReportStatus;
    created: string;
    updated: string;
    createdBy: string;
    updatedBy: string;
  }
  
  /**
   * Time tracking summary interface
   */
  export interface ITimeTrackingSummary {
    projectId: string;
    projectName: string;
    totalHours: number;
    phaseBreakdown: {
      phase: string;
      hours: number;
      percentage: number;
    }[];
    weeklyHours: {
      week: string; // ISO week string (YYYY-WW)
      hours: number;
    }[];
    estimateComparison?: {
      estimatedHours: number;
      actualHours: number;
      difference: number;
      percentageUsed: number;
    };
  }
  
  /**
   * Weekly timesheet interface
   */
  export interface IWeeklyTimesheet {
    weekId: string;  // ISO week string (YYYY-WW)
    userId: string;
    days: {
      date: string;  // ISO date string (YYYY-MM-DD)
      projects: {
        projectId: string;
        projectName: string;
        hours: number;
      }[];
      totalHours: number;
    }[];
    totalHours: number;
    status: TimesheetStatus;
    approvedBy?: string;
    approvedDate?: string;
    created: string;
    updated: string;
    createdBy: string;
    updatedBy: string;
  }