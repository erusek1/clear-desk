// frontend/src/services/file.service.ts

import apiClient from './api';

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
 * File metadata
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
 * Upload progress callback
 */
export type ProgressCallback = (progress: number) => void;

/**
 * File service for managing file uploads, downloads, and metadata
 */
const fileService = {
  /**
   * Upload a file to S3 with progress tracking
   * 
   * @param file - File to upload
   * @param projectId - Project ID
   * @param fileType - File type
   * @param description - Optional description
   * @param tags - Optional tags
   * @param entityId - Optional related entity ID
   * @param entityType - Optional related entity type
   * @param onProgress - Optional progress callback
   * @returns Uploaded file metadata
   */
  async uploadFile(
    file: File,
    projectId: string,
    fileType: FileType,
    description?: string,
    tags?: string[],
    entityId?: string,
    entityType?: string,
    onProgress?: ProgressCallback
  ): Promise<IFileMetadata> {
    try {
      // 1. Get presigned URL
      const urlRequest: IPresignedUrlRequest = {
        projectId,
        fileName: file.name,
        fileType,
        contentType: file.type || 'application/octet-stream',
        description,
        tags,
        entityId,
        entityType
      };
      
      const presignedData = await apiClient.post<IPresignedUrlResponse>(
        '/files/upload-url',
        urlRequest
      );
      
      // 2. Upload file to S3
      await this.uploadToS3(file, presignedData.uploadUrl, onProgress);
      
      // 3. Confirm upload
      const confirmResponse = await apiClient.post<{ data: IFileMetadata }>(
        '/files/confirm-upload',
        {
          fileId: presignedData.fileId,
          projectId,
          size: file.size
        }
      );
      
      return confirmResponse.data;
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  },

  /**
   * Upload a blueprint PDF file
   * 
   * @param file - Blueprint file
   * @param projectId - Project ID
   * @param description - Optional description
   * @param onProgress - Optional progress callback
   * @returns Uploaded file metadata
   */
  async uploadBlueprint(
    file: File,
    projectId: string,
    description?: string,
    onProgress?: ProgressCallback
  ): Promise<IFileMetadata> {
    return this.uploadFile(
      file,
      projectId,
      FileType.BLUEPRINT,
      description,
      undefined,
      undefined,
      undefined,
      onProgress
    );
  },

  /**
   * Get download URL for a file
   * 
   * @param fileId - File ID
   * @param projectId - Project ID
   * @returns Download URL
   */
  async getDownloadUrl(fileId: string, projectId: string): Promise<string> {
    try {
      const response = await apiClient.get<{ url: string }>(
        `/files/download-url/${projectId}/${fileId}`
      );
      
      return response.url;
    } catch (error) {
      console.error('Error getting download URL:', error);
      throw error;
    }
  },

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
      const endpoint = fileType 
        ? `/files/list/${projectId}?fileType=${fileType}`
        : `/files/list/${projectId}`;
        
      return await apiClient.get<IFileMetadata[]>(endpoint);
    } catch (error) {
      console.error('Error listing project files:', error);
      throw error;
    }
  },

  /**
   * Delete a file
   * 
   * @param fileId - File ID
   * @param projectId - Project ID
   * @returns Success status
   */
  async deleteFile(fileId: string, projectId: string): Promise<boolean> {
    try {
      await apiClient.delete(`/files/${projectId}/${fileId}`);
      return true;
    } catch (error) {
      console.error('Error deleting file:', error);
      throw error;
    }
  },

  /**
   * Upload file to S3 with progress tracking
   * 
   * @param file - File to upload
   * @param presignedUrl - Presigned S3 URL
   * @param onProgress - Optional progress callback
   * @returns Success status
   */
  private async uploadToS3(
    file: File,
    presignedUrl: string,
    onProgress?: ProgressCallback
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Set up progress tracking
      if (onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        };
      }
      
      // Set up load and error handlers
      xhr.onload = () => {
        if (xhr.status === 200) {
          resolve(true);
        } else {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      };
      
      xhr.onerror = () => {
        reject(new Error('Upload failed due to network error'));
      };
      
      // Open and send the request
      xhr.open('PUT', presignedUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.send(file);
    });
  }
};

export default fileService;