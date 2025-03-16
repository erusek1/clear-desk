// backend/src/services/project.service.ts

import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Logger } from '../utils/logger';
import { ProjectCoreService } from './project-core.service';
import { ProjectMembersService } from './project-members.service';
import { ProjectCommunicationsService } from './project-communications.service';
import { ProjectActivityService } from './project-activity.service';
import {
  IProject,
  ProjectStatus,
  IProjectMember,
  ProjectRole,
  ProjectPermission,
  IProjectComment,
  IProjectNotification,
  NotificationType,
  IProjectActivity
} from '../types/project.types';

/**
 * Main Project Service that combines functionality from specialized project services
 */
export class ProjectService {
  private logger: Logger;
  private projectCoreService: ProjectCoreService;
  private projectMembersService: ProjectMembersService;
  private projectCommunicationsService: ProjectCommunicationsService;
  private projectActivityService: ProjectActivityService;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('ProjectService');
    this.projectCoreService = new ProjectCoreService(docClient, s3Client);
    this.projectMembersService = new ProjectMembersService(docClient);
    this.projectCommunicationsService = new ProjectCommunicationsService(docClient, s3Client);
    this.projectActivityService = new ProjectActivityService(docClient);
  }

  // ---- Core Project Methods ----

  /**
   * Create a new project
   * 
   * @param projectData - Project data without ID and timestamps
   * @param userId - User ID creating the project
   * @returns Created project
   */
  async createProject(
    projectData: Omit<IProject, 'projectId' | 'created' | 'updated' | 'createdBy' | 'updatedBy'>,
    userId: string
  ): Promise<IProject> {
    return await this.projectCoreService.createProject(projectData, userId);
  }

  /**
   * Get a project by ID
   * 
   * @param projectId - Project ID
   * @returns Project or null if not found
   */
  async getProject(projectId: string): Promise<IProject | null> {
    return await this.projectCoreService.getProject(projectId);
  }

  /**
   * Get all projects for a company
   * 
   * @param companyId - Company ID
   * @returns List of projects
   */
  async getCompanyProjects(companyId: string): Promise<IProject[]> {
    return await this.projectCoreService.getCompanyProjects(companyId);
  }

  /**
   * Update a project
   * 
   * @param projectId - Project ID
   * @param projectData - Project data to update
   * @param userId - User ID making the update
   * @returns Updated project
   */
  async updateProject(
    projectId: string,
    projectData: Partial<Omit<IProject, 'projectId' | 'created' | 'updated' | 'createdBy' | 'updatedBy'>>,
    userId: string
  ): Promise<IProject | null> {
    return await this.projectCoreService.updateProject(projectId, projectData, userId);
  }

  /**
   * Delete a project
   * 
   * @param projectId - Project ID
   * @param userId - User ID performing the deletion
   * @returns Success status
   */
  async deleteProject(projectId: string, userId: string): Promise<boolean> {
    return await this.projectCoreService.deleteProject(projectId, userId);
  }

  /**
   * Update project status
   * 
   * @param projectId - Project ID
   * @param status - New status
   * @param userId - User ID making the update
   * @returns Updated project
   */
  async updateProjectStatus(
    projectId: string,
    status: ProjectStatus,
    userId: string
  ): Promise<IProject | null> {
    return await this.projectCoreService.updateProjectStatus(projectId, status, userId);
  }

  // ---- Project Members Methods ----

  /**
   * Add a member to a project
   * 
   * @param projectId - Project ID
   * @param member - Project member data
   * @param userId - User ID making the change
   * @returns Updated project
   */
  async addProjectMember(
    projectId: string,
    member: IProjectMember,
    userId: string
  ): Promise<IProject | null> {
    return await this.projectMembersService.addProjectMember(projectId, member, userId);
  }

  /**
   * Remove a member from a project
   * 
   * @param projectId - Project ID
   * @param memberId - User ID to remove
   * @param userId - User ID making the change
   * @returns Updated project
   */
  async removeProjectMember(
    projectId: string,
    memberId: string,
    userId: string
  ): Promise<IProject | null> {
    return await this.projectMembersService.removeProjectMember(projectId, memberId, userId);
  }

  /**
   * Update a member's role in a project
   * 
   * @param projectId - Project ID
   * @param memberId - User ID to update
   * @param newRole - New role
   * @param newPermissions - New permissions
   * @param userId - User ID making the change
   * @returns Updated project
   */
  async updateMemberRole(
    projectId: string,
    memberId: string,
    newRole: ProjectRole,
    newPermissions: ProjectPermission[],
    userId: string
  ): Promise<IProject | null> {
    return await this.projectMembersService.updateMemberRole(
      projectId, 
      memberId, 
      newRole, 
      newPermissions, 
      userId
    );
  }

  /**
   * Get a user's projects
   * 
   * @param userId - User ID
   * @returns List of projects
   */
  async getUserProjects(userId: string): Promise<IProject[]> {
    return await this.projectMembersService.getUserProjects(userId);
  }

  // ---- Project Communications Methods ----

  /**
   * Add a comment to a project
   * 
   * @param projectId - Project ID
   * @param comment - Comment data without ID and timestamps
   * @param userId - User ID making the comment
   * @returns Created comment
   */
  async addComment(
    projectId: string,
    comment: Omit<IProjectComment, 'commentId' | 'created' | 'updated' | 'createdBy' | 'updatedBy'>,
    userId: string
  ): Promise<IProjectComment> {
    return await this.projectCommunicationsService.addComment(projectId, comment, userId);
  }

  /**
   * Get a comment by ID
   * 
   * @param projectId - Project ID
   * @param commentId - Comment ID
   * @returns Comment or null if not found
   */
  async getComment(projectId: string, commentId: string): Promise<IProjectComment | null> {
    return await this.projectCommunicationsService.getComment(projectId, commentId);
  }

  /**
   * Get all comments for a project
   * 
   * @param projectId - Project ID
   * @returns List of comments
   */
  async getProjectComments(projectId: string): Promise<IProjectComment[]> {
    return await this.projectCommunicationsService.getProjectComments(projectId);
  }

  /**
   * Get replies to a comment
   * 
   * @param projectId - Project ID
   * @param parentId - Parent comment ID
   * @returns List of reply comments
   */
  async getCommentReplies(projectId: string, parentId: string): Promise<IProjectComment[]> {
    return await this.projectCommunicationsService.getCommentReplies(projectId, parentId);
  }

  /**
   * Update a comment
   * 
   * @param projectId - Project ID
   * @param commentId - Comment ID
   * @param content - New comment content
   * @param userId - User ID making the update
   * @returns Updated comment
   */
  async updateComment(
    projectId: string,
    commentId: string,
    content: string,
    userId: string
  ): Promise<IProjectComment | null> {
    return await this.projectCommunicationsService.updateComment(
      projectId, 
      commentId, 
      content, 
      userId
    );
  }

  /**
   * Delete a comment
   * 
   * @param projectId - Project ID
   * @param commentId - Comment ID
   * @param userId - User ID performing the deletion
   * @returns Success status
   */
  async deleteComment(
    projectId: string,
    commentId: string,
    userId: string
  ): Promise<boolean> {
    return await this.projectCommunicationsService.deleteComment(projectId, commentId, userId);
  }

  /**
   * Create a notification for project members
   * 
   * @param projectId - Project ID
   * @param notification - Notification data without ID
   * @param userId - User ID creating the notification
   * @returns Created notification
   */
  async createNotification(
    projectId: string,
    notification: Omit<IProjectNotification, 'notificationId' | 'created' | 'createdBy'>,
    userId: string
  ): Promise<IProjectNotification> {
    return await this.projectCommunicationsService.createNotification(
      projectId, 
      notification, 
      userId
    );
  }

  /**
   * Get project notifications
   * 
   * @param projectId - Project ID
   * @param userId - User ID viewing notifications
   * @returns List of notifications
   */
  async getProjectNotifications(
    projectId: string,
    userId: string
  ): Promise<IProjectNotification[]> {
    return await this.projectCommunicationsService.getProjectNotifications(projectId, userId);
  }

  /**
   * Mark a notification as read
   * 
   * @param projectId - Project ID
   * @param notificationId - Notification ID
   * @param userId - User ID marking as read
   * @returns Success status
   */
  async markNotificationAsRead(
    projectId: string,
    notificationId: string,
    userId: string
  ): Promise<boolean> {
    return await this.projectCommunicationsService.markNotificationAsRead(
      projectId, 
      notificationId, 
      userId
    );
  }

  /**
   * Generate a signed URL for file upload
   * 
   * @param projectId - Project ID
   * @param fileName - Original file name
   * @param contentType - File content type
   * @returns Signed URL and file key
   */
  async generateFileUploadUrl(
    projectId: string,
    fileName: string,
    contentType: string
  ): Promise<{ url: string, fileKey: string }> {
    return await this.projectCommunicationsService.generateFileUploadUrl(
      projectId, 
      fileName, 
      contentType
    );
  }

  /**
   * Generate a signed URL for file download
   * 
   * @param fileKey - S3 file key
   * @returns Signed URL for download
   */
  async generateFileDownloadUrl(fileKey: string): Promise<string> {
    return await this.projectCommunicationsService.generateFileDownloadUrl(fileKey);
  }

  // ---- Project Activity Methods ----

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
    return await this.projectActivityService.getProjectActivities(
      projectId, 
      startDate, 
      endDate, 
      limit
    );
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
    return await this.projectActivityService.getEntityActivities(
      projectId, 
      entityId, 
      entityType, 
      limit
    );
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
    return await this.projectActivityService.getProjectActivitySummary(projectId);
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
    return await this.projectActivityService.getProjectStatusTimeline(projectId);
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
    return await this.projectActivityService.getProjectDailyActivityCounts(projectId, days);
  }

  /**
   * Search project activities by keyword
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
    return await this.projectActivityService.searchActivities(projectId, keyword, limit);
  }

  /**
   * Get user activity feed
   * 
   * @param userId - User ID
   * @param limit - Optional limit on number of activities to return
   * @returns List of activities for user's feed
   */
  async getUserActivityFeed(
    userId: string,
    limit: number = 50
  ): Promise<IProjectActivity[]> {
    return await this.projectActivityService.getUserActivityFeed(userId, limit);
  }

  /**
   * Get recent activities across all projects for a company
   * 
   * @param companyId - Company ID
   * @param limit - Optional limit on number of activities to return
   * @returns List of recent activities across all projects
   */
  async getRecentCompanyActivities(
    companyId: string,
    limit: number = 50
  ): Promise<IProjectActivity[]> {
    return await this.projectActivityService.getRecentCompanyActivities(companyId, limit);
  }

  // ---- Convenience Methods for Common Workflows ----

  /**
   * Create a project with initial team members
   * Creates the project and adds all the team members in one operation
   * 
   * @param projectData - Project data without members
   * @param members - List of team members to add
   * @param userId - User ID creating the project
   * @returns Created project with members
   */
  async createProjectWithTeam(
    projectData: Omit<IProject, 'projectId' | 'created' | 'updated' | 'createdBy' | 'updatedBy' | 'members'>,
    members: IProjectMember[],
    userId: string
  ): Promise<IProject> {
    try {
      // Create project with empty members array
      const project = await this.createProject(
        {
          ...projectData,
          members: []
        },
        userId
      );

      // Add each team member
      for (const member of members) {
        await this.addProjectMember(project.projectId, member, userId);
      }

      // Get the updated project
      const updatedProject = await this.getProject(project.projectId);
      if (!updatedProject) {
        throw new Error('Failed to get updated project');
      }

      return updatedProject;
    } catch (error) {
      this.logger.error('Error creating project with team', { error });
      throw error;
    }
  }

  /**
   * Archive a project
   * Updates project status to 'archived' and notifies team members
   * 
   * @param projectId - Project ID
   * @param reason - Reason for archiving
   * @param userId - User ID performing the action
   * @returns Updated project
   */
  async archiveProject(
    projectId: string,
    reason: string,
    userId: string
  ): Promise<IProject | null> {
    try {
      // Update project status
      const project = await this.updateProjectStatus(projectId, ProjectStatus.COMPLETED, userId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Create notification for team members
      const recipients: string[] = [];
      
      if (project.manager) {
        recipients.push(project.manager.userId);
      }
      
      if (project.foreman) {
        recipients.push(project.foreman.userId);
      }
      
      project.members.forEach(member => {
        recipients.push(member.userId);
      });

      // Only unique recipients
      const uniqueRecipients = [...new Set(recipients)];

      // Create notification if there are recipients
      if (uniqueRecipients.length > 0) {
        await this.createNotification(
          projectId,
          {
            type: NotificationType.GENERAL,
            title: 'Project Archived',
            message: `The project "${project.name}" has been archived. Reason: ${reason}`,
            isRead: false,
            recipients: uniqueRecipients
          },
          userId
        );
      }

      return project;
    } catch (error) {
      this.logger.error('Error archiving project', { error, projectId });
      throw error;
    }
  }

  /**
   * Get project dashboard data
   * Gathers all the essential data needed for a project dashboard in one call
   * 
   * @param projectId - Project ID
   * @param userId - User ID viewing the dashboard
   * @returns Dashboard data
   */
  async getProjectDashboardData(
    projectId: string,
    userId: string
  ): Promise<{
    project: IProject | null;
    recentActivities: IProjectActivity[];
    unreadNotifications: IProjectNotification[];
    activityCounts: {
      date: string;
      count: number;
    }[];
    statusTimeline: {
      status: string;
      timestamp: string;
      userId: string;
      details?: any;
    }[];
  }> {
    try {
      // Get project details
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Get recent activities
      const recentActivities = await this.getProjectActivities(projectId, undefined, undefined, 10);

      // Get unread notifications
      const allNotifications = await this.getProjectNotifications(projectId, userId);
      const unreadNotifications = allNotifications.filter(notification => !notification.isRead);

      // Get activity counts for the last 30 days
      const activityCounts = await this.getProjectDailyActivityCounts(projectId, 30);

      // Get status timeline
      const statusTimeline = await this.getProjectStatusTimeline(projectId);

      return {
        project,
        recentActivities,
        unreadNotifications,
        activityCounts,
        statusTimeline
      };
    } catch (error) {
      this.logger.error('Error getting project dashboard data', { error, projectId });
      throw error;
    }
  }
}
