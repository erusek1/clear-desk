// backend/src/services/project-communications.service.ts

import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { IProjectComment, IProjectNotification, NotificationType } from '../types/project.types';
import { SendGridService } from './sendgrid.service';
import { ProjectCoreService } from './project-core.service';

/**
 * Project Communications Service for comments, notifications, and files
 */
export class ProjectCommunicationsService {
  private logger: Logger;
  private sendGridService: SendGridService;
  private projectCoreService: ProjectCoreService;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client
  ) {
    this.logger = new Logger('ProjectCommunicationsService');
    this.sendGridService = new SendGridService();
    this.projectCoreService = new ProjectCoreService(docClient, s3Client);
  }

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
    try {
      // Verify that project exists
      const project = await this.projectCoreService.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const commentId = uuidv4();
      const now = new Date().toISOString();
      
      // Create comment record
      const newComment: IProjectComment = {
        commentId,
        projectId,
        ...comment,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save comment to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.comments,
        Item: {
          PK: `PROJECT#${projectId}`,
          SK: `COMMENT#${commentId}`,
          GSI1PK: comment.parentId ? `COMMENT#${comment.parentId}` : `PROJECT#${projectId}`,
          GSI1SK: `COMMENT#${now}`,
          ...newComment
        }
      }));

      // Process @mentions
      if (comment.content) {
        await this.processMentions(projectId, commentId, comment.content, userId);
      }

      // Record activity
      await this.recordCommentActivity(
        projectId,
        commentId,
        comment.parentId ? 'comment_reply_added' : 'comment_added',
        {
          content: comment.content?.substring(0, 100) + (comment.content?.length > 100 ? '...' : ''),
          parentId: comment.parentId
        },
        userId
      );

      return newComment;
    } catch (error) {
      this.logger.error('Error adding comment', { error, projectId });
      throw error;
    }
  }

  /**
   * Get a comment by ID
   * 
   * @param projectId - Project ID
   * @param commentId - Comment ID
   * @returns Comment or null if not found
   */
  async getComment(projectId: string, commentId: string): Promise<IProjectComment | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.comments,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `COMMENT#${commentId}`
        }
      }));

      if (!result.Item) {
        return null;
      }

      return result.Item as IProjectComment;
    } catch (error) {
      this.logger.error('Error getting comment', { error, projectId, commentId });
      throw error;
    }
  }

  /**
   * Get all comments for a project
   * 
   * @param projectId - Project ID
   * @returns List of comments
   */
  async getProjectComments(projectId: string): Promise<IProjectComment[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.comments,
        KeyConditionExpression: 'PK = :projectId AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':projectId': `PROJECT#${projectId}`,
          ':prefix': 'COMMENT#'
        }
      }));

      return (result.Items || []) as IProjectComment[];
    } catch (error) {
      this.logger.error('Error getting project comments', { error, projectId });
      throw error;
    }
  }

  /**
   * Get replies to a comment
   * 
   * @param projectId - Project ID
   * @param parentId - Parent comment ID
   * @returns List of reply comments
   */
  async getCommentReplies(projectId: string, parentId: string): Promise<IProjectComment[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.comments,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :parentId AND begins_with(GSI1SK, :prefix)',
        ExpressionAttributeValues: {
          ':parentId': `COMMENT#${parentId}`,
          ':prefix': 'COMMENT#'
        }
      }));

      return (result.Items || []) as IProjectComment[];
    } catch (error) {
      this.logger.error('Error getting comment replies', { error, projectId, parentId });
      throw error;
    }
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
    try {
      // Get current comment to check if it exists and if user is the author
      const comment = await this.getComment(projectId, commentId);
      if (!comment) {
        throw new Error('Comment not found');
      }

      // Check if user is the comment author
      if (comment.createdBy !== userId) {
        throw new Error('Only the comment author can update the comment');
      }

      // Update comment
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.comments,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `COMMENT#${commentId}`
        },
        UpdateExpression: 'set content = :content, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':content': content,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        },
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      // Process @mentions in the updated content
      await this.processMentions(projectId, commentId, content, userId);

      // Record activity
      await this.recordCommentActivity(
        projectId,
        commentId,
        'comment_updated',
        {
          content: content.substring(0, 100) + (content.length > 100 ? '...' : '')
        },
        userId
      );

      return result.Attributes as IProjectComment;
    } catch (error) {
      this.logger.error('Error updating comment', { error, projectId, commentId });
      throw error;
    }
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
    try {
      // Get current comment to check if it exists and if user is the author
      const comment = await this.getComment(projectId, commentId);
      if (!comment) {
        throw new Error('Comment not found');
      }

      // Check if user is the comment author
      if (comment.createdBy !== userId) {
        throw new Error('Only the comment author can delete the comment');
      }

      // Delete comment
      await this.docClient.send(new DeleteCommand({
        TableName: config.dynamodb.tables.comments,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `COMMENT#${commentId}`
        }
      }));

      // Record activity
      await this.recordCommentActivity(
        projectId,
        commentId,
        'comment_deleted',
        {
          content: comment.content?.substring(0, 100) + (comment.content?.length > 100 ? '...' : '')
        },
        userId
      );

      return true;
    } catch (error) {
      this.logger.error('Error deleting comment', { error, projectId, commentId });
      throw error;
    }
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
    try {
      const notificationId = uuidv4();
      const now = new Date().toISOString();
      
      // Create notification record
      const newNotification: IProjectNotification = {
        notificationId,
        projectId,
        ...notification,
        created: now,
        createdBy: userId
      };

      // Save notification to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.projects,
        Item: {
          PK: `PROJECT#${projectId}`,
          SK: `NOTIFICATION#${notificationId}`,
          GSI1PK: `NOTIFICATION#${notification.type}`,
          GSI1SK: `PROJECT#${projectId}#${now}`,
          ...newNotification
        }
      }));

      // Send email notifications if needed
      await this.sendNotificationEmails(projectId, newNotification);

      return newNotification;
    } catch (error) {
      this.logger.error('Error creating notification', { error, projectId });
      throw error;
    }
  }

  /**
   * Get project notifications
   * 
   * @param projectId - Project ID
   * @param userId - User ID viewing notifications (for marking as read)
   * @returns List of notifications
   */
  async getProjectNotifications(
    projectId: string,
    userId: string
  ): Promise<IProjectNotification[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projects,
        KeyConditionExpression: 'PK = :projectId AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: {
          ':projectId': `PROJECT#${projectId}`,
          ':prefix': 'NOTIFICATION#'
        }
      }));

      const notifications = (result.Items || []) as IProjectNotification[];
      
      // Mark notifications as read for this user
      for (const notification of notifications) {
        if (!notification.isRead && notification.recipients.includes(userId)) {
          await this.markNotificationAsRead(projectId, notification.notificationId, userId);
        }
      }

      return notifications;
    } catch (error) {
      this.logger.error('Error getting project notifications', { error, projectId });
      throw error;
    }
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
    try {
      // Update notification
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `NOTIFICATION#${notificationId}`
        },
        UpdateExpression: 'set isRead = :isRead',
        ExpressionAttributeValues: {
          ':isRead': true
        }
      }));

      return true;
    } catch (error) {
      this.logger.error('Error marking notification as read', { error, projectId, notificationId });
      throw error;
    }
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
    try {
      // Sanitize file name to prevent issues
      const sanitizedFileName = fileName.replace(/[^\w\d.-]/g, '_');
      
      // Generate unique file key
      const fileKey = `projects/${projectId}/files/${uuidv4()}-${sanitizedFileName}`;
      
      // Create pre-signed URL for upload
      const command = new PutObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: fileKey,
        ContentType: contentType
      });
      
      const url = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      
      return {
        url,
        fileKey
      };
    } catch (error) {
      this.logger.error('Error generating file upload URL', { error, projectId });
      throw error;
    }
  }

  /**
   * Generate a signed URL for file download
   * 
   * @param fileKey - S3 file key
   * @returns Signed URL for download
   */
  async generateFileDownloadUrl(fileKey: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: fileKey
      });
      
      return await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
    } catch (error) {
      this.logger.error('Error generating file download URL', { error, fileKey });
      throw error;
    }
  }

  /**
   * Record comment activity
   * 
   * @param projectId - Project ID
   * @param commentId - Comment ID
   * @param action - Activity action
   * @param details - Activity details
   * @param userId - User ID performing the action
   * @returns Activity ID
   */
  private async recordCommentActivity(
    projectId: string,
    commentId: string,
    action: string,
    details: any,
    userId: string
  ): Promise<string> {
    try {
      // Use the existing activity recording function from the core service
      return await (this.projectCoreService as any).recordActivity(
        projectId,
        commentId,
        'comment',
        action,
        details,
        userId
      );
    } catch (error) {
      this.logger.error('Error recording comment activity', { error, projectId, commentId, action });
      throw error;
    }
  }

  /**
   * Process @mentions in comment content
   * 
   * @param projectId - Project ID
   * @param commentId - Comment ID
   * @param content - Comment content
   * @param userId - User ID who created the comment
   */
  private async processMentions(
    projectId: string,
    commentId: string,
    content: string,
    userId: string
  ): Promise<void> {
    try {
      // Extract mentions using regex
      // Format: @userId or @username
      const mentionRegex = /@(\w+)/g;
      const mentions = content.match(mentionRegex);
      
      if (!mentions || mentions.length === 0) {
        return;
      }

      // Get project to get member information
      const project = await this.projectCoreService.getProject(projectId);
      if (!project) {
        return;
      }

      // Extract all member user IDs
      const allMembers = [
        ...(project.manager ? [project.manager] : []),
        ...(project.foreman ? [project.foreman] : []),
        ...project.members
      ];

      // Process each mention
      const mentionedUserIds = [];
      for (const mention of mentions) {
        const username = mention.substring(1); // Remove @ symbol
        
        // Try to find member by userId or name
        const member = allMembers.find(m => 
          m.userId === username || 
          m.firstName.toLowerCase() === username.toLowerCase() ||
          m.lastName.toLowerCase() === username.toLowerCase() ||
          `${m.firstName.toLowerCase()}${m.lastName.toLowerCase()}` === username.toLowerCase()
        );
        
        if (member && member.userId !== userId) { // Don't notify yourself
          mentionedUserIds.push(member.userId);
        }
      }

      // Create notification for mentioned users
      if (mentionedUserIds.length > 0) {
        await this.createNotification(
          projectId,
          {
            type: NotificationType.MEMBER_ADDED,
            title: 'You were mentioned in a comment',
            message: `You were mentioned in a comment on project ${project.name}`,
            relatedEntityId: commentId,
            relatedEntityType: 'comment',
            isRead: false,
            recipients: mentionedUserIds
          },
          userId
        );
      }
    } catch (error) {
      this.logger.error('Error processing mentions', { error, projectId, commentId });
      // Continue execution even if mention processing fails
    }
  }

  /**
   * Send email notifications for project notifications
   * 
   * @param projectId - Project ID
   * @param notification - Notification data
   */
  private async sendNotificationEmails(
    projectId: string,
    notification: IProjectNotification
  ): Promise<void> {
    try {
      // Get project to get member information
      const project = await this.projectCoreService.getProject(projectId);
      if (!project) {
        return;
      }

      // Extract all member user IDs and emails
      const memberEmails = new Map<string, string>();
      
      if (project.manager && project.manager.email) {
        memberEmails.set(project.manager.userId, project.manager.email);
      }
      
      if (project.foreman && project.foreman.email) {
        memberEmails.set(project.foreman.userId, project.foreman.email);
      }
      
      project.members.forEach(member => {
        if (member.email) {
          memberEmails.set(member.userId, member.email);
        }
      });

      // Find emails for recipients
      const recipientEmails = notification.recipients
        .map(userId => memberEmails.get(userId))
        .filter(email => !!email) as string[];

      if (recipientEmails.length === 0) {
        return;
      }

      // Create email subject and content based on notification type
      const projectUrl = `${config.frontend.url}/projects/${projectId}`;
      let subject = notification.title;
      let content = notification.message;

      // Add link to view project
      content += `\n\nYou can view the project here: ${projectUrl}`;

      // Send email
      await this.sendGridService.sendEmail(
        recipientEmails,
        subject,
        content
      );
    } catch (error) {
      this.logger.error('Error sending notification emails', { error, projectId });
      // Continue execution even if email sending fails
    }
  }
}
