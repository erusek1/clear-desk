// backend/src/services/file.service.ts

import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DynamoDBDocumentClient, PutCommand, GetCommand, QueryCommand, UpdateCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../utils/logger';
import config from '../config';

/**
 * File types supported by the application
 */
export enum FileType {
  BLUEPRINT = 'blueprint',
  RECEIPT = 'receipt',
  PHOTO = 'photo',
  ATTACHMENT = 'attachment',
  DOCUMENT = 'document'
}

/**
 * File metadata stored in DynamoDB
 */
export interface IFileMetadata {
  fileId: string;
  projectId: string;
  originalName: string;
  fileType: FileType;
  s3Key: string;
  mimeType: string;
  size: number;
  description?: string;
  tags?: string[];
  entityId?: string;
  entityType?: string;
  created: string;
  updated: string;
  createdBy: string;
  updatedBy: string;
}

/**
 * Presigned URL request for file upload
 */
export interface IPresignedUrlRequest {
  projectId: string;
  fileName: string;
  fileType: FileType;
  contentType: string;
  description?: string;
  tags?: string[];
  entityId?: string;
  entityType?: string;
}

/**
 * Presigned URL response for file upload
 */
export interface IPresignedUrlResponse {
  fileId: string;
  uploadUrl: string;
  s3Key: string;
  fileName: string;
  expiresIn: number;
}

/**
 * File service for managing file uploads, downloads, and metadata
 */
export class FileService {
  private logger: Logger;
  private s3Client: S3Client;
  private docClient: DynamoDBDocumentClient;

  constructor(
    s3Client: S3Client,
    docClient: DynamoDBDocumentClient
  ) {
    this.logger = new Logger('FileService');
    this.s3Client = s3Client;
    this.docClient = docClient;
  }

  /**
   * Generate a presigned URL for file upload
   * 
   * @param request - Upload request details
   * @param userId - User ID making the request
   * @returns Presigned URL response
   */
  async getPresignedUploadUrl(
    request: IPresignedUrlRequest,
    userId: string
  ): Promise<IPresignedUrlResponse> {
    try {
      const fileId = uuidv4();
      const now = new Date().toISOString();
      
      // Generate S3 key based on file type and project ID
      const fileExtension = this.getFileExtension(request.fileName);
      const s3Key = `${request.fileType}s/${request.projectId}/${fileId}.${fileExtension}`;
      
      // Save file metadata to DynamoDB
      const metadata: IFileMetadata = {
        fileId,
        projectId: request.projectId,
        originalName: request.fileName,
        fileType: request.fileType,
        s3Key,
        mimeType: request.contentType,
        size: 0, // Will be updated after upload
        description: request.description,
        tags: request.tags,
        entityId: request.entityId,
        entityType: request.entityType,
        created: now,
        updated: now,
        createdBy: userId,
        updatedBy: userId
      };
      
      await this.docClient.send(new PutCommand({
        TableName: config.dynamodb.tables.files,
        Item: {
          PK: `PROJECT#${request.projectId}`,
          SK: `FILE#${fileId}`,
          GSI1PK: `FILE_TYPE#${request.fileType}`,
          GSI1SK: `PROJECT#${request.projectId}#${now}`,
          ...metadata
        }
      }));
      
      // Generate presigned URL
      const command = new PutObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: s3Key,
        ContentType: request.contentType
      });
      
      const expiresIn = 3600; // 1 hour
      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      
      return {
        fileId,
        uploadUrl,
        s3Key,
        fileName: request.fileName,
        expiresIn
      };
    } catch (error) {
      this.logger.error('Error generating presigned URL', { error, request });
      throw error;
    }
  }

  /**
   * Generate a presigned URL for file download
   * 
   * @param fileId - File ID
   * @param projectId - Project ID
   * @returns Presigned URL for download
   */
  async getPresignedDownloadUrl(fileId: string, projectId: string): Promise<string> {
    try {
      // Get file metadata
      const fileMetadata = await this.getFileMetadata(fileId, projectId);
      if (!fileMetadata) {
        throw new Error('File not found');
      }
      
      // Generate presigned URL for download
      const command = new GetObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: fileMetadata.s3Key
      });
      
      const downloadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
      return downloadUrl;
    } catch (error) {
      this.logger.error('Error generating download URL', { error, fileId, projectId });
      throw error;
    }
  }

  /**
   * Update file metadata after successful upload
   * 
   * @param fileId - File ID
   * @param projectId - Project ID
   * @param size - File size in bytes
   * @param userId - User ID making the update
   * @returns Updated file metadata
   */
  async updateFileMetadataAfterUpload(
    fileId: string,
    projectId: string,
    size: number,
    userId: string
  ): Promise<IFileMetadata> {
    try {
      // Update file metadata
      const result = await this.docClient.send(new UpdateCommand({
        TableName: config.dynamodb.tables.files,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `FILE#${fileId}`
        },
        UpdateExpression: 'set size = :size, updated = :updated, updatedBy = :updatedBy',
        ExpressionAttributeValues: {
          ':size': size,
          ':updated': new Date().toISOString(),
          ':updatedBy': userId
        },
        ReturnValues: 'ALL_NEW'
      }));
      
      return result.Attributes as IFileMetadata;
    } catch (error) {
      this.logger.error('Error updating file metadata', { error, fileId, projectId });
      throw error;
    }
  }

  /**
   * Get file metadata
   * 
   * @param fileId - File ID
   * @param projectId - Project ID
   * @returns File metadata or null if not found
   */
  async getFileMetadata(fileId: string, projectId: string): Promise<IFileMetadata | null> {
    try {
      const result = await this.docClient.send(new GetCommand({
        TableName: config.dynamodb.tables.files,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `FILE#${fileId}`
        }
      }));
      
      if (!result.Item) {
        return null;
      }
      
      return result.Item as IFileMetadata;
    } catch (error) {
      this.logger.error('Error getting file metadata', { error, fileId, projectId });
      throw error;
    }
  }

  /**
   * List files for a project
   * 
   * @param projectId - Project ID
   * @param fileType - Optional file type filter
   * @returns List of file metadata
   */
  async listProjectFiles(
    projectId: string,
    fileType?: FileType
  ): Promise<IFileMetadata[]> {
    try {
      if (fileType) {
        // Query by project ID and file type using GSI
        const result = await this.docClient.send(new QueryCommand({
          TableName: config.dynamodb.tables.files,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :fileType AND begins_with(GSI1SK, :projectPrefix)',
          ExpressionAttributeValues: {
            ':fileType': `FILE_TYPE#${fileType}`,
            ':projectPrefix': `PROJECT#${projectId}`
          }
        }));
        
        return (result.Items || []) as IFileMetadata[];
      } else {
        // Query by project ID
        const result = await this.docClient.send(new QueryCommand({
          TableName: config.dynamodb.tables.files,
          KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
          ExpressionAttributeValues: {
            ':pk': `PROJECT#${projectId}`,
            ':sk': 'FILE#'
          }
        }));
        
        return (result.Items || []) as IFileMetadata[];
      }
    } catch (error) {
      this.logger.error('Error listing project files', { error, projectId, fileType });
      throw error;
    }
  }

  /**
   * Delete a file and its metadata
   * 
   * @param fileId - File ID
   * @param projectId - Project ID
   * @returns True if deleted successfully
   */
  async deleteFile(fileId: string, projectId: string): Promise<boolean> {
    try {
      // Get file metadata
      const fileMetadata = await this.getFileMetadata(fileId, projectId);
      if (!fileMetadata) {
        throw new Error('File not found');
      }
      
      // Delete from S3
      await this.s3Client.send(new DeleteObjectCommand({
        Bucket: config.s3.buckets.files,
        Key: fileMetadata.s3Key
      }));
      
      // Delete metadata from DynamoDB
      await this.docClient.send(new DeleteCommand({
        TableName: config.dynamodb.tables.files,
        Key: {
          PK: `PROJECT#${projectId}`,
          SK: `FILE#${fileId}`
        }
      }));
      
      return true;
    } catch (error) {
      this.logger.error('Error deleting file', { error, fileId, projectId });
      throw error;
    }
  }

  /**
   * Get file extension from filename
   * 
   * @param fileName - Original filename
   * @returns File extension
   */
  private getFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    if (parts.length === 1) {
      return ''; // No extension
    }
    return parts[parts.length - 1].toLowerCase();
  }
}