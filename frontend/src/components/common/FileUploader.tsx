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
      case FileType.RECEIPT:
        return {
          'application/pdf': ['.pdf'],
          'image/jpeg': ['.jpg', '.jpeg'],
          'image/png': ['.png']
        };
      case FileType.PHOTO:
        return {
          'image/jpeg': ['.jpg', '.jpeg'],
          'image/png': ['.png'],
          'image/webp': ['.webp']
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
          'image/jpeg': ['.jpg', '.jpeg'],
          'image/png': ['.png']
        };
    }
  }, [fileType]);

  // File upload handler
  const uploadFile = useCallback(
    async (file: File) => {
      try {
        const fileId = `${Date.now()}-${file.name}`;
        
        // Update progress state
        setUploadProgress(prev => ({
          ...prev,
          [fileId]: 0
        }));
        
        // Upload file
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
              [fileId]: progress
            }));
          }
        );
        
        // Update uploaded files
        setUploadedFiles(prev => [...prev, uploadedFile]);
        
        return uploadedFile;
      } catch (error) {
        console.error('Error uploading file:', error);
        throw error;
      }
    },
    [projectId, fileType, description, tags, entityId, entityType]
  );

  // Handle drop event
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      
      // Clear previous errors
      setError(null);
      
      // Notify upload start
      if (onUploadStart) {
        onUploadStart();
      }
      
      // Set uploading state
      setIsUploading(true);
      
      try {
        const results = [];
        
        // Upload files sequentially to avoid overwhelming the server
        for (const file of acceptedFiles) {
          const result = await uploadFile(file);
          results.push(result);
        }
        
        // Notify upload complete
        if (onUploadComplete) {
          onUploadComplete(results);
        }
        
        toast.success(`${acceptedFiles.length} file(s) uploaded successfully`);
      } catch (error) {
        console.error('Error during upload:', error);
        setError(error instanceof Error ? error.message : 'File upload failed');
        toast.error('File upload failed');
      } finally {
        setIsUploading(false);
      }
    },
    [uploadFile, onUploadStart, onUploadComplete]
  );

  // Remove file from uploaded files
  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.fileId !== fileId));
  }, []);

  // Configure dropzone
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    maxSize,
    accept: accept || getDefaultAccept(),
    multiple,
    disabled: isUploading
  });

  // Check for file rejections
  React.useEffect(() => {
    if (fileRejections.length > 0) {
      const errors = fileRejections.map(({ file, errors }) => {
        const errorMessages = errors.map(e => e.message).join(', ');
        return `${file.name}: ${errorMessages}`;
      }).join('\n');
      
      setError(errors);
      toast.error('Some files were rejected');
    }
  }, [fileRejections]);

  return (
    <div className={className}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/70'}
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          Drag and drop {multiple ? 'files' : 'a file'}, or click to select
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {Object.entries(accept || getDefaultAccept())
            .flatMap(([_, exts]) => exts)
            .join(', ')} {multiple ? 'files' : 'file'} up to {(maxSize / (1024 * 1024)).toFixed(0)}MB
        </p>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="mt-2 text-sm text-red-600">
          <p className="font-medium">Error:</p>
          <p>{error}</p>
        </div>
      )}
      
      {/* Upload progress */}
      {isUploading && Object.keys(uploadProgress).length > 0 && (
        <div className="mt-4 space-y-2">
          {Object.entries(uploadProgress).map(([fileId, progress]) => (
            <div key={fileId} className="text-sm">
              <div className="flex justify-between text-gray-600 mb-1">
                <span>{fileId.split('-').slice(1).join('-')}</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-primary h-2 rounded-full"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-medium text-gray-700 mb-2">Uploaded files:</p>
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div 
                key={file.fileId} 
                className="flex items-center justify-between bg-gray-50 p-3 rounded-md border border-gray-200"
              >
                <div className="flex items-center">
                  <FileText className="h-5 w-5 text-gray-500 mr-2" />
                  <span className="text-sm text-gray-900 truncate max-w-xs">
                    {file.originalName}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(file.fileId)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FileUploader;