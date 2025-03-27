// frontend/src/components/specialized/BlueprintUploader.tsx

import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { useMutation, useQueryClient } from 'react-query';
import { toast } from 'react-hot-toast';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  CardFooter 
} from '../common/Card';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';
import { ProgressBar } from '../common/ProgressBar';
import { Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { uploadBlueprint, processBlueprint } from '../../services/blueprint.service';
import { useProjectContext } from '../../contexts/ProjectContext';
import { useAuth } from '../../hooks/useAuth';

// Add proper type definition for the response data
interface UploadResponse {
  fileKey: string;
  url?: string;
  message?: string;
}

interface ProcessResponse {
  project: any;
  extractedData: any;
  message?: string;
}

interface IBlueprintUploaderProps {
  /** Project ID for this blueprint */
  projectId: string;
  /** Optional blueprint template ID */
  templateId?: string;
  /** Callback after successful processing */
  onProcessingComplete?: (result: ProcessResponse) => void;
  /** Additional CSS class names */
  className?: string;
}

/**
 * Blueprint uploader component with drag-and-drop support
 * 
 * Handles PDF upload, processing, and status updates
 */
export const BlueprintUploader: React.FC<IBlueprintUploaderProps> = ({
  projectId,
  templateId,
  onProcessingComplete,
  className = '',
}) => {
  // State management with proper typing
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState<string | null>(null);
  
  // Hooks
  const { user } = useAuth();
  const { updateProject } = useProjectContext();
  const queryClient = useQueryClient();

  // Validate inputs
  const isValidProjectId = useMemo(() => typeof projectId === 'string' && projectId.length > 0, [projectId]);
  
  if (!isValidProjectId) {
    return (
      <Card className={`bg-white shadow-md ${className}`}>
        <CardContent className="py-6">
          <div className="text-red-500 flex items-center justify-center">
            <AlertCircle className="mr-2" />
            <span>Invalid project ID provided</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  // File upload mutation with proper error handling
  const uploadMutation = useMutation<UploadResponse, Error, File>(
    async (file: File) => {
      try {
        // Basic file validation
        if (!file || !(file instanceof File)) {
          throw new Error('Invalid file provided');
        }
        
        if (file.type !== 'application/pdf') {
          throw new Error('Only PDF files are supported');
        }
        
        if (file.size > 50 * 1024 * 1024) { // 50MB limit
          throw new Error('File size exceeds the 50MB limit');
        }
        
        return await uploadBlueprint(file, projectId, setUploadProgress);
      } catch (error) {
        console.error('Error uploading blueprint:', error);
        throw error instanceof Error ? error : new Error('Unknown upload error');
      }
    },
    {
      onSuccess: (data) => {
        if (data && data.fileKey) {
          setFileKey(data.fileKey);
          toast.success('Blueprint uploaded successfully');
        } else {
          toast.error('Upload completed but no file key was returned');
        }
      },
      onError: (error: Error) => {
        toast.error(`Upload failed: ${error.message || 'Unknown error'}`);
        setUploadProgress(0);
      },
    }
  );

  // Blueprint processing mutation with proper error handling
  const processMutation = useMutation<ProcessResponse, Error>(
    async () => {
      try {
        if (!fileKey) {
          throw new Error('No file has been uploaded');
        }
        
        return await processBlueprint(projectId, fileKey, templateId);
      } catch (error) {
        console.error('Error processing blueprint:', error);
        throw error instanceof Error ? error : new Error('Unknown processing error');
      }
    },
    {
      onSuccess: (data) => {
        toast.success('Blueprint processed successfully');
        queryClient.invalidateQueries(['project', projectId]);
        
        if (data.project) {
          updateProject(data.project);
        }
        
        if (onProcessingComplete && typeof onProcessingComplete === 'function') {
          onProcessingComplete(data);
        }
      },
      onError: (error: Error) => {
        toast.error(`Processing failed: ${error.message || 'Unknown error'}`);
      },
    }
  );

  // Dropzone configuration with proper validation
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles || !acceptedFiles.length) {
      toast.error('No files were provided');
      return;
    }
    
    const file = acceptedFiles[0];
    
    if (!file) {
      toast.error('Invalid file');
      return;
    }
    
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are supported');
      return;
    }
    
    if (file.size > 50 * 1024 * 1024) { // 50MB limit
      toast.error('File size exceeds the 50MB limit');
      return;
    }
    
    setUploadedFile(file);
    uploadMutation.mutate(file);
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    disabled: uploadMutation.isLoading || processMutation.isLoading,
    maxSize: 50 * 1024 * 1024, // 50MB limit
  });

  // Handle processing button click with validation
  const handleProcessBlueprint = useCallback(() => {
    if (!fileKey) {
      toast.error('No file has been uploaded');
      return;
    }
    
    processMutation.mutate();
  }, [fileKey, processMutation]);

  // Determine processing status using memoization
  const { isUploading, isProcessing, isComplete, hasError } = useMemo(() => ({
    isUploading: uploadMutation.isLoading,
    isProcessing: processMutation.isLoading,
    isComplete: processMutation.isSuccess,
    hasError: uploadMutation.isError || processMutation.isError
  }), [
    uploadMutation.isLoading, 
    processMutation.isLoading, 
    processMutation.isSuccess, 
    uploadMutation.isError, 
    processMutation.isError
  ]);

  return (
    <Card className={`bg-white shadow-md ${className}`}>
      <CardHeader>
        <CardTitle>Upload Blueprint</CardTitle>
        <CardDescription>
          Upload a PDF blueprint to extract project information
        </CardDescription>
      </CardHeader>
      
      <CardContent>
        {/* Drag and drop area */}
        <div
          {...getRootProps()}
          aria-label="Upload area"
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}
            ${(isUploading || isProcessing || isComplete) ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          <input {...getInputProps()} aria-label="File input" />
          
          {!uploadedFile ? (
            <>
              <Upload className="mx-auto h-12 w-12 text-gray-400" aria-hidden="true" />
              <p className="mt-2 text-sm text-gray-600">
                Drag and drop a PDF blueprint, or click to select
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Only PDF files are supported (max 50MB)
              </p>
            </>
          ) : (
            <div className="flex items-center justify-center space-x-3">
              <FileText className="h-6 w-6 text-blue-500" aria-hidden="true" />
              <span className="text-sm font-medium text-gray-900 truncate max-w-xs">
                {uploadedFile.name}
              </span>
              {isComplete && <CheckCircle className="h-5 w-5 text-green-500" aria-label="Complete" />}
              {hasError && <AlertCircle className="h-5 w-5 text-red-500" aria-label="Error" />}
            </div>
          )}
        </div>

        {/* Progress indicators */}
        {isUploading && (
          <div className="mt-4" aria-live="polite" aria-busy="true">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <ProgressBar progress={uploadProgress} aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} />
          </div>
        )}
        
        {isProcessing && (
          <div className="mt-4 flex items-center justify-center text-sm text-gray-600" aria-live="polite" aria-busy="true">
            <Spinner className="mr-2" aria-hidden="true" />
            Processing blueprint...
          </div>
        )}
      </CardContent>
      
      <CardFooter className="flex justify-end space-x-2 bg-gray-50 rounded-b-lg">
        {fileKey && !isComplete && !isProcessing && (
          <Button
            onClick={handleProcessBlueprint}
            disabled={isProcessing}
            variant="primary"
            aria-busy={isProcessing}
          >
            {isProcessing ? (
              <>
                <Spinner className="mr-2" size="sm" aria-hidden="true" />
                Processing...
              </>
            ) : (
              'Process Blueprint'
            )}
          </Button>
        )}
        
        {isComplete && (
          <p className="text-sm text-green-600 flex items-center" aria-live="polite">
            <CheckCircle className="h-4 w-4 mr-1" aria-hidden="true" />
            Processing complete
          </p>
        )}
      </CardFooter>
    </Card>
  );
};

export default BlueprintUploader;