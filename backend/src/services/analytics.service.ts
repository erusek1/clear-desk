// backend/src/services/analytics.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { Logger } from '../utils/logger';
import config from '../config';
import { IProjectPerformance, IEstimateAccuracy, IDeviceAnalysis, IPhaseAnalysis } from '../types/analytics.types';

/**
 * Service for project analytics and reporting
 */
export class AnalyticsService {
  private logger: Logger;

  constructor(
    private docClient: DynamoDBDocumentClient
  ) {
    this.logger = new Logger('AnalyticsService');
  }

  /**
   * Get project performance metrics
   * 
   * @param projectId - Project ID
   * @returns Project performance metrics
   */
  async getProjectPerformance(projectId: string): Promise<IProjectPerformance> {
    try {
      // Get project details
      const project = await this.getProject(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Get latest estimate
      const estimate = await this.getLatestEstimate(projectId);

      // Get time tracking data
      const timeEntries = await this.getTimeEntries(projectId);
      
      // Calculate actual hours worked
      const actualHours = this.calculateActualHours(timeEntries);
      
      // Calculate labor efficiency
      const laborEfficiency = estimate ? 
        (estimate.financials.totalLaborHours > 0 ? 
          (estimate.financials.totalLaborHours / actualHours) * 100 : 0) : 0;
      
      // Get material costs
      const materialCosts = await this.getMaterialCosts(projectId);
      
      // Calculate material variance
      const materialVariance = estimate ? 
        ((materialCosts - estimate.financials.totalMaterialCost) / 
         estimate.financials.totalMaterialCost) * 100 : 0;
      
      // Calculate projected vs actual cost
      const projectedTotalCost = estimate ? estimate.financials.totalCost : 0;
      const actualLaborCost = estimate ? 
        actualHours * estimate.financials.laborRate : 0;
      const actualTotalCost = actualLaborCost + materialCosts;
      
      // Calculate cost variance
      const costVariance = projectedTotalCost > 0 ? 
        ((actualTotalCost - projectedTotalCost) / projectedTotalCost) * 100 : 0;
      
      // Get project milestones and calculate schedule adherence
      const scheduleAdherence = await this.calculateScheduleAdherence(projectId);
      
      // Compile performance metrics
      return {
        projectId,
        projectName: project.name,
        projectStatus: project.status,
        estimatedLaborHours: estimate ? estimate.financials.totalLaborHours : 0,
        actualLaborHours: actualHours,
        laborEfficiency,
        estimatedMaterialCost: estimate ? estimate.financials.totalMaterialCost : 0,
        actualMaterialCost: materialCosts,
        materialVariance,
        projectedTotalCost,
        actualTotalCost,
        costVariance,
        scheduleAdherence,
        phaseAnalysis: await this.getPhaseAnalysis(projectId),
        deviceAnalysis: await this.getDeviceAnalysis(projectId)
      };
    } catch (error) {
      this.logger.error('Error getting project performance', { error, projectId });
      throw error;
    }
  }

  /**
   * Get estimate accuracy metrics for a company
   * 
   * @param companyId - Company ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Estimate accuracy metrics
   */
  async getEstimateAccuracy(
    companyId: string,
    startDate?: string,
    endDate?: string
  ): Promise<IEstimateAccuracy> {
    try {
      // Get completed projects
      const projects = await this.getCompletedProjects(companyId, startDate, endDate);
      
      if (projects.length === 0) {
        return {
          companyId,
          projectCount: 0,
          averageLaborAccuracy: 0,
          averageMaterialAccuracy: 0,
          averageTotalAccuracy: 0,
          projectAccuracies: []
        };
      }
      
      // Calculate accuracy metrics for each project
      const projectAccuracies = [];
      let totalLaborAccuracy = 0;
      let totalMaterialAccuracy = 0;
      let totalAccuracy = 0;
      
      for (const project of projects) {
        // Get project performance
        const performance = await this.getProjectPerformance(project.id);
        
        // Calculate accuracies (100% - variance)
        const laborAccuracy = 100 - Math.abs(
          (performance.estimatedLaborHours > 0 ?
            (performance.actualLaborHours - performance.estimatedLaborHours) / 
            performance.estimatedLaborHours * 100 : 0)
        );
        
        const materialAccuracy = 100 - Math.abs(performance.materialVariance);
        const totalAccuracyValue = 100 - Math.abs(performance.costVariance);
        
        // Add to totals
        totalLaborAccuracy += laborAccuracy;
        totalMaterialAccuracy += materialAccuracy;
        totalAccuracy += totalAccuracyValue;
        
        // Add to project accuracies
        projectAccuracies.push({
          projectId: project.id,
          projectName: project.name,
          laborAccuracy,
          materialAccuracy,
          totalAccuracy: totalAccuracyValue
        });
      }
      
      // Calculate averages
      return {
        companyId,
        projectCount: projects.length,
        averageLaborAccuracy: totalLaborAccuracy / projects.length,
        averageMaterialAccuracy: totalMaterialAccuracy / projects.length,
        averageTotalAccuracy: totalAccuracy / projects.length,
        projectAccuracies
      };
    } catch (error) {
      this.logger.error('Error getting estimate accuracy', { error, companyId });
      throw error;
    }
  }

  /**
   * Get phase analysis for a project
   * 
   * @param projectId - Project ID
   * @returns Phase analysis data
   */
  private async getPhaseAnalysis(projectId: string): Promise<IPhaseAnalysis[]> {
    try {
      // Get estimate phases
      const estimate = await this.getLatestEstimate(projectId);
      if (!estimate || !estimate.phases) {
        return [];
      }
      
      // Get time entries by phase
      const timeEntries = await this.getTimeEntries(projectId);
      
      // Calculate actual hours by phase
      const phaseHours: Record<string, number> = {};
      for (const entry of timeEntries) {
        if (entry.phases) {
          for (const phase of entry.phases) {
            const phaseName = phase.phase.toLowerCase();
            phaseHours[phaseName] = (phaseHours[phaseName] || 0) + phase.hours;
          }
        }
      }
      
      // Create phase analysis
      return estimate.phases.map(phase => {
        const phaseName = phase.name.toLowerCase();
        const actualHours = phaseHours[phaseName] || 0;
        const hourVariance = phase.laborHours > 0 ? 
          ((actualHours - phase.laborHours) / phase.laborHours) * 100 : 0;
        
        return {
          phase: phase.name,
          estimatedHours: phase.laborHours,
          actualHours,
          hourVariance,
          estimatedCost: phase.totalCost,
          actualCost: actualHours * estimate.financials.laborRate
        };
      });
    } catch (error) {
      this.logger.error('Error getting phase analysis', { error, projectId });
      return [];
    }
  }

  /**
   * Get device analysis for a project
   * 
   * @param projectId - Project ID
   * @returns Device analysis data
   */
  private async getDeviceAnalysis(projectId: string): Promise<IDeviceAnalysis[]> {
    try {
      // Get estimate
      const estimate = await this.getLatestEstimate(projectId);
      if (!estimate || !estimate.rooms) {
        return [];
      }
      
      // Count devices by type
      const deviceCounts: Record<string, {
        count: number;
        laborHours: number;
        materialCost: number;
      }> = {};
      
      // Process all rooms and items
      for (const room of estimate.rooms) {
        for (const item of room.items) {
          const deviceType = item.deviceType;
          
          if (!deviceCounts[deviceType]) {
            deviceCounts[deviceType] = {
              count: 0,
              laborHours: 0,
              materialCost: 0
            };
          }
          
          deviceCounts[deviceType].count += item.quantity;
          deviceCounts[deviceType].laborHours += item.laborHours;
          deviceCounts[deviceType].materialCost += item.materialCost;
        }
      }
      
      // Convert to array
      return Object.entries(deviceCounts).map(([deviceType, data]) => ({
        deviceType,
        count: data.count,
        laborHours: data.laborHours,
        materialCost: data.materialCost,
        totalCost: data.laborHours * (estimate.financials.laborRate || 0) + data.materialCost
      }));
    } catch (error) {
      this.logger.error('Error getting device analysis', { error, projectId });
      return [];
    }
  }

  /**
   * Calculate schedule adherence for a project
   * 
   * @param projectId - Project ID
   * @returns Schedule adherence percentage
   */
  private async calculateScheduleAdherence(projectId: string): Promise<number> {
    try {
      // Get project milestones
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projectMilestones,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`
        }
      }));
      
      const milestones = result.Items || [];
      
      if (milestones.length === 0) {
        return 100; // No milestones, assume on schedule
      }
      
      // Count completed milestones and on-time milestones
      let completedCount = 0;
      let onTimeCount = 0;
      
      for (const milestone of milestones) {
        if (milestone.status === 'COMPLETED') {
          completedCount++;
          
          if (milestone.completedDate && milestone.plannedDate) {
            const planned = new Date(milestone.plannedDate).getTime();
            const actual = new Date(milestone.completedDate).getTime();
            
            if (actual <= planned) {
              onTimeCount++;
            }
          }
        }
      }
      
      // Calculate adherence
      return completedCount > 0 ? (onTimeCount / completedCount) * 100 : 100;
    } catch (error) {
      this.logger.error('Error calculating schedule adherence', { error, projectId });
      return 100; // Default to 100% on schedule
    }
  }

  /**
   * Get project by ID
   * 
   * @param projectId - Project ID
   * @returns Project data or null if not found
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

      return result.Item || null;
    } catch (error) {
      this.logger.error('Error getting project', { error, projectId });
      return null;
    }
  }

  /**
   * Get latest estimate for a project
   * 
   * @param projectId - Project ID
   * @returns Latest estimate or null if not found
   */
  private async getLatestEstimate(projectId: string): Promise<any | null> {
    try {
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

      return result.Items && result.Items.length > 0 ? result.Items[0] : null;
    } catch (error) {
      this.logger.error('Error getting latest estimate', { error, projectId });
      return null;
    }
  }

  /**
   * Get time entries for a project
   * 
   * @param projectId - Project ID
   * @returns Time entries
   */
  private async getTimeEntries(projectId: string): Promise<any[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.timeTracking,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`,
          ':sk': 'TIMESHEET#'
        }
      }));

      return result.Items || [];
    } catch (error) {
      this.logger.error('Error getting time entries', { error, projectId });
      return [];
    }
  }

  /**
   * Calculate actual hours worked on a project
   * 
   * @param timeEntries - Time entries
   * @returns Total hours worked
   */
  private calculateActualHours(timeEntries: any[]): number {
    try {
      // Only count approved timesheets
      const approvedEntries = timeEntries.filter(entry => entry.status === 'approved');
      
      // Sum up hours
      return approvedEntries.reduce((total, entry) => total + (entry.hours || 0), 0);
    } catch (error) {
      this.logger.error('Error calculating actual hours', { error });
      return 0;
    }
  }

  /**
   * Get material costs for a project
   * 
   * @param projectId - Project ID
   * @returns Total material costs
   */
  private async getMaterialCosts(projectId: string): Promise<number> {
    try {
      // Get material transactions for the project
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.inventoryTransactions,
        IndexName: 'GSI3',
        KeyConditionExpression: 'GSI3PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`
        }
      }));

      const transactions = result.Items || [];
      
      // Sum up material costs
      return transactions.reduce((total, transaction) => {
        // Only count allocations (materials used for project)
        if (transaction.type === 'ALLOCATION') {
          return total + (transaction.cost || 0);
        }
        return total;
      }, 0);
    } catch (error) {
      this.logger.error('Error getting material costs', { error, projectId });
      return 0;
    }
  }

  /**
   * Get completed projects for a company
   * 
   * @param companyId - Company ID
   * @param startDate - Optional start date filter
   * @param endDate - Optional end date filter
   * @returns Completed projects
   */
  private async getCompletedProjects(
    companyId: string,
    startDate?: string,
    endDate?: string
  ): Promise<any[]> {
    try {
      // Start with basic query
      let params: any = {
        TableName: config.dynamodb.tables.projects,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':pk': `COMPANY#${companyId}`,
          ':status': 'COMPLETED'
        }
      };
      
      // Add date filters if provided
      if (startDate || endDate) {
        let dateFilter = '';
        
        if (startDate && endDate) {
          dateFilter = 'completedDate BETWEEN :start AND :end';
          params.ExpressionAttributeValues[':start'] = startDate;
          params.ExpressionAttributeValues[':end'] = endDate;
        } else if (startDate) {
          dateFilter = 'completedDate >= :start';
          params.ExpressionAttributeValues[':start'] = startDate;
        } else if (endDate) {
          dateFilter = 'completedDate <= :end';
          params.ExpressionAttributeValues[':end'] = endDate;
        }
        
        params.FilterExpression += ' AND ' + dateFilter;
      }
      
      const result = await this.docClient.send(new QueryCommand(params));
      
      return (result.Items || []).map(item => ({
        id: item.id || item.projectId,
        name: item.name,
        completedDate: item.completedDate
      }));
    } catch (error) {
      this.logger.error('Error getting completed projects', { error, companyId });
      return [];
    }
  }
}