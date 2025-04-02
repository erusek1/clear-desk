// backend/src/services/project-timeline.service.ts

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';
import { 
  ITimelineEvent, 
  TimelineEventType, 
  TimelineEventStatus,
  ITimeline,
  ITimelinePrediction,
  IProjectSchedule
} from '../types/timeline.types';

/**
 * Service for managing project timelines and scheduling
 */
export class ProjectTimelineService {
  private logger: Logger;

  constructor(
    private docClient: DynamoDBDocumentClient
  ) {
    this.logger = new Logger('ProjectTimelineService');
  }

  /**
   * Get project timeline
   * 
   * @param projectId - Project ID
   * @returns Timeline data
   */
  async getProjectTimeline(projectId: string): Promise<ITimeline> {
    try {
      // Get all timeline events for the project
      const eventsResult = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.timelineEvents,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`
        },
        ScanIndexForward: true // Sort by date (oldest first)
      }));

      const events = (eventsResult.Items || []) as ITimelineEvent[];

      // Get project data to determine predicted end date
      const projectResult = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        }
      }));

      const project = projectResult.Item;
      const predictedEndDate = project?.predictedEndDate || null;

      return {
        projectId,
        events,
        predictedEndDate,
        lastUpdated: new Date().toISOString()
      };
    } catch (error) {
      this.logger.error('Error getting project timeline', { error, projectId });
      throw error;
    }
  }

  /**
   * Add event to project timeline
   * 
   * @param eventData - Timeline event data
   * @param userId - User ID creating the event
   * @returns Created event
   */
  async addEvent(
    eventData: Partial<ITimelineEvent> & { 
      projectId: string;
      eventType: TimelineEventType;
      title: string;
    },
    userId: string
  ): Promise<ITimelineEvent> {
    try {
      const eventId = uuidv4();
      const now = new Date().toISOString();

      // Create timeline event
      const timelineEvent: ITimelineEvent = {
        eventId,
        projectId: eventData.projectId,
        eventType: eventData.eventType,
        title: eventData.title,
        description: eventData.description || '',
        status: eventData.status || TimelineEventStatus.PENDING,
        scheduledDate: eventData.scheduledDate || now,
        actualDate: eventData.actualDate,
        duration: eventData.duration,
        relatedEntityType: eventData.relatedEntityType,
        relatedEntityId: eventData.relatedEntityId,
        isPrediction: eventData.isPrediction || false,
        confidenceScore: eventData.isPrediction ? (eventData.confidenceScore || 0.5) : undefined,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };

      // Save event to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.timelineEvents,
        Item: {
          PK: `EVENT#${eventId}`,
          SK: 'METADATA',
          GSI1PK: `PROJECT#${eventData.projectId}`,
          GSI1SK: `EVENT#${timelineEvent.scheduledDate}`,
          ...timelineEvent
        }
      }));

      // Update project predictions if this is a significant event
      if (this.isSignificantEvent(eventData.eventType)) {
        await this.updateProjectPredictions(eventData.projectId, userId);
      }

      return timelineEvent;
    } catch (error) {
      this.logger.error('Error adding timeline event', { error, eventData });
      throw error;
    }
  }

  /**
   * Update timeline event
   * 
   * @param eventId - Event ID
   * @param eventData - Updated event data
   * @param userId - User ID updating the event
   * @returns Updated event
   */
  async updateEvent(
    eventId: string,
    eventData: Partial<ITimelineEvent>,
    userId: string
  ): Promise<ITimelineEvent | null> {
    try {
      // Get the event first to verify it exists
      const eventResult = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.timelineEvents,
        Key: {
          PK: `EVENT#${eventId}`,
          SK: 'METADATA'
        }
      }));

      if (!eventResult.Item) {
        return null;
      }

      const existingEvent = eventResult.Item as ITimelineEvent;
      
      // Prepare update expression
      let updateExpression = 'set ';
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, any> = {};
      
      // Add field updates to the expression
      if (eventData.title !== undefined) {
        updateExpression += 'title = :title, ';
        expressionAttributeValues[':title'] = eventData.title;
      }
      
      if (eventData.description !== undefined) {
        updateExpression += 'description = :description, ';
        expressionAttributeValues[':description'] = eventData.description;
      }
      
      if (eventData.status !== undefined) {
        updateExpression += '#status = :status, ';
        expressionAttributeNames['#status'] = 'status';
        expressionAttributeValues[':status'] = eventData.status;
      }
      
      if (eventData.scheduledDate !== undefined) {
        updateExpression += 'scheduledDate = :scheduledDate, ';
        expressionAttributeValues[':scheduledDate'] = eventData.scheduledDate;
      }
      
      if (eventData.actualDate !== undefined) {
        updateExpression += 'actualDate = :actualDate, ';
        expressionAttributeValues[':actualDate'] = eventData.actualDate;
      }
      
      if (eventData.duration !== undefined) {
        updateExpression += 'duration = :duration, ';
        expressionAttributeValues[':duration'] = eventData.duration;
      }
      
      // Add common fields
      updateExpression += 'updated = :updated, updatedBy = :updatedBy';
      expressionAttributeValues[':updated'] = new Date().toISOString();
      expressionAttributeValues[':updatedBy'] = userId;
      
      // Update the event
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.timelineEvents,
        Key: {
          PK: `EVENT#${eventId}`,
          SK: 'METADATA'
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW'
      }));

      if (!result.Attributes) {
        return null;
      }

      const updatedEvent = result.Attributes as ITimelineEvent;

      // Update project predictions if this is a significant event status change
      if (eventData.status !== undefined && this.isSignificantEvent(existingEvent.eventType)) {
        await this.updateProjectPredictions(existingEvent.projectId, userId);
      }

      return updatedEvent;
    } catch (error) {
      this.logger.error('Error updating timeline event', { error, eventId, eventData });
      throw error;
    }
  }

  /**
   * Generate timeline predictions for a project
   * 
   * @param projectId - Project ID
   * @param userId - User ID generating the predictions
   * @returns Timeline predictions
   */
  async generateTimelinePredictions(
    projectId: string,
    userId: string
  ): Promise<ITimelinePrediction> {
    try {
      // Get project data
      const projectResult = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        }
      }));

      if (!projectResult.Item) {
        throw new Error(`Project ${projectId} not found`);
      }

      const project = projectResult.Item;

      // Get existing timeline events
      const eventsResult = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.timelineEvents,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`
        },
        ScanIndexForward: true // Sort by date (oldest first)
      }));

      const existingEvents = (eventsResult.Items || []) as ITimelineEvent[];
      
      // Get company's historical project data
      const companyId = project.companyId;
      const historicalProjects = await this.getCompanyHistoricalProjects(companyId);
      
      // Find similar projects based on type, size, etc.
      const similarProjects = this.findSimilarProjects(project, historicalProjects);
      
      // Generate predictions based on similar projects
      const predictions = this.generatePredictions(
        projectId, 
        project, 
        existingEvents, 
        similarProjects
      );
      
      // Save predictions to DynamoDB (as timeline events with isPrediction=true)
      const savedPredictions: ITimelineEvent[] = [];
      for (const prediction of predictions.predictedEvents) {
        try {
          const savedEvent = await this.addEvent({
            ...prediction,
            isPrediction: true
          }, userId);
          
          savedPredictions.push(savedEvent);
        } catch (err) {
          this.logger.error('Error saving prediction event', { err, prediction });
          // Continue with other predictions
        }
      }
      
      // Update project with predicted end date
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set predictedEndDate = :predictedEndDate, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':predictedEndDate': predictions.predictedEndDate,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        }
      }));
      
      return {
        ...predictions,
        predictedEvents: savedPredictions
      };
    } catch (error) {
      this.logger.error('Error generating timeline predictions', { error, projectId });
      throw error;
    }
  }

  /**
   * Create or update project schedule
   * 
   * @param schedule - Project schedule data
   * @param userId - User ID updating the schedule
   * @returns Updated schedule
   */
  async updateProjectSchedule(
    schedule: IProjectSchedule,
    userId: string
  ): Promise<IProjectSchedule> {
    try {
      const now = new Date().toISOString();
      
      // Check if project exists
      const projectResult = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${schedule.projectId}`,
          SK: 'METADATA'
        }
      }));

      if (!projectResult.Item) {
        throw new Error(`Project ${schedule.projectId} not found`);
      }
      
      // Save schedule to DynamoDB
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.projectSchedules,
        Item: {
          PK: `PROJECT#${schedule.projectId}`,
          SK: 'SCHEDULE',
          ...schedule,
          updated: now,
          updatedBy: userId
        }
      }));
      
      // Update project with start and end dates from schedule
      await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.projects,
        Key: {
          PK: `PROJECT#${schedule.projectId}`,
          SK: 'METADATA'
        },
        UpdateExpression: 'set startDate = :startDate, endDate = :endDate, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':startDate': schedule.startDate,
          ':endDate': schedule.endDate || null,
          ':updated': now,
          ':updatedBy': userId
        }
      }));
      
      return schedule;
    } catch (error) {
      this.logger.error('Error updating project schedule', { error, projectId: schedule.projectId });
      throw error;
    }
  }

  /**
   * Get project schedule
   * 
   * @param projectId - Project ID
   * @returns Project schedule or null if not found
   */
  async getProjectSchedule(projectId: string): Promise<IProjectSchedule | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.projectSchedules,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: 'SCHEDULE'
        }
      }));

      return result.Item as IProjectSchedule || null;
    } catch (error) {
      this.logger.error('Error getting project schedule', { error, projectId });
      throw error;
    }
  }

  /**
   * Check if event type is significant for predictions
   * 
   * @param eventType - Event type
   * @returns True if significant
   */
  private isSignificantEvent(eventType: TimelineEventType): boolean {
    const significantEvents = [
      TimelineEventType.ESTIMATE_ACCEPTED,
      TimelineEventType.PERMIT_APPROVED,
      TimelineEventType.PHASE_STARTED,
      TimelineEventType.PHASE_COMPLETED,
      TimelineEventType.INSPECTION_COMPLETED
    ];
    
    return significantEvents.includes(eventType);
  }

  /**
   * Update project predictions after significant events
   * 
   * @param projectId - Project ID
   * @param userId - User ID
   */
  private async updateProjectPredictions(projectId: string, userId: string): Promise<void> {
    try {
      // Delete existing prediction events
      const existingPredictions = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.timelineEvents,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        FilterExpression: 'isPrediction = :isPrediction',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`,
          ':isPrediction': true
        }
      }));
      
      // Delete each prediction
      if (existingPredictions.Items && existingPredictions.Items.length > 0) {
        for (const prediction of existingPredictions.Items) {
          await this.docClient.send(new UpdateCommand({
            TableName: config.dynamodb.tables.timelineEvents,
            Key: {
              PK: `EVENT#${prediction.eventId}`,
              SK: 'METADATA'
            },
            UpdateExpression: 'set #status = :status, updated = :updated, updatedBy = :updatedBy',
            ExpressionAttributeNames: {
              '#status': 'status'
            },
            ExpressionAttributeValues: {
              ':status': TimelineEventStatus.CANCELED,
              ':updated': new Date().toISOString(),
              ':updatedBy': userId
            }
          }));
        }
      }
      
      // Generate new predictions
      await this.generateTimelinePredictions(projectId, userId);
    } catch (error) {
      this.logger.error('Error updating project predictions', { error, projectId });
      // Don't rethrow as this is a background operation
    }
  }

  /**
   * Get company's historical projects
   * 
   * @param companyId - Company ID
   * @returns List of historical projects
   */
  private async getCompanyHistoricalProjects(companyId: string): Promise<any[]> {
    try {
      // Get completed projects for the company
      const projectsResult = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.projects,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status'
        },
        ExpressionAttributeValues: {
          ':pk': `COMPANY#${companyId}`,
          ':status': 'completed'
        }
      }));
      
      return projectsResult.Items || [];
    } catch (error) {
      this.logger.error('Error getting company historical projects', { error, companyId });
      return [];
    }
  }

  /**
   * Find similar projects based on type, size, etc.
   * 
   * @param currentProject - Current project
   * @param historicalProjects - Historical projects
   * @returns List of similar projects with similarity scores
   */
  private findSimilarProjects(currentProject: any, historicalProjects: any[]): { projectId: string; similarity: number }[] {
    const similarProjects: { projectId: string; similarity: number }[] = [];
    
    for (const project of historicalProjects) {
      let similarity = 0;
      
      // Check project type
      if (project.type === currentProject.type) {
        similarity += 0.3;
      }
      
      // Check project size (square footage)
      if (project.squareFootage && currentProject.squareFootage) {
        const sizeDiff = Math.abs(project.squareFootage - currentProject.squareFootage) / currentProject.squareFootage;
        if (sizeDiff < 0.1) {
          similarity += 0.3;
        } else if (sizeDiff < 0.3) {
          similarity += 0.2;
        } else if (sizeDiff < 0.5) {
          similarity += 0.1;
        }
      }
      
      // Check customer
      if (project.customer?.id === currentProject.customer?.id) {
        similarity += 0.2;
      }
      
      // Check general contractor
      if (project.generalContractor?.id === currentProject.generalContractor?.id) {
        similarity += 0.2;
      }
      
      // If similarity is above threshold, add to list
      if (similarity > 0.3) {
        similarProjects.push({
          projectId: project.projectId,
          similarity
        });
      }
    }
    
    // Sort by similarity (highest first)
    return similarProjects.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Generate predictions based on similar projects
   * 
   * @param projectId - Current project ID
   * @param project - Current project data
   * @param existingEvents - Existing timeline events
   * @param similarProjects - Similar projects
   * @returns Timeline prediction
   */
  private generatePredictions(
    projectId: string,
    project: any,
    existingEvents: ITimelineEvent[],
    similarProjects: { projectId: string; similarity: number }[]
  ): ITimelinePrediction {
    // Default prediction values (if no similar projects)
    let predictedEndDate = new Date();
    predictedEndDate.setDate(predictedEndDate.getDate() + 90); // Default: 90 days from now
    
    const predictedEvents: Partial<ITimelineEvent>[] = [];
    let predictionConfidence = 0.5;
    
    // Get non-prediction events
    const actualEvents = existingEvents.filter(event => !event.isPrediction);
    
    // Find the latest event date
    let latestEventDate = new Date();
    if (actualEvents.length > 0) {
      const eventDates = actualEvents.map(event => new Date(event.actualDate || event.scheduledDate));
      latestEventDate = new Date(Math.max(...eventDates.map(date => date.getTime())));
    }
    
    // If we have similar projects, use them for predictions
    if (similarProjects.length > 0) {
      // Calculate average durations for key phases
      const phaseDurations: Record<string, number[]> = {};
      const phaseProbabilities: Record<string, number[]> = {};
      
      // Total similarity for weighted average
      const totalSimilarity = similarProjects.reduce((sum, p) => sum + p.similarity, 0);
      
      // Process similar projects
      // (Note: In a real implementation, we would query the database for 
      // timeline events from the similar projects, but we'll simulate this here)
      
      // For this simplified example, predict based on average durations
      // In a real implementation, you would use more sophisticated methods
      if (similarProjects.length > 0) {
        // Average project duration is 90 days with variations based on similarity
        const avgDuration = 90 * (1 + (Math.random() * 0.2 - 0.1)); // ±10% variation
        
        predictedEndDate = new Date(latestEventDate);
        predictedEndDate.setDate(predictedEndDate.getDate() + avgDuration);
        
        // Generate predicted events
        const phases = ['rough', 'service', 'finish'];
        const now = new Date();
        
        let phaseStartDate = new Date(latestEventDate);
        
        for (const phase of phases) {
          // Skip phases that are already completed
          const phaseCompleted = actualEvents.some(
            event => event.eventType === TimelineEventType.PHASE_COMPLETED && 
                    event.description?.toLowerCase().includes(phase)
          );
          
          if (phaseCompleted) {
            continue;
          }
          
          // Phase duration is between 14-28 days with variations
          const phaseDuration = 14 + Math.floor(Math.random() * 14);
          
          // Phase start
          phaseStartDate.setDate(phaseStartDate.getDate() + Math.floor(Math.random() * 7)); // 0-7 days gap between phases
          
          // Only include future events
          if (phaseStartDate > now) {
            predictedEvents.push({
              projectId,
              eventType: TimelineEventType.PHASE_STARTED,
              title: `${phase.charAt(0).toUpperCase() + phase.slice(1)} Phase Start`,
              description: `Predicted start of ${phase} phase`,
              status: TimelineEventStatus.PENDING,
              scheduledDate: phaseStartDate.toISOString(),
              relatedEntityType: 'phase',
              relatedEntityId: phase,
              isPrediction: true,
              confidenceScore: 0.7 - (0.1 * phases.indexOf(phase)) // Confidence decreases for later phases
            });
          }
          
          // Phase end
          const phaseEndDate = new Date(phaseStartDate);
          phaseEndDate.setDate(phaseEndDate.getDate() + phaseDuration);
          
          if (phaseEndDate > now) {
            predictedEvents.push({
              projectId,
              eventType: TimelineEventType.PHASE_COMPLETED,
              title: `${phase.charAt(0).toUpperCase() + phase.slice(1)} Phase Complete`,
              description: `Predicted completion of ${phase} phase`,
              status: TimelineEventStatus.PENDING,
              scheduledDate: phaseEndDate.toISOString(),
              relatedEntityType: 'phase',
              relatedEntityId: phase,
              isPrediction: true,
              confidenceScore: 0.65 - (0.1 * phases.indexOf(phase)) // Confidence decreases for later phases
            });
          }
          
          // Inspection
          const inspectionDate = new Date(phaseEndDate);
          inspectionDate.setDate(inspectionDate.getDate() + 2 + Math.floor(Math.random() * 3)); // 2-5 days after phase completion
          
          if (inspectionDate > now) {
            predictedEvents.push({
              projectId,
              eventType: TimelineEventType.INSPECTION_SCHEDULED,
              title: `${phase.charAt(0).toUpperCase() + phase.slice(1)} Inspection`,
              description: `Predicted inspection for ${phase} phase`,
              status: TimelineEventStatus.PENDING,
              scheduledDate: inspectionDate.toISOString(),
              relatedEntityType: 'inspection',
              relatedEntityId: `${phase}-inspection`,
              isPrediction: true,
              confidenceScore: 0.6 - (0.1 * phases.indexOf(phase)) // Confidence decreases for later phases
            });
          }
          
          // Update phase start date for the next phase
          phaseStartDate = new Date(phaseEndDate);
        }
        
        // Project completion event
        predictedEvents.push({
          projectId,
          eventType: TimelineEventType.PROJECT_COMPLETED,
          title: 'Project Completion',
          description: 'Predicted project completion date',
          status: TimelineEventStatus.PENDING,
          scheduledDate: predictedEndDate.toISOString(),
          relatedEntityType: 'project',
          relatedEntityId: projectId,
          isPrediction: true,
          confidenceScore: 0.5 // Lower confidence for the final completion date
        });
        
        // Set prediction confidence based on similar projects
        predictionConfidence = Math.min(0.85, 0.5 + (similarProjects.length * 0.05));
      }
    }
    
    return {
      projectId,
      predictedEvents,
      predictedEndDate: predictedEndDate.toISOString(),
      predictionConfidence,
      factorsConsidered: [
        'historical project data',
        'project type',
        'project size',
        'customer history',
        'current progress'
      ],
      similarProjects
    };
  }
}