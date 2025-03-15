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
        return {
          'application/pdf': ['.pdf'],
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'application/msword': ['.doc'],
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'application/vnd.ms-excel': ['.xls'],
          'text/plain': ['.txt']
        };
      default:
        return {};
    }
  }, [fileType]);

  // Handle file upload
  const handleUpload = useCallback(async (file: File) => {
    try {
      setError(null);
      
      // Track progress for this file
      const fileId = `file-${Date.now()}`;
      setUploadProgress(prev => ({ ...prev, [fileId]: 0 }));
      
      // Upload the file
      const uploadedFile = await fileService.uploadFile(
        file,
        projectId,
        fileType,
        description,
        tags,
        entityId,
        entityType,
        (progress) => {
          setUploadProgress(prev => ({ ...prev, [fileId]: progress }));
        }
      );
      
      // Update uploaded files list
      setUploadedFiles(prev => [...prev, uploadedFile]);
      
      // Cleanup progress
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        delete newProgress[fileId];
        return newProgress;
      });
      
      toast.success(`File "${file.name}" uploaded successfully`);
      return uploadedFile;
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'An error occurred during upload';
        
      setError(errorMessage);
      toast.error(`Upload failed: ${errorMessage}`);
      return null;
    }
  }, [projectId, fileType, description, tags, entityId, entityType]);

  // Handle drop event
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    // Don't allow multiple files if not specified
    if (!multiple && acceptedFiles.length > 1) {
      setError('Only one file can be uploaded at a time');
      toast.error('Only one file can be uploaded at a time');
      return;
    }
    
    setIsUploading(true);
    if (onUploadStart) onUploadStart();
    
    try {
      const uploadPromises = acceptedFiles.map(file => handleUpload(file));
      const uploadedFiles = await Promise.all(uploadPromises);
      const successfulUploads = uploadedFiles.filter(Boolean) as IFileMetadata[];
      
      if (successfulUploads.length > 0 && onUploadComplete) {
        onUploadComplete(successfulUploads);
      }
    } finally {
      setIsUploading(false);
    }
  }, [handleUpload, multiple, onUploadComplete, onUploadStart]);

  // Remove a file from the uploaded files list
  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.fileId !== fileId));
  }, []);

  // Reset the uploader
  const reset = useCallback(() => {
    setUploadedFiles([]);
    setUploadProgress({});
    setError(null);
  }, []);

  // Configure dropzone
  const { 
    getRootProps, 
    getInputProps, 
    isDragActive,
    isDragAccept,
    isDragReject 
  } = useDropzone({
    onDrop,
    accept: accept || getDefaultAccept(),
    maxSize,
    multiple,
    disabled: isUploading
  });

  // Determine drop zone styling based on state
  const getDropzoneClassName = useCallback(() => {
    let className = 'border-2 border-dashed rounded-lg p-6 transition-colors';
    
    if (isDragActive && isDragAccept) {
      className += ' border-green-500 bg-green-50';
    } else if (isDragActive && isDragReject) {
      className += ' border-red-500 bg-red-50';
    } else if (isDragActive) {
      className += ' border-blue-500 bg-blue-50';
    } else {
      className += ' border-gray-300 hover:border-blue-400';
    }
    
    if (isUploading) {
      className += ' opacity-50 cursor-not-allowed';
    }
    
    return className;
  }, [isDragActive, isDragAccept, isDragReject, isUploading]);

  return (
    <div className={`bg-white rounded-lg shadow-sm ${className}`}>
      <div className="p-4">
        <div {...getRootProps({ className: getDropzoneClassName() })}>
          <input {...getInputProps()} />
          
          <div className="text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400" />
            <p className="mt-2 text-sm text-gray-600">
              {isDragActive 
                ? 'Drop the files here...' 
                : 'Drag and drop files here, or click to select files'}
            </p>
            
            {fileType === FileType.BLUEPRINT && (
              <p className="text-xs text-gray-500 mt-1">
                Only PDF files are supported
              </p>
            )}
            
            {error && (
              <p className="text-xs text-red-500 mt-2 flex items-center justify-center">
                <AlertCircle className="h-3 w-3 mr-1" />
                {error}
              </p>
            )}
          </div>
        </div>

        {/* Show upload progress */}
        {Object.keys(uploadProgress).length > 0 && (
          <div className="mt-4 space-y-2">
            {Object.entries(uploadProgress).map(([fileId, progress]) => (
              <div key={fileId} className="text-xs">
                <div className="flex justify-between text-gray-500 mb-1">
                  <span>Uploading...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-500 h-2 rounded-full" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Show uploaded files */}
        {uploadedFiles.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              Uploaded Files
            </h3>
            <ul className="space-y-2">
              {uploadedFiles.map(file => (
                <li 
                  key={file.fileId} 
                  className="flex items-center justify-between bg-gray-50 p-2 rounded"
                >
                  <div className="flex items-center">
                    <FileText className="h-4 w-4 text-blue-500 mr-2" />
                    <span className="text-sm truncate max-w-xs">{file.originalName}</span>
                  </div>
                  <button
                    onClick={() => removeFile(file.fileId)}
                    className="text-gray-400 hover:text-gray-600"
                    title="Remove from list"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      
      {/* Loading state */}
      {isUploading && (
        <div className="flex items-center justify-center p-4 border-t border-gray-100">
          <Spinner className="mr-2" />
          <span className="text-sm text-gray-600">Uploading...</span>
        </div>
      )}
    </div>
  );
};

export default FileUploader;
