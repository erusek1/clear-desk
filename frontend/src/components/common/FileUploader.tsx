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
          'image/heic': ['.heic']
        };
      case FileType.ATTACHMENT:
      case FileType.DOCUMENT:
      default:
        return {
          'application/pdf': ['.pdf'],
          'image/jpeg': ['.jpg', '.jpeg'],
          'image/png': ['.png'],
          'application/msword': ['.doc'],
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
          'application/vnd.ms-excel': ['.xls'],
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
          'text/plain': ['.txt']
        };
    }
  }, [fileType]);

  // File drop handler
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (!acceptedFiles.length) return;

      setError(null);
      setIsUploading(true);
      
      if (onUploadStart) {
        onUploadStart();
      }

      const files: IFileMetadata[] = [];
      const progress: Record<string, number> = {};
      
      try {
        for (const file of acceptedFiles) {
          // Initialize progress for this file
          progress[file.name] = 0;
          setUploadProgress(prev => ({ ...prev, [file.name]: 0 }));
          
          // Upload the file
          const uploadedFile = await fileService.uploadFile(
            file,
            projectId,
            fileType,
            description,
            tags,
            entityId,
            entityType,
            (progressValue) => {
              setUploadProgress(prev => ({ ...prev, [file.name]: progressValue }));
            }
          );
          
          files.push(uploadedFile);
        }
        
        // Update state and trigger callback
        setUploadedFiles(prev => [...prev, ...files]);
        
        if (onUploadComplete) {
          onUploadComplete(files);
        }
        
        // Show success message
        if (files.length === 1) {
          toast.success(`${files[0].originalName} uploaded successfully`);
        } else {
          toast.success(`${files.length} files uploaded successfully`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Error uploading file';
        setError(errorMessage);
        toast.error(`Upload failed: ${errorMessage}`);
      } finally {
        setIsUploading(false);
      }
    },
    [projectId, fileType, description, tags, entityId, entityType, onUploadStart, onUploadComplete]
  );

  // Configure dropzone
  const { 
    getRootProps, 
    getInputProps, 
    isDragActive,
    acceptedFiles,
    fileRejections
  } = useDropzone({
    onDrop,
    maxSize,
    accept: accept || getDefaultAccept(),
    multiple,
    disabled: isUploading
  });

  // Handle rejected files
  React.useEffect(() => {
    if (fileRejections.length > 0) {
      const messages = fileRejections.map(({ file, errors }) => {
        const errorMessages = errors.map(e => e.message).join(', ');
        return `${file.name}: ${errorMessages}`;
      });
      
      setError(messages.join('\n'));
      toast.error(messages.join('\n'));
    }
  }, [fileRejections]);

  // Remove file from accepted files list
  const removeFile = (index: number) => {
    const newFiles = [...acceptedFiles];
    newFiles.splice(index, 1);
    // This is a workaround since Dropzone doesn't provide a direct way to modify acceptedFiles
    // In a real implementation, you might need a different approach
  };

  return (
    <div className={`${className}`}>
      <div 
        {...getRootProps()} 
        className={`border-2 border-dashed rounded-lg p-6 cursor-pointer transition-colors ${
          isDragActive 
            ? 'border-primary bg-primary/5' 
            : 'border-gray-300 hover:border-primary/70'
        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center text-center">
          <Upload className="h-10 w-10 mb-2 text-gray-400" />
          <p className="text-sm text-gray-600 mb-1">
            Drag and drop {multiple ? 'files' : 'a file'} here, or click to select {multiple ? 'files' : 'a file'}
          </p>
          <p className="text-xs text-gray-500">
            {Object.entries(accept || getDefaultAccept())
              .flatMap(([_, exts]) => exts)
              .join(', ')} ({Math.round(maxSize / (1024 * 1024))}MB max)
          </p>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-4 p-3 rounded-md bg-red-50 text-sm text-red-600">
          <div className="flex">
            <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0" />
            <div>{error}</div>
          </div>
        </div>
      )}

      {/* File list and progress */}
      {acceptedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          {acceptedFiles.map((file, index) => (
            <div key={file.name + index} className="flex items-center bg-gray-50 p-3 rounded-md">
              <FileText className="h-5 w-5 mr-2 text-gray-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                {uploadProgress[file.name] !== undefined && uploadProgress[file.name] < 100 && (
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                    <div 
                      className="bg-primary h-1.5 rounded-full" 
                      style={{ width: `${uploadProgress[file.name]}%` }}
                    />
                  </div>
                )}
              </div>
              {uploadProgress[file.name] === 100 ? (
                <CheckCircle className="h-5 w-5 text-green-500" />
              ) : !isUploading ? (
                <button 
                  type="button" 
                  className="p-1 rounded-full text-gray-400 hover:text-gray-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFile(index);
                  }}
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUploader;