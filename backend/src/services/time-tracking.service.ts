// backend/src/services/time-tracking.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { SendGridService } from './sendgrid.service';
import { 
  ITimesheet,
  IDailyReport,
  ITimeTrackingSummary,
  IWeeklyTimesheet,
  TimesheetStatus,
  ReportStatus
} from '../types/time-tracking.types';

/**
 * Time tracking service for managing timesheets and daily reports
 */
export class TimeTrackingService {
  private logger: Logger;
  private sendGridService: SendGridService;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('TimeTrackingService');
    this.sendGridService = new SendGridService();
  }

  /**
   * Submit a timesheet
   * 
   * @param timesheet - Timesheet data without ID
   * @returns Submitted timesheet
   */
  async submitTimesheet(
    timesheet: Omit<ITimesheet, 'timesheetId' | 'status' | 'created' | 'updated'>
  ): Promise<ITimesheet> {
    try {
      const timesheetId = uuidv4();
      const now = new Date().toISOString();
      
      // Create timesheet record
      const newTimesheet: ITimesheet = {
        timesheetId,
        ...timesheet,
        status: TimesheetStatus.SUBMITTED,
        created: now,
        updated: now,
        createdBy: timesheet.userId,
        updatedBy: timesheet.userId
      };

      // Validate hours
      const totalHours = newTimesheet.phases.reduce((sum, phase) => sum + phase.hours, 0);
      if (Math.abs(totalHours - newTimesheet.hours) > 0.01) {
        throw new Error('Total hours does not match sum of phase hours');
      }

      // Save timesheet to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.timeTracking,
        Item: {
          PK: `PROJECT#${timesheet.projectId}`,
          SK: `TIMESHEET#${timesheet.date}#${timesheet.userId}`,
          GSI1PK: `USER#${timesheet.userId}`,
          GSI1SK: `TIMESHEET#${timesheet.date}`,
          ...newTimesheet
        }
      }));

      return newTimesheet;
    } catch (error) {
      this.logger.error('Error submitting timesheet', { error, timesheet });
      throw error;
    }
  }

  /**
   * Get timesheet by ID
   * 
   * @param projectId - Project ID
   * @param date - Timesheet date (YYYY-MM-DD)
   * @param userId - User ID
   * @returns Timesheet data or null if not found
   */
  async getTimesheet(projectId: string, date: string, userId: string): Promise<ITimesheet | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.timeTracking,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `TIMESHEET#${date}#${userId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as ITimesheet;
    } catch (error) {
      this.logger.error('Error getting timesheet', { error, projectId, date, userId });
      throw error;
    }
  }

  /**
   * List timesheets for a project
   * 
   * @param projectId - Project ID
   * @param startDate - Optional start date filter (YYYY-MM-DD)
   * @param endDate - Optional end date filter (YYYY-MM-DD)
   * @returns List of timesheets
   */
  async listProjectTimesheets(
    projectId: string,
    startDate?: string,
    endDate?: string
  ): Promise<ITimesheet[]> {
    try {
      let keyConditionExpression = 'PK = :pk AND begins_with(SK, :sk)';
      let expressionAttributeValues: Record<string, any> = {
        ':pk': `PROJECT#${projectId}`,
        ':sk': 'TIMESHEET#'
      };

      // Add date range filter if provided
      if (startDate && endDate) {
        keyConditionExpression = 'PK = :pk AND SK BETWEEN :start AND :end';
        expressionAttributeValues = {
          ':pk': `PROJECT#${projectId}`,
          ':start': `TIMESHEET#${startDate}`,
          ':end': `TIMESHEET#${endDate}#z` // 'z' is after any user ID in ASCII
        };
      } else if (startDate) {
        keyConditionExpression = 'PK = :pk AND SK >= :start';
        expressionAttributeValues = {
          ':pk': `PROJECT#${projectId}`,
          ':start': `TIMESHEET#${startDate}`
        };
      } else if (endDate) {
        keyConditionExpression = 'PK = :pk AND SK <= :end';
        expressionAttributeValues = {
          ':pk': `PROJECT#${projectId}`,
          ':end': `TIMESHEET#${endDate}#z` // 'z' is after any user ID in ASCII
        };
      }

      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.timeTracking,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues
      }));

      return (result.Items || []) as ITimesheet[];
    } catch (error) {
      this.logger.error('Error listing project timesheets', { error, projectId });
      throw error;
    }
  }

  /**
   * List timesheets for a user
   * 
   * @param userId - User ID
   * @param startDate - Optional start date filter (YYYY-MM-DD)
   * @param endDate - Optional end date filter (YYYY-MM-DD)
   * @returns List of timesheets
   */
  async listUserTimesheets(
    userId: string,
    startDate?: string,
    endDate?: string
  ): Promise<ITimesheet[]> {
    try {
      let keyConditionExpression = 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)';
      let expressionAttributeValues: Record<string, any> = {
        ':pk': `USER#${userId}`,
        ':sk': 'TIMESHEET#'
      };

      // Add date range filter if provided
      if (startDate && endDate) {
        keyConditionExpression = 'GSI1PK = :pk AND GSI1SK BETWEEN :start AND :end';
        expressionAttributeValues = {
          ':pk': `USER#${userId}`,
          ':start': `TIMESHEET#${startDate}`,
          ':end': `TIMESHEET#${endDate}`
        };
      } else if (startDate) {
        keyConditionExpression = 'GSI1PK = :pk AND GSI1SK >= :start';
        expressionAttributeValues = {
          ':pk': `USER#${userId}`,
          ':start': `TIMESHEET#${startDate}`
        };
      } else if (endDate) {
        keyConditionExpression = 'GSI1PK = :pk AND GSI1SK <= :end';
        expressionAttributeValues = {
          ':pk': `USER#${userId}`,
          ':end': `TIMESHEET#${endDate}`
        };
      }

      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.timeTracking,
        IndexName: 'GSI1',
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues
      }));

      return (result.Items || []) as ITimesheet[];
    } catch (error) {
      this.logger.error('Error listing user timesheets', { error, userId });
      throw error;
    }
  }

  /**
   * Approve timesheet
   * 
   * @param projectId - Project ID
   * @param date - Timesheet date (YYYY-MM-DD)
   * @param userId - User ID of timesheet owner
   * @param approverUserId - User ID of approver
   * @returns Updated timesheet
   */
  async approveTimesheet(
    projectId: string,
    date: string,
    userId: string,
    approverUserId: string
  ): Promise<ITimesheet | null> {
    try {
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.timeTracking,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `TIMESHEET#${date}#${userId}`
        },
        UpdateExpression: 'set #status = :status, approvedBy = :approvedBy, approvedDate = :approvedDate, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': TimesheetStatus.APPROVED,
          ':approvedBy': approverUserId,
          ':approvedDate': new Date().toISOString(),
          ':updated': new Date().toISOString(),
          ':updatedBy': approverUserId
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      return result.Attributes as ITimesheet;
    } catch (error) {
      this.logger.error('Error approving timesheet', { error, projectId, date, userId });
      throw error;
    }
  }

  /**
   * Reject timesheet
   * 
   * @param projectId - Project ID
   * @param date - Timesheet date (YYYY-MM-DD)
   * @param userId - User ID of timesheet owner
   * @param approverUserId - User ID of approver
   * @returns Updated timesheet
   */
  async rejectTimesheet(
    projectId: string,
    date: string,
    userId: string,
    approverUserId: string
  ): Promise<ITimesheet | null> {
    try {
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.timeTracking,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `TIMESHEET#${date}#${userId}`
        },
        UpdateExpression: 'set #status = :status, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': TimesheetStatus.REJECTED,
          ':updated': new Date().toISOString(),
          ':updatedBy': approverUserId
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      return result.Attributes as ITimesheet;
    } catch (error) {
      this.logger.error('Error rejecting timesheet', { error, projectId, date, userId });
      throw error;
    }
  }

  /**
   * Submit a daily report
   * 
   * @param report - Daily report data
   * @returns Submitted daily report
   */
  async submitDailyReport(
    report: Omit<IDailyReport, 'reportId' | 'status' | 'created' | 'updated'>
  ): Promise<IDailyReport> {
    try {
      const reportId = uuidv4();
      const now = new Date().toISOString();
      
      // Create daily report record
      const newReport: IDailyReport = {
        reportId,
        ...report,
        status: ReportStatus.SUBMITTED,
        created: now,
        updated: now
      };

      // Save daily report to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.dailyReports,
        Item: {
          PK: `PROJECT#${report.projectId}`,
          SK: `DAILY_REPORT#${report.date}`,
          GSI1PK: `DAILY_REPORT#${report.date}`,
          GSI1SK: `PROJECT#${report.projectId}`,
          ...newReport
        }
      }));

      // Send email notification to project manager
      try {
        await this.sendDailyReportEmail(newReport);
      } catch (emailError) {
        this.logger.error('Error sending daily report email', { emailError, reportId });
        // Continue even if email fails
      }

      return newReport;
    } catch (error) {
      this.logger.error('Error submitting daily report', { error, report });
      throw error;
    }
  }

  /**
   * Get daily report by date
   * 
   * @param projectId - Project ID
   * @param date - Report date (YYYY-MM-DD)
   * @returns Daily report data or null if not found
   */
  async getDailyReport(projectId: string, date: string): Promise<IDailyReport | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.dailyReports,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `DAILY_REPORT#${date}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IDailyReport;
    } catch (error) {
      this.logger.error('Error getting daily report', { error, projectId, date });
      throw error;
    }
  }

  /**
   * List daily reports for a project
   * 
   * @param projectId - Project ID
   * @param startDate - Optional start date filter (YYYY-MM-DD)
   * @param endDate - Optional end date filter (YYYY-MM-DD)
   * @returns List of daily reports
   */
  async listDailyReports(
    projectId: string,
    startDate?: string,
    endDate?: string
  ): Promise<IDailyReport[]> {
    try {
      let keyConditionExpression = 'PK = :pk AND begins_with(SK, :sk)';
      let expressionAttributeValues: Record<string, any> = {
        ':pk': `PROJECT#${projectId}`,
        ':sk': 'DAILY_REPORT#'
      };

      // Add date range filter if provided
      if (startDate && endDate) {
        keyConditionExpression = 'PK = :pk AND SK BETWEEN :start AND :end';
        expressionAttributeValues = {
          ':pk': `PROJECT#${projectId}`,
          ':start': `DAILY_REPORT#${startDate}`,
          ':end': `DAILY_REPORT#${endDate}`
        };
      } else if (startDate) {
        keyConditionExpression = 'PK = :pk AND SK >= :start';
        expressionAttributeValues = {
          ':pk': `PROJECT#${projectId}`,
          ':start': `DAILY_REPORT#${startDate}`
        };
      } else if (endDate) {
        keyConditionExpression = 'PK = :pk AND SK <= :end';
        expressionAttributeValues = {
          ':pk': `PROJECT#${projectId}`,
          ':end': `DAILY_REPORT#${endDate}`
        };
      }

      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.dailyReports,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues
      }));

      return (result.Items || []) as IDailyReport[];
    } catch (error) {
      this.logger.error('Error listing daily reports', { error, projectId });
      throw error;
    }
  }

  /**
   * Generate signed URL for photo upload
   * 
   * @param projectId - Project ID
   * @param fileName - Original file name
   * @returns Signed URL and file key
   */
  async generatePhotoUploadUrl(projectId: string, fileName: string): Promise<{ url: string, fileKey: string }> {
    try {
      const fileExtension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
      const fileKey = `photos/${projectId}/${uuidv4()}.${fileExtension}`;
      
      const command = new PutObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: fileKey,
        ContentType: `image/${fileExtension === 'jpg' ? 'jpeg' : fileExtension}`
      });
      
      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      
      return {
        url: signedUrl,
        fileKey
      };
    } catch (error) {
      this.logger.error('Error generating photo upload URL', { error, projectId });
      throw error;
    }
  }

  /**
   * Add photo to daily report
   * 
   * @param projectId - Project ID
   * @param date - Report date (YYYY-MM-DD)
   * @param fileKey - S3 file key
   * @param caption - Optional photo caption
   * @param userId - User ID adding the photo
   * @returns Updated daily report
   */
  async addPhotoToDailyReport(
    projectId: string,
    date: string,
    fileKey: string,
    caption: string | undefined,
    userId: string
  ): Promise<IDailyReport | null> {
    try {
      // Get existing report
      const report = await this.getDailyReport(projectId, date);
      if (!report) {
        throw new Error('Daily report not found');
      }

      // Add photo to report
      const newPhoto = {
        s3Key: fileKey,
        caption,
        uploadTime: new Date().toISOString()
      };

      const updatedPhotos = [...(report.photos || []), newPhoto];

      // Update report in DynamoDB
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.dailyReports,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `DAILY_REPORT#${date}`
        },
        UpdateExpression: 'set photos = :photos, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':photos': updatedPhotos,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      return result.Attributes as IDailyReport;
    } catch (error) {
      this.logger.error('Error adding photo to daily report', { error, projectId, date });
      throw error;
    }
  }

  /**
   * Compare actual hours against estimate
   * 
   * @param projectId - Project ID
   * @returns Comparison data
   */
  async compareHoursAgainstEstimate(projectId: string): Promise<any> {
    try {
      // 1. Get project estimate
      const estimate = await this.getProjectEstimate(projectId);
      if (!estimate) {
        throw new Error('Project estimate not found');
      }

      // 2. Get all timesheets for the project
      const timesheets = await this.listProjectTimesheets(projectId);

      // 3. Calculate total hours by phase
      const actualHoursByPhase: Record<string, number> = {};
      let totalActualHours = 0;

      for (const timesheet of timesheets) {
        if (timesheet.status === TimesheetStatus.APPROVED) {
          totalActualHours += timesheet.hours;

          for (const phase of timesheet.phases) {
            actualHoursByPhase[phase.phase] = (actualHoursByPhase[phase.phase] || 0) + phase.hours;
          }
        }
      }

      // 4. Compare with estimate
      const estimatedPhases = estimate.phases || [];
      const phaseComparison = estimatedPhases.map(phase => {
        const actual = actualHoursByPhase[phase.name] || 0;
        const estimated = phase.laborHours || 0;
        const difference = actual - estimated;
        const percentComplete = estimated > 0 ? (actual / estimated) * 100 : 0;

        return {
          phase: phase.name,
          estimated,
          actual,
          difference,
          percentComplete: Math.round(percentComplete * 10) / 10, // Round to 1 decimal place
          status: this.getPhaseStatus(actual, estimated)
        };
      });

      // 5. Add phases in actuals that aren't in estimate
      const estimatedPhaseNames = estimatedPhases.map(p => p.name);
      Object.keys(actualHoursByPhase).forEach(phaseName => {
        if (!estimatedPhaseNames.includes(phaseName)) {
          phaseComparison.push({
            phase: phaseName,
            estimated: 0,
            actual: actualHoursByPhase[phaseName],
            difference: actualHoursByPhase[phaseName],
            percentComplete: 0,
            status: 'unbudgeted'
          });
        }
      });

      // 6. Return comparison data
      return {
        projectId,
        totalEstimatedHours: estimate.totalLaborHours || 0,
        totalActualHours,
        difference: totalActualHours - (estimate.totalLaborHours || 0),
        percentComplete: Math.round((totalActualHours / (estimate.totalLaborHours || 1)) * 1000) / 10,
        phases: phaseComparison
      };
    } catch (error) {
      this.logger.error('Error comparing hours against estimate', { error, projectId });
      throw error;
    }
  }

  /**
   * Get time tracking summary for a project
   * 
   * @param projectId - Project ID
   * @returns Time tracking summary
   */
  async getTimeTrackingSummary(projectId: string): Promise<ITimeTrackingSummary> {
    try {
      // 1. Get project details
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // 2. Get all timesheets for the project
      const timesheets = await this.listProjectTimesheets(projectId);

      // 3. Calculate total hours and phase breakdown
      const phaseHours: Record<string, number> = {};
      let totalHours = 0;
      const weeklyHours: Record<string, number> = {};

      for (const timesheet of timesheets) {
        if (timesheet.status === TimesheetStatus.APPROVED) {
          totalHours += timesheet.hours;

          // Calculate phase hours
          for (const phase of timesheet.phases) {
            phaseHours[phase.phase] = (phaseHours[phase.phase] || 0) + phase.hours;
          }

          // Calculate weekly hours
          const date = new Date(timesheet.date);
          const week = this.getISOWeek(date);
          weeklyHours[week] = (weeklyHours[week] || 0) + timesheet.hours;
        }
      }

      // 4. Format phase breakdown
      const phaseBreakdown = Object.entries(phaseHours).map(([phase, hours]) => ({
        phase,
        hours,
        percentage: totalHours > 0 ? Math.round((hours / totalHours) * 1000) / 10 : 0
      }));

      // 5. Format weekly hours
      const weeklyHoursArray = Object.entries(weeklyHours)
        .map(([week, hours]) => ({ week, hours }))
        .sort((a, b) => a.week.localeCompare(b.week));

      // 6. Get estimate comparison
      let estimateComparison;
      try {
        const comparison = await this.compareHoursAgainstEstimate(projectId);
        estimateComparison = {
          estimatedHours: comparison.totalEstimatedHours,
          actualHours: comparison.totalActualHours,
          difference: comparison.difference,
          percentageUsed: comparison.percentComplete
        };
      } catch (error) {
        this.logger.warn('Unable to get estimate comparison', { error, projectId });
        // Continue without estimate comparison
      }

      // 7. Return summary
      return {
        projectId,
        projectName: project.name,
        totalHours,
        phaseBreakdown,
        weeklyHours: weeklyHoursArray,
        estimateComparison
      };
    } catch (error) {
      this.logger.error('Error getting time tracking summary', { error, projectId });
      throw error;
    }
  }

  /**
   * Create weekly timesheet for a user
   * 
   * @param userId - User ID
   * @param weekId - Week ID (YYYY-WW)
   * @returns Weekly timesheet
   */
  async createWeeklyTimesheet(userId: string, weekId: string): Promise<IWeeklyTimesheet> {
    try {
      // 1. Parse week ID to get date range
      const { startDate, endDate } = this.getWeekDates(weekId);
      
      // 2. Get all timesheets for the user in this date range
      const timesheets = await this.listUserTimesheets(userId, startDate, endDate);
      
      // 3. Process timesheets by day
      const dayMap: Record<string, {
        projects: Record<string, { hours: number, name: string }>,
        totalHours: number
      }> = {};
      
      // Initialize days in the week
      const currentDate = new Date(startDate);
      const endDateObj = new Date(endDate);
      while (currentDate <= endDateObj) {
        const dateString = currentDate.toISOString().split('T')[0];
        dayMap[dateString] = {
          projects: {},
          totalHours: 0
        };
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      // Add timesheet data
      for (const timesheet of timesheets) {
        const date = timesheet.date;
        if (!dayMap[date]) continue;
        
        // Get project name
        const projectName = await this.getProjectName(timesheet.projectId);
        
        // Add or update project hours for this day
        dayMap[date].projects[timesheet.projectId] = {
          hours: (dayMap[date].projects[timesheet.projectId]?.hours || 0) + timesheet.hours,
          name: projectName || 'Unknown Project'
        };
        
        // Update total hours for the day
        dayMap[date].totalHours += timesheet.hours;
      }
      
      // 4. Calculate total hours for the week
      const totalHours = Object.values(dayMap).reduce((sum, day) => sum + day.totalHours, 0);
      
      // 5. Format days array
      const days = Object.entries
      // 5. Format days array
      const days = Object.entries(dayMap).map(([date, data]) => ({
        date,
        projects: Object.entries(data.projects).map(([projectId, projectData]) => ({
          projectId,
          projectName: projectData.name,
          hours: projectData.hours
        })),
        totalHours: data.totalHours
      })).sort((a, b) => a.date.localeCompare(b.date));
      
      // 6. Create weekly timesheet
      const now = new Date().toISOString();
      const weeklyTimesheet: IWeeklyTimesheet = {
        weekId,
        userId,
        days,
        totalHours,
        status: TimesheetStatus.SUBMITTED,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };
      
      // 7. Save weekly timesheet to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.weeklyTimesheets,
        Item: {
          PK: `USER#${userId}`,
          SK: `WEEKLY#${weekId}`,
          ...weeklyTimesheet
        }
      }));
      
      return weeklyTimesheet;
    } catch (error) {
      this.logger.error('Error creating weekly timesheet', { error, userId, weekId });
      throw error;
    }
  }

  /**
   * Get project estimate
   * 
   * @param projectId - Project ID
   * @returns Latest estimate or null if not found
   */
  private async getProjectEstimate(projectId: string): Promise<any | null> {
    try {
      // Query for estimates with this project ID
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.estimates,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`,
          ':sk': 'ESTIMATE#'
        },
        ScanIndexForward: false, // Get newest first
        Limit: 1
      }));

      if (!result.Items || result.Items.length === 0) {
        return null;
      }

      return result.Items[0];
    } catch (error) {
      this.logger.error('Error getting project estimate', { error, projectId });
      return null;
    }
  }

  /**
   * Get phase status based on hours comparison
   * 
   * @param actual - Actual hours
   * @param estimated - Estimated hours
   * @returns Status string
   */
  private getPhaseStatus(actual: number, estimated: number): string {
    if (estimated === 0) {
      return 'unbudgeted';
    }

    const percentDiff = ((actual - estimated) / estimated) * 100;
    
    if (percentDiff < -10) {
      return 'under-budget';
    } else if (percentDiff > 10) {
      return 'over-budget';
    } else {
      return 'on-budget';
    }
  }

  /**
   * Get ISO week string from date
   * 
   * @param date - Date to get week for
   * @returns ISO week string (YYYY-WW)
   */
  private getISOWeek(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    const week = Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 4).getTime()) / 86400000 / 7) + 1;
    return `${d.getFullYear()}-${week.toString().padStart(2, '0')}`;
  }

  /**
   * Get start and end dates for a week
   * 
   * @param weekId - Week ID (YYYY-WW)
   * @returns Start and end dates (YYYY-MM-DD)
   */
  private getWeekDates(weekId: string): { startDate: string, endDate: string } {
    const [year, week] = weekId.split('-').map(n => parseInt(n));
    
    // Find the first day of the year
    const firstDayOfYear = new Date(year, 0, 1);
    
    // Find the first Monday of the year
    const firstMonday = new Date(firstDayOfYear);
    firstMonday.setDate(1 + (8 - firstDayOfYear.getDay()) % 7);
    
    // Calculate the start date (Monday) of the specified week
    const startDate = new Date(firstMonday);
    startDate.setDate(firstMonday.getDate() + (week - 1) * 7);
    
    // Calculate the end date (Sunday) of the specified week
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  /**
   * Get project name
   * 
   * @param projectId - Project ID
   * @returns Project name or null if not found
   */
  private async getProjectName(projectId: string): Promise<string | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        }
      }));

      return result.Item?.name || null;
    } catch (error) {
      this.logger.error('Error getting project name', { error, projectId });
      return null;
    }
  }

  /**
   * Get project details
   * 
   * @param projectId - Project ID
   * @returns Project details or null if not found
   */
  private async getProject(projectId: string): Promise<any | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        }
      }));

      return result.Item;
    } catch (error) {
      this.logger.error('Error getting project', { error, projectId });
      return null;
    }
  }

  /**
   * Send daily report email notification
   * 
   * @param report - Daily report data
   */
  private async sendDailyReportEmail(report: IDailyReport): Promise<void> {
    try {
      // Get project details to include project name and manager email
      const project = await this.getProject(report.projectId);
      if (!project || !project.manager || !project.manager.email) {
        this.logger.warn('Cannot send daily report email - missing project or manager info', { reportId: report.reportId });
        return;
      }

      // Format date for display
      const reportDate = new Date(report.date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // Build email data
      const emailData = {
        to: project.manager.email,
        templateId: config.sendgrid.templates.dailyReport,
        dynamicTemplateData: {
          projectName: project.name,
          reportDate,
          reportLink: `${config.frontend.url}/projects/${report.projectId}/reports/${report.date}`,
          workCompleted: report.workCompleted,
          crewCount: report.crew.length,
          totalHours: report.crew.reduce((sum, member) => sum + member.hours, 0),
          issueCount: report.issues?.length || 0,
          materialRequestCount: report.materialRequests?.length || 0,
          hasExtraWork: (report.extraWork?.length || 0) > 0,
          photoCount: report.photos?.length || 0
        }
      };

      // Send email
      await this.sendGridService.sendTemplateEmail(emailData);
    } catch (error) {
      this.logger.error('Error sending daily report email', { error, reportId: report.reportId });
      throw error;
    }
  }
}