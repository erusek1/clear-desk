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
        return { 
          'application/pdf': ['.pdf'],
          'image/*': ['.jpg', '.jpeg', '.png']
        };
      case FileType.DOCUMENT:
      case FileType.ATTACHMENT:
      default:
        return { 
          'application/pdf': ['.pdf'],
          'application/msword': ['.doc'],
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'application/vnd.ms-excel': ['.xls'],
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'text/plain': ['.txt'],
          'image/*': ['.jpg', '.jpeg', '.png']
        };
    }
  }, [fileType]);

  // Update progress for a specific file
  const handleProgress = useCallback((file: File, progress: number) => {
    setUploadProgress(prev => ({
      ...prev,
      [file.name]: progress
    }));
  }, []);

  // Handle file upload
  const handleUpload = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    
    setIsUploading(true);
    setError(null);
    onUploadStart?.();
    
    const uploadedItems: IFileMetadata[] = [];
    
    try {
      for (const file of files) {
        // Initialize progress
        setUploadProgress(prev => ({
          ...prev,
          [file.name]: 0
        }));
        
        // Upload file
        const fileData = await fileService.uploadFile(
          file,
          projectId,
          fileType,
          description,
          tags,
          entityId,
          entityType,
          progress => handleProgress(file, progress)
        );
        
        uploadedItems.push(fileData);
      }
      
      setUploadedFiles(prev => [...prev, ...uploadedItems]);
      
      if (uploadedItems.length > 0) {
        toast.success(`${uploadedItems.length} file(s) uploaded successfully`);
        onUploadComplete?.(uploadedItems);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during upload');
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
    }
  }, [projectId, fileType, description, tags, entityId, entityType, onUploadStart, onUploadComplete, handleProgress]);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop: handleUpload,
    accept: accept || getDefaultAccept(),
    maxSize,
    multiple,
    disabled: isUploading
  });

  // Handle rejection errors
  const fileRejectionItems = fileRejections.map(({ file, errors }) => (
    <div key={file.name} className="text-sm text-red-500">
      <p className="font-medium">{file.name}</p>
      <ul className="mt-1 list-disc pl-5">
        {errors.map(e => (
          <li key={e.code}>{e.message}</li>
        ))}
      </ul>
    </div>
  ));

  // Clear a specific uploaded file
  const clearUploadedFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.fileId !== fileId));
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          Drag and drop {fileType} {multiple ? 'files' : 'file'}, or click to select
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {getFileTypeDescription(fileType)}
        </p>
      </div>

      {/* Errors */}
      {error && (
        <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {fileRejections.length > 0 && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                The following {fileRejections.length > 1 ? 'files were' : 'file was'} rejected:
              </h3>
              <div className="mt-2 text-sm text-red-700">
                {fileRejectionItems}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Progress */}
      {Object.keys(uploadProgress).length > 0 && isUploading && (
        <div className="space-y-2">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="rounded-md bg-gray-50 p-3">
              <div className="flex items-center">
                <FileText className="h-5 w-5 text-gray-400 mr-2" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {fileName}
                  </p>
                  <div className="mt-1 relative h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div 
                      className="absolute left-0 top-0 h-full bg-blue-500" 
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>
                <span className="text-xs text-gray-500">{progress}%</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Uploaded Files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-gray-700">Uploaded Files</h3>
          {uploadedFiles.map((file) => (
            <div key={file.fileId} className="rounded-md bg-gray-50 p-3 flex justify-between items-center">
              <div className="flex items-center">
                <FileText className="h-5 w-5 text-gray-400 mr-2" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {file.originalName}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatBytes(file.size)}
                  </p>
                </div>
              </div>
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                <button 
                  onClick={() => clearUploadedFile(file.fileId)}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Get descriptive text for file types
 */
function getFileTypeDescription(fileType: FileType): string {
  switch (fileType) {
    case FileType.BLUEPRINT:
      return 'Accepted: PDF files (max 50MB)';
    case FileType.PHOTO:
      return 'Accepted: JPG, JPEG, PNG, GIF (max 50MB)';
    case FileType.RECEIPT:
      return 'Accepted: PDF, JPG, JPEG, PNG (max 50MB)';
    case FileType.DOCUMENT:
    case FileType.ATTACHMENT:
    default:
      return 'Accepted: PDF, DOCX, XLSX, JPG, PNG, TXT (max 50MB)';
  }
}

/**
 * Format bytes to human readable format
 */
function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}