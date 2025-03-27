// backend/src/services/permit.service.ts - Part 1

import { DynamoDBDocumentClient, QueryCommand, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import { MongoClient } from 'mongodb';
import { Logger } from '../utils/logger';
import config from '../config';
import { 
  IPermit, 
  PermitType, 
  PermitStatus, 
  IPermitAssemblyMapping,
  IPermitGenerationResponse, 
  IPermitSubmissionResponse,
  IPermitApplicationRequest
} from '../types/permit.types';
import { TimelineEventType, TimelineEventStatus } from '../types/timeline.types';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Service for managing permits
 */
export class PermitService {
  private logger: Logger;
  private mongoClient: MongoClient | null = null;
  private assembliesCollection: any = null;
  private permitMappingsCollection: any = null;

  constructor(
    private docClient: DynamoDBDocumentClient,
    private s3Client: S3Client,
    private timelineService?: any
  ) {
    this.logger = new Logger('PermitService');
    this.initMongo();
  }

  /**
   * Initialize MongoDB connection
   */
  private async initMongo(): Promise<void> {
    try {
      if (!this.mongoClient) {
        this.mongoClient = new MongoClient(config.mongodb.uri);
        await this.mongoClient.connect();
        
        const db = this.mongoClient.db(config.mongodb.dbName);
        this.assembliesCollection = db.collection(config.mongodb.collections.assemblies);
        this.permitMappingsCollection = db.collection('permitMappings');
        
        this.logger.info('MongoDB connection established');
      }
    } catch (error) {
      this.logger.error('Error connecting to MongoDB', { error });
      throw error;
    }
  }

  /**
   * Get permit by ID
   * 
   * @param permitId - Permit ID
   * @returns Permit data or null if not found
   */
  async getPermit(permitId: string): Promise<IPermit | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.permits,
        Key: {
          PK: `PERMIT#${permitId}`,
          SK: 'METADATA'
        }
      }));

      return result.Item as IPermit || null;
    } catch (error) {
      this.logger.error('Error getting permit', { error, permitId });
      throw error;
    }
  }

  /**
   * List permits for a project
   * 
   * @param projectId - Project ID
   * @returns List of permits
   */
  async listProjectPermits(projectId: string): Promise<IPermit[]> {
    try {
      const result = await this.docClient.send(new QueryCommand({
        TableName: config.dynamodb.tables.permits,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': `PROJECT#${projectId}`
        }
      }));

      return (result.Items || []) as IPermit[];
    } catch (error) {
      this.logger.error('Error listing project permits', { error, projectId });
      throw error;
    }
  }
