// frontend/src/components/common/FileUploader.tsx

import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { toast } from 'react-hot-toast';
import { Upload, FileText, CheckCircle, AlertCircle, X } from 'lucide-react';
import fileService, { FileType, IFileMetadata } from '../../services/file.service';
import { Spinner } from './Spinner';

/**
 * File uploader props
 */
interface FileUploaderProps {
  /** Project ID */
  projectId: string;
  /** File type */
  fileType: FileType;
  /** Optional description */
  description?: string;
  /** Optional tags */
  tags?: string[];
  /** Optional related entity ID */
  entityId?: string;
  /** Optional related entity type */
  entityType?: string;
  /** Max file size in bytes (default: 50MB) */
  maxSize?: number;
  /** Accepted file types (default: based on fileType) */
  accept?: Record<string, string[]>;
  /** Allow multiple files (default: false) */
  multiple?: boolean;
  /** CSS class names */
  className?: string;
  /** Callback when upload is complete */
  onUploadComplete?: (files: IFileMetadata[]) => void;
  /** Callback when upload is started */
  onUploadStart?: () => void;
}

/**
 * Reusable file uploader component with drag and drop support
 */
export const FileUploader: React.FC<FileUploaderProps> = ({
  projectId,
  fileType,
  description,
  tags,
  entityId,
  entityType,
  maxSize = 50 * 1024 * 1024, // 50MB
  accept,
  multiple = false,
  className = '',
  onUploadComplete,
  onUploadStart
}) => {
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [uploadedFiles, setUploadedFiles] = useState<IFileMetadata[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine accepted file types if not provided
  const getDefaultAccept = useCallback(() => {
    switch (fileType) {
      case FileType.BLUEPRINT:
        return { 'application/pdf': ['.pdf'] };
      case FileType.PHOTO:
        return { 'image/*': ['.png', '.jpg', '.jpeg', '.gif'] };
      case FileType.RECEIPT:
        return { 
          'application/pdf': ['.pdf'],
          'image/*': ['.png', '.jpg', '.jpeg'] 
        };
      case FileType.DOCUMENT:
      case FileType.ATTACHMENT:
      default:
        return { 
          'application/pdf': ['.pdf'],
          'image/*': ['.png', '.jpg', '.jpeg'],
          'application/msword': ['.doc'],
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'application/vnd.ms-excel': ['.xls'],
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'text/plain': ['.txt'] 
        };
    }
  }, [fileType]);

  // File upload handler
  const uploadFile = useCallback(async (file: File) => {
    try {
      // Create a unique ID for this file to track progress
      const fileId = `file_${Date.now()}_${file.name}`;
      
      // Initialize progress for this file
      setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));
      
      // Track progress
      const onProgress = (progress: number) => {
        setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
      };
      
      // Upload file
      const result = await fileService.uploadFile(
        file,
        projectId,
        fileType,
        description,
        tags,
        entityId,
        entityType,
        onProgress
      );
      
      // Add to uploaded files
      setUploadedFiles(prev => [...prev, result]);
      
      // Show success toast
      toast.success(`${file.name} uploaded successfully`);
      
      return result;
    } catch (error) {
      console.error('Error uploading file:', error);
      toast.error(`Failed to upload ${file.name}`);
      throw error;
    }
  }, [projectId, fileType, description, tags, entityId, entityType]);

  // Handle file drop
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setError(null);
    setIsUploading(true);
    
    if (onUploadStart) {
      onUploadStart();
    }
    
    try {
      const uploadPromises = acceptedFiles.map(file => uploadFile(file));
      const uploadedFilesData = await Promise.all(uploadPromises);
      
      if (onUploadComplete) {
        onUploadComplete(uploadedFilesData);
      }
    } catch (err) {
      setError('Some files failed to upload. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [uploadFile, onUploadStart, onUploadComplete]);

  // Configure dropzone
  const { 
    getRootProps, 
    getInputProps, 
    isDragActive,
    fileRejections
  } = useDropzone({
    onDrop,
    maxSize,
    accept: accept || getDefaultAccept(),
    multiple,
    disabled: isUploading
  });

  // Show file rejection errors
  React.useEffect(() => {
    if (fileRejections.length > 0) {
      const errors = fileRejections.map(({ file, errors }) => {
        const errorMessages = errors.map(e => e.message).join(', ');
        return `${file.name}: ${errorMessages}`;
      }).join('\n');
      
      setError(`Some files were rejected: ${errors}`);
    }
  }, [fileRejections]);

  // Calculate total progress across all files
  const totalProgress = Object.values(uploadProgress).length > 0
    ? Object.values(uploadProgress).reduce((sum, curr) => sum + curr, 0) / Object.values(uploadProgress).length
    : 0;

  // Handle file removal
  const removeUploadedFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.fileId !== fileId));
  };

  return (
    <div className={className}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/70'}
          ${isUploading ? 'opacity-50 pointer-events-none' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center justify-center space-y-2">
          <Upload className="h-10 w-10 text-gray-400" />
          
          <p className="text-sm text-gray-600">
            {isDragActive
              ? 'Drop the files here...'
              : `Drag and drop ${multiple ? 'files' : 'a file'}, or click to select`
            }
          </p>
          
          <p className="text-xs text-gray-500">
            {fileType === FileType.BLUEPRINT 
              ? 'Only PDF files are accepted' 
              : 'Accepted file formats depend on file type'}
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
          <div className="flex items-start">
            <AlertCircle className="mr-2 h-5 w-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {isUploading && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
            <span>Uploading...</span>
            <span>{Math.round(totalProgress)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200">
            <div 
              className="h-2 rounded-full bg-primary transition-all" 
              style={{ width: `${totalProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Uploaded files list */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium text-gray-700">Uploaded files</p>
          <div className="space-y-2">
            {uploadedFiles.map(file => (
              <div 
                key={file.fileId} 
                className="flex items-center justify-between rounded-md border border-gray-200 p-3"
              >
                <div className="flex items-center">
                  <FileText className="mr-2 h-5 w-5 text-primary" />
                  <span className="text-sm text-gray-900">{file.originalName}</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="mr-2 h-4 w-4 text-green-600" />
                  <button
                    onClick={() => removeUploadedFile(file.fileId)}
                    className="ml-2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;