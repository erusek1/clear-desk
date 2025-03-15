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
        return { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] };
      case FileType.RECEIPT:
        return { 
          'application/pdf': ['.pdf'],
          'image/*': ['.png', '.jpg', '.jpeg']
        };
      default:
        return undefined;
    }
  }, [fileType]);

  // Update progress for a file
  const updateProgress = useCallback((fileId: string, progress: number) => {
    setUploadProgress(prev => ({
      ...prev,
      [fileId]: progress
    }));
  }, []);

  // Handle file upload
  const handleUpload = useCallback(async (files: File[]) => {
    if (!files.length) return;

    setIsUploading(true);
    setError(null);
    onUploadStart?.();

    const uploads: IFileMetadata[] = [];
    const tempFileIds: Record<string, string> = {};

    try {
      // Upload each file sequentially
      for (const file of files) {
        const tempId = URL.createObjectURL(file);
        tempFileIds[tempId] = file.name;
        setUploadProgress(prev => ({ ...prev, [tempId]: 0 }));

        const uploadedFile = await fileService.uploadFile(
          file,
          projectId,
          fileType,
          description,
          tags,
          entityId,
          entityType,
          (progress) => updateProgress(tempId, progress)
        );

        uploads.push(uploadedFile);
      }

      setUploadedFiles(prev => [...prev, ...uploads]);
      
      if (onUploadComplete) {
        onUploadComplete(uploads);
      }

      toast.success(`${uploads.length} file${uploads.length !== 1 ? 's' : ''} uploaded successfully`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred during upload';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsUploading(false);
      
      // Clean up temporary progress entries
      setUploadProgress(prev => {
        const newProgress = { ...prev };
        Object.keys(tempFileIds).forEach(id => {
          delete newProgress[id];
        });
        return newProgress;
      });
    }
  }, [
    projectId, 
    fileType, 
    description, 
    tags, 
    entityId, 
    entityType, 
    onUploadComplete, 
    onUploadStart, 
    updateProgress
  ]);

  // Dropzone configuration
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop: handleUpload,
    maxSize,
    accept: accept || getDefaultAccept(),
    multiple,
    disabled: isUploading,
  });

  // Handle file rejection
  React.useEffect(() => {
    if (fileRejections.length > 0) {
      const rejection = fileRejections[0];
      let errorMessage = 'File rejected: ';
      
      if (rejection.errors.some(e => e.code === 'file-too-large')) {
        errorMessage += `File is larger than ${maxSize / (1024 * 1024)}MB`;
      } else if (rejection.errors.some(e => e.code === 'file-invalid-type')) {
        errorMessage += 'File type not supported';
      } else {
        errorMessage += rejection.errors[0].message;
      }
      
      setError(errorMessage);
      toast.error(errorMessage);
    }
  }, [fileRejections, maxSize]);

  // Clear a specific file
  const handleClearFile = (fileId: string) => {
    setUploadedFiles(files => files.filter(file => file.fileId !== fileId));
  };

  // Clear all files
  const handleClearAll = () => {
    setUploadedFiles([]);
  };

  return (
    <div className={`bg-white p-4 rounded-md shadow ${className}`}>
      {/* Upload area */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-md p-6 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-primary/50'
        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
      >
        <input {...getInputProps()} />
        
        <Upload className="mx-auto h-10 w-10 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          {isDragActive
            ? 'Drop the files here...'
            : `Drag & drop ${fileType.toLowerCase()} ${multiple ? 'files' : 'file'} here, or click to select`}
        </p>
        
        {fileType === FileType.BLUEPRINT && (
          <p className="text-xs text-gray-500 mt-1">
            Only PDF files are supported
          </p>
        )}
        
        {error && (
          <p className="text-xs text-red-500 mt-2">
            {error}
          </p>
        )}
      </div>

      {/* Upload progress */}
      {Object.keys(uploadProgress).length > 0 && (
        <div className="mt-4 space-y-3">
          {Object.entries(uploadProgress).map(([fileId, progress]) => (
            <div key={fileId} className="flex items-center">
              <FileText className="h-4 w-4 text-gray-500 mr-2" />
              <div className="flex-1">
                <div className="text-xs font-medium text-gray-700 mb-1">
                  Uploading...
                </div>
                <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <span className="ml-2 text-xs text-gray-500">{progress}%</span>
            </div>
          ))}
        </div>
      )}

      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">Uploaded files</h3>
            <button
              type="button"
              onClick={handleClearAll}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear all
            </button>
          </div>
          
          <ul className="space-y-2">
            {uploadedFiles.map((file) => (
              <li key={file.fileId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center">
                  <FileText className="h-4 w-4 text-gray-500 mr-2" />
                  <span className="text-sm text-gray-700 truncate max-w-[200px]">
                    {file.originalName}
                  </span>
                  <CheckCircle className="h-4 w-4 text-green-500 ml-2" />
                </div>
                <button
                  type="button"
                  onClick={() => handleClearFile(file.fileId)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FileUploader;