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
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
        };
      default:
        return { 'application/octet-stream': ['*'] };
    }
  }, [fileType]);

  // Handle file uploads
  const uploadFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    onUploadStart?.();

    const uploadedFilesList: IFileMetadata[] = [];
    const newProgress: Record<string, number> = {};

    // Initialize progress tracking
    files.forEach(file => {
      newProgress[file.name] = 0;
    });
    setUploadProgress(newProgress);

    // Upload each file
    for (const file of files) {
      try {
        const updateProgress = (progress: number) => {
          setUploadProgress(prev => ({
            ...prev,
            [file.name]: progress
          }));
        };

        const fileMetadata = await fileService.uploadFile(
          file,
          projectId,
          fileType,
          description,
          tags,
          entityId,
          entityType,
          updateProgress
        );

        uploadedFilesList.push(fileMetadata);
        toast.success(`${file.name} uploaded successfully`);
      } catch (err) {
        console.error(`Error uploading ${file.name}:`, err);
        toast.error(`Failed to upload ${file.name}`);
        setError(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    setUploadedFiles(prev => [...prev, ...uploadedFilesList]);
    setIsUploading(false);

    if (uploadedFilesList.length > 0 && onUploadComplete) {
      onUploadComplete(uploadedFilesList);
    }
  }, [projectId, fileType, description, tags, entityId, entityType, onUploadComplete, onUploadStart]);

  // Configure dropzone
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop: uploadFiles,
    accept: accept || getDefaultAccept(),
    maxSize,
    multiple,
    disabled: isUploading
  });

  // Remove an uploaded file
  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className={className}>
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}
          ${isUploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <Upload className="mx-auto h-12 w-12 text-gray-400" />
        <p className="mt-2 text-sm text-gray-600">
          {isDragActive
            ? 'Drop the files here...'
            : `Drag and drop ${fileType} ${multiple ? 'files' : 'file'}, or click to select`}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Maximum file size: {Math.round(maxSize / (1024 * 1024))}MB
        </p>
      </div>

      {/* Error display */}
      {(error || fileRejections.length > 0) && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-md text-sm">
          {error && <p>{error}</p>}
          {fileRejections.map(({ file, errors }) => (
            <p key={file.name}>
              {file.name}: {errors.map(e => e.message).join(', ')}
            </p>
          ))}
        </div>
      )}

      {/* Upload progress */}
      {isUploading && Object.keys(uploadProgress).length > 0 && (
        <div className="mt-4 space-y-2">
          {Object.entries(uploadProgress).map(([fileName, progress]) => (
            <div key={fileName} className="text-sm">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span className="truncate">{fileName}</span>
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

      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-gray-700 mb-2">Uploaded files</h4>
          <ul className="space-y-2">
            {uploadedFiles.map((file, index) => (
              <li
                key={file.fileId}
                className="flex items-center justify-between p-2 bg-gray-50 rounded-md text-sm"
              >
                <div className="flex items-center">
                  <FileText className="h-4 w-4 text-blue-500 mr-2" />
                  <span className="truncate max-w-xs">{file.originalName}</span>
                </div>
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  {multiple && (
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FileUploader;