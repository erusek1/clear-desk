// backend/src/services/project-activity.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '../utils/logger';
import config from '../config';
import { IProjectActivity } from '../types/project.types';
import { ProjectCoreService } from './project-core.service';

/**
 * Project Activity Service for tracking project activities and history
 */
export class ProjectActivityService {
  private logger: Logger;
  private projectCoreService: ProjectCoreService;

  constructor(
    private docClient: DynamoDBDocumentClient
  ) {
    this.logger = new Logger('ProjectActivityService');
    this.projectCoreService = new ProjectCoreService(docClient, null);
  }

  /**
   * Get project activities
   * 
   * @param projectId - Project ID
   * @param startDate - Optional start date filter (ISO string)
   * @param endDate - Optional end date filter (ISO string)
   * @param limit - Optional limit on number of activities to return
   * @returns List of project activities
   */
  async getProjectActivities(
    projectId: string,
    startDate?: string,
    endDate?: string,
    limit?: number
  ): Promise<IProjectActivity[]> {
    try {
      // Verify project exists
      const project = await this.projectCoreService.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Build query based on date filters
      let keyConditionExpression = 'PK = :projectId AND begins_with(SK, :prefix)';
      const expressionAttributeValues: Record<string, any> = {
        ':projectId': `PROJECT#${projectId}`,
        ':prefix': 'ACTIVITY#'
      };

      // Add date filters if provided
      if (startDate && endDate) {
        keyConditionExpression = 'PK = :projectId AND SK BETWEEN :start AND :end';
        expressionAttributeValues[':start'] = `ACTIVITY#${startDate}`;
        expressionAttributeValues[':end'] = `ACTIVITY#${endDate}`;
      } else if (startDate) {
        keyConditionExpression = 'PK = :projectId AND SK >= :start';
        expressionAttributeValues[':start'] = `ACTIVITY#${startDate}`;
      } else if (endDate) {
        keyConditionExpression = 'PK = :projectId AND SK <= :end';
        expressionAttributeValues[':end'] = `ACTIVITY#${endDate}`;
      }

      // Query activities
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projects,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false, // Get newest first
        Limit: limit
      }));

      return (result.Items || []) as IProjectActivity[];
    } catch (error) {
      this.logger.error('Error getting project activities', { error, projectId });
      throw error;
    }
  }

  /**
   * Get entity activities for a specific entity within a project
   * 
   * @param projectId - Project ID
   * @param entityId - Entity ID
   * @param entityType - Entity type
   * @param limit - Optional limit on number of activities to return
   * @returns List of entity activities
   */
  async getEntityActivities(
    projectId: string,
    entityId: string,
    entityType: string,
    limit?: number
  ): Promise<IProjectActivity[]> {
    try {
      // Verify project exists
      const project = await this.projectCoreService.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Query activities for this entity using GSI1
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projects,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :entityKey AND begins_with(GSI1SK, :projectPrefix)',
        ExpressionAttributeValues: {
          ':entityKey': `${entityType.toUpperCase()}#${entityId}`,
          ':projectPrefix': `PROJECT#${projectId}`
        },
        ScanIndexForward: false, // Get newest first
        Limit: limit
      }));

      return (result.Items || []) as IProjectActivity[];
    } catch (error) {
      this.logger.error('Error getting entity activities', { error, projectId, entityId, entityType });
      throw error;
    }
  }

  /**
   * Get user activities for a specific user across all projects
   * 
   * @param userId - User ID
   * @param limit - Optional limit on number of activities to return
   * @returns List of user activities
   */
  async getUserActivities(
    userId: string,
    limit?: number
  ): Promise<IProjectActivity[]> {
    try {
      // Query activities by this user using GSI2
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projects,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :userKey',
        ExpressionAttributeValues: {
          ':userKey': `USER#${userId}`
        },
        ScanIndexForward: false, // Get newest first
        Limit: limit
      }));

      return (result.Items || []) as IProjectActivity[];
    } catch (error) {
      this.logger.error('Error getting user activities', { error, userId });
      throw error;
    }
  }

  /**
   * Get user activities for a specific project
   * 
   * @param projectId - Project ID
   * @param userId - User ID
   * @param limit - Optional limit on number of activities to return
   * @returns List of user activities for the project
   */
  async getUserProjectActivities(
    projectId: string,
    userId: string,
    limit?: number
  ): Promise<IProjectActivity[]> {
    try {
      // Verify project exists
      const project = await this.projectCoreService.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Query activities by this user for this project using GSI2
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projects,
        IndexName: 'GSI2',
        KeyConditionExpression: 'GSI2PK = :userKey AND begins_with(GSI2SK, :projectPrefix)',
        ExpressionAttributeValues: {
          ':userKey': `USER#${userId}`,
          ':projectPrefix': `PROJECT#${projectId}`
        },
        ScanIndexForward: false, // Get newest first
        Limit: limit
      }));

      return (result.Items || []) as IProjectActivity[];
    } catch (error) {
      this.logger.error('Error getting user project activities', { error, projectId, userId });
      throw error;
    }
  }

  /**
   * Get activity summary for a project
   * 
   * @param projectId - Project ID
   * @returns Activity summary by type and user
   */
  async getProjectActivitySummary(
    projectId: string
  ): Promise<{
    totalActivities: number;
    activityCountByType: Record<string, number>;
    activityCountByUser: Record<string, number>;
    mostRecentActivities: IProjectActivity[];
  }> {
    try {
      // Get all project activities (limit to recent 1000 for performance)
      const activities = await this.getProjectActivities(projectId, undefined, undefined, 1000);

      // Calculate summary statistics
      const activityCountByType: Record<string, number> = {};
      const activityCountByUser: Record<string, number> = {};

      activities.forEach(activity => {
        // Count by action type
        activityCountByType[activity.action] = (activityCountByType[activity.action] || 0) + 1;
        
        // Count by user
        activityCountByUser[activity.userId] = (activityCountByUser[activity.userId] || 0) + 1;
      });

      return {
        totalActivities: activities.length,
        activityCountByType,
        activityCountByUser,
        mostRecentActivities: activities.slice(0, 10) // Return 10 most recent activities
      };
    } catch (error) {
      this.logger.error('Error getting project activity summary', { error, projectId });
      throw error;
    }
  }

  /**
   * Get the timeline of project status changes
   * 
   * @param projectId - Project ID
   * @returns Timeline of project status changes
   */
  async getProjectStatusTimeline(
    projectId: string
  ): Promise<{
    status: string;
    timestamp: string;
    userId: string;
    details?: any;
  }[]> {
    try {
      // Query activities related to project status changes
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projects,
        KeyConditionExpression: 'PK = :projectId AND begins_with(SK, :prefix)',
        FilterExpression: '#action = :actionType',
        ExpressionAttributeNames: {
          '#action': 'action'
        },
        ExpressionAttributeValues: {
          ':projectId': `PROJECT#${projectId}`,
          ':prefix': 'ACTIVITY#',
          ':actionType': 'project_status_changed'
        },
        ScanIndexForward: true // Get oldest first for timeline
      }));

      const statusActivities = (result.Items || []) as IProjectActivity[];

      // Transform to timeline format
      return statusActivities.map(activity => ({
        status: activity.details?.newStatus || 'unknown',
        timestamp: activity.timestamp,
        userId: activity.userId,
        details: activity.details
      }));
    } catch (error) {
      this.logger.error('Error getting project status timeline', { error, projectId });
      throw error;
    }
  }

  /**
   * Get recent activities across all projects
   * 
   * @param companyId - Company ID
   * @param limit - Optional limit on number of activities to return
   * @returns List of recent activities across all projects
   */
  async getRecentCompanyActivities(
    companyId: string,
    limit: number = 50
  ): Promise<IProjectActivity[]> {
    try {
      // Query recent activities for this company using GSI1
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projects,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :companyKey',
        ExpressionAttributeValues: {
          ':companyKey': `COMPANY#${companyId}`
        },
        ScanIndexForward: false, // Get newest first
        Limit: limit
      }));

      return (result.Items || []) as IProjectActivity[];
    } catch (error) {
      this.logger.error('Error getting recent company activities', { error, companyId });
      throw error;
    }
  }

  /**
   * Get activity feed for a specific user
   * This combines activities from:
   * 1. Projects they are members of
   * 2. Entities they are tagged/mentioned in
   * 3. Their own activities
   * 
   * @param userId - User ID
   * @param limit - Optional limit on number of activities to return
   * @returns List of activities for user's feed
   */
  async getUserActivityFeed(
    userId: string,
    limit: number = 50
  ): Promise<IProjectActivity[]> {
    try {
      // In a real implementation, we would:
      // 1. Get all projects the user is a member of
      // 2. Get recent activities for those projects
      // 3. Get activities where the user is mentioned/tagged
      // 4. Get the user's own activities
      // 5. Merge, sort, and return the combined result
      
      // For now, we'll just get the user's own activities as a placeholder
      return this.getUserActivities(userId, limit);
    } catch (error) {
      this.logger.error('Error getting user activity feed', { error, userId });
      throw error;
    }
  }

  /**
   * Get daily activity count for a project
   * Useful for generating activity graphs/charts
   * 
   * @param projectId - Project ID
   * @param days - Number of days to include (default: 30)
   * @returns Daily activity counts
   */
  async getProjectDailyActivityCounts(
    projectId: string,
    days: number = 30
  ): Promise<{
    date: string;
    count: number;
  }[]> {
    try {
      // Calculate start date
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      // Get activities in date range
      const activities = await this.getProjectActivities(
        projectId,
        startDate.toISOString(),
        endDate.toISOString()
      );
      
      // Initialize result map with all dates in range (including zeros)
      const dailyCounts: Record<string, number> = {};
      for (let i = 0; i < days; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateString = date.toISOString().split('T')[0]; // YYYY-MM-DD
        dailyCounts[dateString] = 0;
      }
      
      // Count activities by date
      activities.forEach(activity => {
        const dateString = activity.timestamp.split('T')[0]; // YYYY-MM-DD
        if (dailyCounts[dateString] !== undefined) {
          dailyCounts[dateString]++;
        }
      });
      
      // Convert to array format for charting
      return Object.entries(dailyCounts).map(([date, count]) => ({
        date,
        count
      })).sort((a, b) => a.date.localeCompare(b.date)); // Sort by date ascending
    } catch (error) {
      this.logger.error('Error getting project daily activity counts', { error, projectId });
      throw error;
    }
  }

  /**
   * Search activities by keyword
   * 
   * @param projectId - Project ID
   * @param keyword - Search keyword
   * @param limit - Optional limit on number of results
   * @returns List of matching activities
   */
  async searchActivities(
    projectId: string,
    keyword: string,
    limit: number = 50
  ): Promise<IProjectActivity[]> {
    try {
      // Get all activities for the project
      const activities = await this.getProjectActivities(projectId);
      
      // Filter activities that match the keyword
      // Note: In a real production environment, this would be implemented using
      // a proper search service like Amazon Elasticsearch Service
      const normalizedKeyword = keyword.toLowerCase();
      
      const matchingActivities = activities.filter(activity => {
        // Search in action
        if (activity.action.toLowerCase().includes(normalizedKeyword)) {
          return true;
        }
        
        // Search in entity type
        if (activity.entityType?.toLowerCase().includes(normalizedKeyword)) {
          return true;
        }
        
        // Search in details
        if (activity.details) {
          const detailsStr = JSON.stringify(activity.details).toLowerCase();
          if (detailsStr.includes(normalizedKeyword)) {
            return true;
          }
        }
        
        return false;
      });
      
      // Return limited results
      return matchingActivities.slice(0, limit);
    } catch (error) {
      this.logger.error('Error searching activities', { error, projectId, keyword });
      throw error;
    }
  }
}
