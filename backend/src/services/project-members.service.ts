// backend/src/services/project-members.service.ts

import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '../utils/logger';
import config from '../config';
import { IProject, IProjectMember, ProjectRole, ProjectPermission } from '../types/project.types';
import { SendGridService } from './sendgrid.service';
import { ProjectCoreService } from './project-core.service';

/**
 * Project Members Service for managing project team members
 */
export class ProjectMembersService {
  private logger: Logger;
  private sendGridService: SendGridService;
  private projectCoreService: ProjectCoreService;

  constructor(
    private docClient: DynamoDBDocumentClient
  ) {
    this.logger = new Logger('ProjectMembersService');
    this.sendGridService = new SendGridService();
    this.projectCoreService = new ProjectCoreService(docClient, null);
  }

  /**
   * Add a member to a project
   * 
   * @param projectId - Project ID
   * @param member - Project member data
   * @param currentUserId - User ID making the change
   * @returns Updated project
   */
  async addProjectMember(
    projectId: string,
    member: IProjectMember,
    currentUserId: string
  ): Promise<IProject | null> {
    try {
      // Get current project
      const project = await this.projectCoreService.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Check if user is already a member
      const existingMemberIndex = project.members.findIndex(m => m.userId === member.userId);
      
      // Add member to special roles if specified
      let updateExpression = '';
      const expressionAttributeValues: Record<string, any> = {
        ':updated': new Date().toISOString(),
        ':updatedBy': currentUserId
      };
      const expressionAttributeNames: Record<string, string> = {};

      if (member.role === ProjectRole.MANAGER) {
        // If assigning as manager, move any existing manager to regular members
        if (project.manager) {
          const currentManager = { ...project.manager };
          
          // Only add to members if not already in the list
          if (!project.members.some(m => m.userId === currentManager.userId)) {
            project.members.push(currentManager);
          }
        }
        
        updateExpression += 'set #manager = :manager, ';
        expressionAttributeNames['#manager'] = 'manager';
        expressionAttributeValues[':manager'] = member;
      } else if (member.role === ProjectRole.FOREMAN) {
        // If assigning as foreman, move any existing foreman to regular members
        if (project.foreman) {
          const currentForeman = { ...project.foreman };
          
          // Only add to members if not already in the list
          if (!project.members.some(m => m.userId === currentForeman.userId)) {
            project.members.push(currentForeman);
          }
        }
        
        updateExpression += 'set #foreman = :foreman, ';
        expressionAttributeNames['#foreman'] = 'foreman';
        expressionAttributeValues[':foreman'] = member;
      } else {
        // Regular team member - update or add to members array
        let updatedMembers: IProjectMember[];
        
        if (existingMemberIndex >= 0) {
          // Update existing member
          updatedMembers = [...project.members];
          updatedMembers[existingMemberIndex] = member;
        } else {
          // Add new member
          updatedMembers = [...project.members, member];
        }
        
        updateExpression += 'set #members = :members, ';
        expressionAttributeNames['#members'] = 'members';
        expressionAttributeValues[':members'] = updatedMembers;
      }

      // Complete the update expression
      updateExpression += 'updated = :updated, updatedBy = :updatedBy';

      // Update project
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

      // Send invitation email
      await this.sendMemberInvitation(
        projectId,
        project.name,
        member,
        currentUserId
      );

      // Record activity
      await this.recordMemberActivity(
        projectId,
        member.userId,
        existingMemberIndex >= 0 ? 'project_member_updated' : 'project_member_added',
        {
          role: member.role,
          permissions: member.permissions
        },
        currentUserId
      );

      return result.Attributes as IProject;
    } catch (error) {
      this.logger.error('Error adding project member', { error, projectId, userId: member.userId });
      throw error;
    }
  }

  /**
   * Remove a member from a project
   * 
   * @param projectId - Project ID
   * @param userId - User ID to remove
   * @param currentUserId - User ID making the change
   * @returns Updated project
   */
  async removeProjectMember(
    projectId: string,
    userId: string,
    currentUserId: string
  ): Promise<IProject | null> {
    try {
      // Get current project
      const project = await this.projectCoreService.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Find user's role in the project
      let isManager = false;
      let isForeman = false;
      let isRegularMember = false;
      let memberName = '';

      if (project.manager && project.manager.userId === userId) {
        isManager = true;
        memberName = `${project.manager.firstName} ${project.manager.lastName}`;
      } else if (project.foreman && project.foreman.userId === userId) {
        isForeman = true;
        memberName = `${project.foreman.firstName} ${project.foreman.lastName}`;
      } else {
        const memberIndex = project.members.findIndex(m => m.userId === userId);
        if (memberIndex >= 0) {
          isRegularMember = true;
          const member = project.members[memberIndex];
          memberName = `${member.firstName} ${member.lastName}`;
        }
      }

      // If user is not a member, return current project
      if (!isManager && !isForeman && !isRegularMember) {
        return project;
      }

      // Build update expression based on member's role
      let updateExpression = '';
      const expressionAttributeValues: Record<string, any> = {
        ':updated': new Date().toISOString(),
        ':updatedBy': currentUserId
      };
      const expressionAttributeNames: Record<string, string> = {};

      if (isManager) {
        updateExpression += 'REMOVE #manager, ';
        expressionAttributeNames['#manager'] = 'manager';
      } else if (isForeman) {
        updateExpression += 'REMOVE #foreman, ';
        expressionAttributeNames['#foreman'] = 'foreman';
      } else {
        // Remove from members array
        const updatedMembers = project.members.filter(m => m.userId !== userId);
        updateExpression += 'set #members = :members, ';
        expressionAttributeNames['#members'] = 'members';
        expressionAttributeValues[':members'] = updatedMembers;
      }

      // Complete the update expression
      updateExpression += 'updated = :updated, updatedBy = :updatedBy';

      // Update project
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
      await this.recordMemberActivity(
        projectId,
        userId,
        'project_member_removed',
        {
          name: memberName,
          wasManager: isManager,
          wasForeman: isForeman
        },
        currentUserId
      );

      return result.Attributes as IProject;
    } catch (error) {
      this.logger.error('Error removing project member', { error, projectId, userId });
      throw error;
    }
  }

  /**
   * Update a member's role in a project
   * 
   * @param projectId - Project ID
   * @param userId - User ID to update
   * @param newRole - New role
   * @param newPermissions - New permissions
   * @param currentUserId - User ID making the change
   * @returns Updated project
   */
  async updateMemberRole(
    projectId: string,
    userId: string,
    newRole: ProjectRole,
    newPermissions: ProjectPermission[],
    currentUserId: string
  ): Promise<IProject | null> {
    try {
      // Get current project
      const project = await this.projectCoreService.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Find user in project
      let existingMember: IProjectMember | null = null;
      let currentRole: ProjectRole | null = null;

      if (project.manager && project.manager.userId === userId) {
        existingMember = { ...project.manager };
        currentRole = ProjectRole.MANAGER;
      } else if (project.foreman && project.foreman.userId === userId) {
        existingMember = { ...project.foreman };
        currentRole = ProjectRole.FOREMAN;
      } else {
        const memberIndex = project.members.findIndex(m => m.userId === userId);
        if (memberIndex >= 0) {
          existingMember = { ...project.members[memberIndex] };
          currentRole = existingMember.role;
        }
      }

      // If user is not a member, throw error
      if (!existingMember || !currentRole) {
        throw new Error('User is not a member of this project');
      }

      // If role and permissions are the same, return current project
      if (currentRole === newRole && 
          JSON.stringify(existingMember.permissions.sort()) === JSON.stringify(newPermissions.sort())) {
        return project;
      }

      // Update member with new role and permissions
      const updatedMember: IProjectMember = {
        ...existingMember,
        role: newRole,
        permissions: newPermissions
      };

      // Remove from current role (if special role)
      if (currentRole === ProjectRole.MANAGER || currentRole === ProjectRole.FOREMAN) {
        // First remove from special role
        await this.removeProjectMember(projectId, userId, currentUserId);
      }

      // Add to new role
      return await this.addProjectMember(projectId, updatedMember, currentUserId);
    } catch (error) {
      this.logger.error('Error updating member role', { error, projectId, userId, newRole });
      throw error;
    }
  }

  /**
   * Get a user's projects
   * 
   * @param userId - User ID
   * @returns List of projects
   */
  async getUserProjects(userId: string): Promise<IProject[]> {
    try {
      // TODO: Implement this when the GSI is set up for user-project lookups
      // For now, we'll search for the user in each project, which is inefficient
      // This would be much better with a GSI that indexes by userId
      
      // This is just a placeholder for now
      return [];
    } catch (error) {
      this.logger.error('Error getting user projects', { error, userId });
      throw error;
    }
  }

  /**
   * Record member activity
   * 
   * @param projectId - Project ID
   * @param memberId - Member User ID
   * @param action - Activity action
   * @param details - Activity details
   * @param currentUserId - User ID making the change
   * @returns Activity ID
   */
  private async recordMemberActivity(
    projectId: string,
    memberId: string,
    action: string,
    details: any,
    currentUserId: string
  ): Promise<string> {
    try {
      // Use the existing activity recording function from the core service
      // We're not exposing this implementation detail in the public API
      return await (this.projectCoreService as any).recordActivity(
        projectId,
        memberId,
        'user',
        action,
        details,
        currentUserId
      );
    } catch (error) {
      this.logger.error('Error recording member activity', { error, projectId, memberId, action });
      throw error;
    }
  }

  /**
   * Send invitation email to a new project member
   * 
   * @param projectId - Project ID
   * @param projectName - Project name
   * @param member - Project member data
   * @param currentUserId - User ID making the change
   */
  private async sendMemberInvitation(
    projectId: string,
    projectName: string,
    member: IProjectMember,
    currentUserId: string
  ): Promise<void> {
    try {
      if (!member.email) {
        this.logger.warn('Cannot send member invitation - email missing', {
          projectId,
          userId: member.userId
        });
        return;
      }

      // Get user who made the change to include their name
      // TODO: Implement UserService and use it here to get user details
      const senderName = "Team Member"; // Placeholder

      // Role-specific message
      let roleMessage = '';
      switch (member.role) {
        case ProjectRole.MANAGER:
          roleMessage = 'You have been assigned as the Project Manager.';
          break;
        case ProjectRole.FOREMAN:
          roleMessage = 'You have been assigned as the Project Foreman.';
          break;
        case ProjectRole.ESTIMATOR:
          roleMessage = 'You have been added as an Estimator on this project.';
          break;
        case ProjectRole.ELECTRICIAN:
          roleMessage = 'You have been added as an Electrician on this project.';
          break;
        case ProjectRole.APPRENTICE:
          roleMessage = 'You have been added as an Apprentice on this project.';
          break;
        default:
          roleMessage = `You have been added with the role: ${member.role}.`;
      }

      await this.sendGridService.sendProjectInvitation(
        projectId,
        projectName,
        member.email,
        `${member.firstName} ${member.lastName}`,
        senderName,
        `${roleMessage} You can now access the project and collaborate with the team.`
      );
    } catch (error) {
      this.logger.error('Error sending member invitation', {
        error,
        projectId,
        userId: member.userId
      });
      // Continue execution even if notification fails
    }
  }
}
