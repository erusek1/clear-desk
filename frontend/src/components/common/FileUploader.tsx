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
        return { 'image/*': ['.jpg', '.jpeg', '.png', '.gif'] };
      case FileType.RECEIPT:
        return { 'application/pdf': ['.pdf'], 'image/*': ['.jpg', '.jpeg', '.png'] };
      case FileType.DOCUMENT:
        return {
          'application/pdf': ['.pdf'],
          'application/msword': ['.doc'],
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'application/vnd.ms-excel': ['.xls'],
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'text/plain': ['.txt']
        };
      default:
        return { 'application/octet-stream': ['*'] };
    }
  }, [fileType]);

  // Upload handler
  const handleUpload = useCallback(async (files: File[]) => {
    if (!files.length) return;
    
    try {
      setIsUploading(true);
      setError(null);
      
      // Initialize progress tracking
      const initialProgress: Record<string, number> = {};
      files.forEach(file => {
        initialProgress[file.name] = 0;
      });
      setUploadProgress(initialProgress);
      
      // Notify upload start
      if (onUploadStart) {
        onUploadStart();
      }
      
      // Upload files sequentially
      const uploadedFilesData: IFileMetadata[] = [];
      
      for (const file of files) {
        const uploadedFile = await fileService.uploadFile(
          file,
          projectId,
          fileType,
          description,
          tags,
          entityId,
          entityType,
          (progress) => {
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: progress
            }));
          }
        );
        
        uploadedFilesData.push(uploadedFile);
        toast.success(`Uploaded ${file.name} successfully`);
      }
      
      setUploadedFiles(prev => [...prev, ...uploadedFilesData]);
      
      // Notify upload complete
      if (onUploadComplete) {
        onUploadComplete(uploadedFilesData);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Error uploading file';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
    }
  }, [projectId, fileType, description, tags, entityId, entityType, onUploadStart, onUploadComplete]);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive, acceptedFiles, fileRejections } = useDropzone({
    onDrop: handleUpload,
    accept: accept || getDefaultAccept(),
    maxSize,
    multiple,
    disabled: isUploading
  });

  // Handle rejected files
  React.useEffect(() => {
    if (fileRejections.length > 0) {
      const errors = fileRejections.map(rejection => {
        const errorMessages = rejection.errors.map(err => err.message).join(', ');
        return `${rejection.file.name}: ${errorMessages}`;
      }).join('\n');
      
      setError(errors);
      toast.error('Some files were rejected', {
        duration: 5000,
      });
    }
  }, [fileRejections]);

  // Remove a file from the list
  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.fileId !== fileId));
  };

  return (
    <div className={`w-full ${className}`}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/70'}
          ${isUploading ? 'opacity-70 pointer-events-none' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        {isUploading ? (
          <div className="flex flex-col items-center justify-center space-y-2">
            <Spinner className="text-primary" />
            <p className="text-sm text-gray-600">
              Uploading {Object.keys(uploadProgress).length} file(s)...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center">
            <Upload className="h-10 w-10 text-gray-400 mb-2" />
            <p className="text-base text-gray-600">
              Drag and drop your {fileType.toLowerCase()} here, or click to browse
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {multiple ? 'You can upload multiple files' : 'Only one file can be uploaded at a time'}
            </p>
            <p className="text-xs text-gray-500">
              Maximum file size: {Math.round(maxSize / (1024 * 1024))}MB
            </p>
          </div>
        )}
      </div>
      
      {/* Error message */}
      {error && (
        <div className="mt-2 p-3 bg-red-50 text-red-600 text-sm rounded-md">
          <div className="font-medium">Error uploading file:</div>
          <div className="whitespace-pre-line">{error}</div>
        </div>
      )}
      
      {/* Progress bars */}
      {isUploading && Object.keys(uploadProgress).length > 0 && (
        <div className="mt-4 space-y-3">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span className="truncate">{fileName}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all duration-300 ease-in-out"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Uploaded files list */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Uploaded files</h4>
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div 
                key={file.fileId}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-md border border-gray-200"
              >
                <div className="flex items-center">
                  <FileText className="h-5 w-5 text-primary mr-2" />
                  <span className="text-sm text-gray-700 truncate max-w-[200px]">
                    {file.originalName}
                  </span>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <button
                    type="button"
                    onClick={() => removeFile(file.fileId)}
                    className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    aria-label="Remove file"
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