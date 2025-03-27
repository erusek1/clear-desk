// backend/src/types/timeline.types.ts

/**
 * Enum for timeline event types
 */
export enum TimelineEventType {
  ESTIMATE_CREATED = 'estimate_created',
  ESTIMATE_SENT = 'estimate_sent',
  ESTIMATE_ACCEPTED = 'estimate_accepted',
  ESTIMATE_REJECTED = 'estimate_rejected',
  PERMIT_SUBMITTED = 'permit_submitted',
  PERMIT_APPROVED = 'permit_approved',
  PHASE_STARTED = 'phase_started',
  PHASE_COMPLETED = 'phase_completed',
  INSPECTION_SCHEDULED = 'inspection_scheduled',
  INSPECTION_COMPLETED = 'inspection_completed',
  MATERIAL_ORDERED = 'material_ordered',
  MATERIAL_DELIVERED = 'material_delivered',
  PROJECT_COMPLETED = 'project_completed',
  MILESTONE = 'milestone',
  CUSTOM = 'custom'
}

/**
 * Enum for timeline event status
 */
export enum TimelineEventStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  DELAYED = 'delayed',
  CANCELED = 'canceled'
}

/**
 * Interface for timeline event
 */
export interface ITimelineEvent {
  eventId: string;
  projectId: string;
  eventType: TimelineEventType;
  title: string;
  description?: string;
  status: TimelineEventStatus;
  scheduledDate: string; // ISO string
  actualDate?: string; // ISO string
  duration?: number; // in days
  relatedEntityType?: string; // e.g., "estimate", "permit", "phase"
  relatedEntityId?: string;
  isPrediction: boolean; // Whether this is a prediction or an actual event
  confidenceScore?: number; // For predictions: 0-1 score of confidence
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Interface for timeline
 */
export interface ITimeline {
  projectId: string;
  events: ITimelineEvent[];
  predictedEndDate?: string;
  lastUpdated: string;
}

/**
 * Interface for timeline prediction request
 */
export interface ITimelinePredictionRequest {
  projectId: string;
  includeHistoricalData?: boolean;
  considerContractorHistory?: boolean;
  considerSeasonality?: boolean;
}

/**
 * Interface for timeline prediction
 */
export interface ITimelinePrediction {
  projectId: string;
  predictedEvents: ITimelineEvent[];
  predictedEndDate: string;
  predictionConfidence: number; // 0-1 score
  factorsConsidered: string[];
  similarProjects: {
    projectId: string;
    similarity: number; // 0-1 score
  }[];
}

/**
 * Interface for project schedule
 */
export interface IProjectSchedule {
  projectId: string;
  startDate: string;
  endDate?: string;
  phases: {
    phaseId: string;
    phaseName: string;
    startDate: string;
    endDate?: string;
    duration: number;
    status: TimelineEventStatus;
    dependencies: string[]; // Array of phase IDs this phase depends on
  }[];
  milestones: {
    milestoneId: string;
    title: string;
    date: string;
    completed: boolean;
    dependencies: string[]; // Array of phase IDs or milestone IDs
  }[];
  resources: {
    resourceId: string;
    resourceType: string; // e.g., "crew", "equipment"
    resourceName: string;
    allocation: {
      phaseId: string;
      startDate: string;
      endDate: string;
      percentage: number; // 0-100
    }[];
  }[];
  constraints: {
    constraintType: string; // e.g., "must_start_after", "must_end_before"
    date: string;
    phaseId?: string;
    milestoneId?: string;
    description?: string;
  }[];
}

/**
 * Interface for contractor performance metrics
 */
export interface IContractorPerformanceMetrics {
  contractorId: string;
  averageProjectDuration: number;
  phaseTimingMetrics: {
    phaseName: string;
    averageDuration: number; // in days
    standardDeviation: number;
  }[];
  responsiveness: number; // 0-1 score
  reliabilityScore: number; // 0-1 score
  seasonalPatterns: {
    season: string; // e.g., "winter", "spring", "summer", "fall"
    averageDelay: number; // in days, negative means ahead of schedule
  }[];
  projectHistory: {
    projectId: string;
    estimatedDuration: number;
    actualDuration: number;
    variance: number; // percentage
  }[];
}
