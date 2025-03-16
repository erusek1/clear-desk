// backend/src/services/project-core.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { IProject, ProjectStatus, IProjectMember, ProjectRole, ProjectPermission, IAddress } from '../types/project.types';
import { SendGridService } from './sendgrid.service';

/**
 * Core Project Service for basic CRUD operations on projects
 */
export class ProjectCoreService {
  private logger: Logger;
  private sendGridService: SendGridService;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('ProjectCoreService');
    this.sendGridService = new SendGridService();
  }

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
    try {
      const projectId = uuidv4();
      const now = new Date().toISOString();
      
      // Create project record
      const newProject: IProject = {
        projectId,
        ...projectData,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save project to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.projects,
        Item: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA',
          GSI1PK: `COMPANY#${projectData.companyId}`,
          GSI1SK: `PROJECT#${projectId}`,
          ...newProject
        }
      }));

      // Create activity record for project creation
      await this.recordActivity(projectId, null, null, 'project_created', { 
        name: newProject.name,
        status: newProject.status
      }, userId);

      // If manager is assigned, send notification
      if (newProject.manager && newProject.manager.email) {
        this.sendGridService.sendProjectInvitation(
          projectId,
          newProject.name,
          newProject.manager.email,
          `${newProject.manager.firstName} ${newProject.manager.lastName}`,
          'System', // Since this is during creation
          `You have been assigned as the manager for the ${newProject.name} project.`
        ).catch((error) => {
          this.logger.error('Error sending manager invitation', { error, projectId, email: newProject.manager?.email });
        });
      }

      return newProject;
    } catch (error) {
      this.logger.error('Error creating project', { error, projectData });
      throw error;
    }
  }

  /**
   * Get a project by ID
   * 
   * @param projectId - Project ID
   * @returns Project or null if not found
   */
  async getProject(projectId: string): Promise<IProject | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IProject;
    } catch (error) {
      this.logger.error('Error getting project', { error, projectId });
      throw error;
    }
  }

  /**
   * Get all projects for a company
   * 
   * @param companyId - Company ID
   * @returns List of projects
   */
  async getCompanyProjects(companyId: string): Promise<IProject[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projects,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :companyId AND begins_with(GSI1SK, :prefix)',
        ExpressionAttributeValues: {
          ':companyId': `COMPANY#${companyId}`,
          ':prefix': 'PROJECT#'
        }
      }));

      return (result.Items || []) as IProject[];
    } catch (error) {
      this.logger.error('Error getting company projects', { error, companyId });
      throw error;
    }
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
    try {
      // Get current project to check if it exists
      const currentProject = await this.getProject(projectId);
      if (!currentProject) {
        throw new Error('Project not found');
      }

      // Build update expression and attribute values
      let updateExpression = 'set updated = :updated, updatedBy = :updatedBy';
      const expressionAttributeValues: Record<string, any> = {
        ':updated': new Date().toISOString(),
        ':updatedBy': userId
      };
      
      const expressionAttributeNames: Record<string, string> = {};

      // Add each field to the update expression if provided
      Object.entries(projectData).forEach(([key, value]) => {
        if (value !== undefined && key !== 'projectId' && key !== 'created' && key !== 'createdBy') {
          // Use attribute names to handle reserved keywords
          const attributeName = `#${key}`;
          const attributeValue = `:${key}`;
          
          updateExpression += `, ${attributeName} = ${attributeValue}`;
          expressionAttributeNames[attributeName] = key;
          expressionAttributeValues[attributeValue] = value;
        }
      });

      // If nothing to update except timestamps
      if (Object.keys(expressionAttributeNames).length === 0) {
        return currentProject;
      }

      // Update project in DynamoDB
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      // Record activity
      await this.recordActivity(projectId, null, null, 'project_updated', {
        updatedFields: Object.keys(projectData)
      }, userId);

      return result.Attributes as IProject;
    } catch (error) {
      this.logger.error('Error updating project', { error, projectId });
      throw error;
    }
  }

  /**
   * Delete a project
   * 
   * @param projectId - Project ID
   * @param userId - User ID performing the deletion
   * @returns Success status
   */
  async deleteProject(projectId: string, userId: string): Promise<boolean> {
    try {
      // Get project to check if it exists and store name for activity log
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Delete project
      await this.docClient.send(new DeleteCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        }
      }));

      // Record activity in a separate table (not tied to project PK)
      await this.recordActivity(projectId, null, null, 'project_deleted', {
        name: project.name,
        status: project.status
      }, userId, true);

      return true;
    } catch (error) {
      this.logger.error('Error deleting project', { error, projectId });
      throw error;
    }
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
    try {
      // Get the current project to check if it exists and compare status
      const currentProject = await this.getProject(projectId);
      if (!currentProject) {
        throw new Error('Project not found');
      }

      // If status is the same, no need to update
      if (currentProject.status === status) {
        return currentProject;
      }

      // Update project status
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set #status = :status, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':status': status,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        },
        ReturnValues: 'ALL_NEW'
      }));

      // Record activity
      await this.recordActivity(projectId, null, null, 'project_status_changed', {
        previousStatus: currentProject.status,
        newStatus: status
      }, userId);

      // Notify project team about status change
      this.notifyProjectStatusChange(
        currentProject,
        status,
        userId
      ).catch((error) => {
        this.logger.error('Error notifying project status change', { error, projectId, status });
      });

      return result.Attributes as IProject;
    } catch (error) {
      this.logger.error('Error updating project status', { error, projectId, status });
      throw error;
    }
  }

  /**
   * Record project activity
   * 
   * @param projectId - Project ID
   * @param entityId - Related entity ID (optional)
   * @param entityType - Related entity type (optional)
   * @param action - Activity action
   * @param details - Activity details
   * @param userId - User ID performing the action
   * @param useSeparateTable - Whether to use a separate table for deleted projects
   * @returns Activity ID
   */
  private async recordActivity(
    projectId: string,
    entityId: string | null,
    entityType: string | null,
    action: string,
    details: any,
    userId: string,
    useSeparateTable = false
  ): Promise<string> {
    try {
      const activityId = uuidv4();
      const timestamp = new Date().toISOString();
      
      const activity = {
        activityId,
        projectId,
        entityId,
        entityType,
        action,
        details,
        timestamp,
        userId
      };

      // If project is being deleted, store activity in a separate table
      const tableName = useSeparateTable ? 
        config.dynamodb.tables.activities || 'clear-desk-activities' : 
        config.dynamodb.tables.projects;
      
      const pk = useSeparateTable ? 
        `ACTIVITY#${activityId}` : 
        `PROJECT#${projectId}`;
      
      const sk = useSeparateTable ? 
        timestamp : 
        `ACTIVITY#${timestamp}`;

      await this.docClient.send(new PutCommand({
        TableName: tableName,
        Item: {
          PK: pk,
          SK: sk,
          GSI1PK: `PROJECT#${projectId}`,
          GSI1SK: `ACTIVITY#${timestamp}`,
          ...activity
        }
      }));

      return activityId;
    } catch (error) {
      this.logger.error('Error recording activity', { error, projectId, action });
      throw error;
    }
  }

  /**
   * Notify project team about status change
   * 
   * @param project - Project data
   * @param newStatus - New project status
   * @param userId - User ID making the change
   */
  private async notifyProjectStatusChange(
    project: IProject,
    newStatus: ProjectStatus,
    userId: string
  ): Promise<void> {
    try {
      // Get list of members to notify
      const memberEmails: string[] = [];
      
      if (project.manager && project.manager.email) {
        memberEmails.push(project.manager.email);
      }
      
      if (project.foreman && project.foreman.email) {
        memberEmails.push(project.foreman.email);
      }
      
      project.members.forEach(member => {
        if (member.email && !memberEmails.includes(member.email)) {
          memberEmails.push(member.email);
        }
      });
      
      if (memberEmails.length === 0) {
        return;
      }

      // Create status change message
      const statusText = newStatus.charAt(0).toUpperCase() + newStatus.slice(1).replace('-', ' ');
      const subject = `Project Status Changed: ${project.name} is now ${statusText}`;
      const text = `
The status of project ${project.name} has been changed to ${statusText}.

You can view the project details here: ${config.frontend.url}/projects/${project.projectId}

Thank you,
Clear-Desk.com
      `;

      // Send email
      await this.sendGridService.sendEmail(
        memberEmails,
        subject,
        text
      );
    } catch (error) {
      this.logger.error('Error notifying project status change', { error, projectId: project.projectId });
      // Continue execution even if notification fails
    }
  }
}
