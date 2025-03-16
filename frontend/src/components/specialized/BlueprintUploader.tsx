// frontend/src/components/specialized/BlueprintUploader.tsx

import React, { useState, useCallback } from 'react';
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

interface IBlueprintUploaderProps {
  /** Project ID for this blueprint */
  projectId: string;
  /** Optional blueprint template ID */
  templateId?: string;
  /** Callback after successful processing */
  onProcessingComplete?: (result: any) => void;
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
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState<string | null>(null);
  const { user } = useAuth();
  const { updateProject } = useProjectContext();
  const queryClient = useQueryClient();

  // File upload mutation
  const uploadMutation = useMutation(
    (file: File) => uploadBlueprint(file, projectId, setUploadProgress),
    {
      onSuccess: (data) => {
        setFileKey(data.fileKey);
        toast.success('Blueprint uploaded successfully');
      },
      onError: (error: any) => {
        toast.error(`Upload failed: ${error.message || 'Unknown error'}`);
        setUploadProgress(0);
      },
    }
  );

  // Blueprint processing mutation
  const processMutation = useMutation(
    () => processBlueprint(projectId, fileKey!, templateId),
    {
      onSuccess: (data) => {
        toast.success('Blueprint processed successfully');
        queryClient.invalidateQueries(['project', projectId]);
        updateProject(data.project);
        
        if (onProcessingComplete) {
          onProcessingComplete(data);
        }
      },
      onError: (error: any) => {
        toast.error(`Processing failed: ${error.message || 'Unknown error'}`);
      },
    }
  );

  // Dropzone configuration
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error('Only PDF files are supported');
        return;
      }
      
      setUploadedFile(file);
      uploadMutation.mutate(file);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf']
    },
    maxFiles: 1,
    disabled: uploadMutation.isLoading || processMutation.isLoading,
  });

  // Handle processing button click
  const handleProcessBlueprint = () => {
    if (fileKey) {
      processMutation.mutate();
    }
  };

  // Determine processing status
  const isUploading = uploadMutation.isLoading;
  const isProcessing = processMutation.isLoading;
  const isComplete = processMutation.isSuccess;
  const hasError = uploadMutation.isError || processMutation.isError;

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
          className={`
            border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
            ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'}
            ${(isUploading || isProcessing || isComplete) ? 'pointer-events-none opacity-60' : ''}
          `}
        >
          <input {...getInputProps()} />
          
          {!uploadedFile ? (
            <>
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                Drag and drop a PDF blueprint, or click to select
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Only PDF files are supported
              </p>
            </>
          ) : (
            <div className="flex items-center justify-center space-x-3">
              <FileText className="h-6 w-6 text-blue-500" />
              <span className="text-sm font-medium text-gray-900 truncate max-w-xs">
                {uploadedFile.name}
              </span>
              {isComplete && <CheckCircle className="h-5 w-5 text-green-500" />}
              {hasError && <AlertCircle className="h-5 w-5 text-red-500" />}
            </div>
          )}
        </div>

        {/* Progress indicators */}
        {isUploading && (
          <div className="mt-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <ProgressBar progress={uploadProgress} />
          </div>
        )}
        
        {isProcessing && (
          <div className="mt-4 flex items-center justify-center text-sm text-gray-600">
            <Spinner className="mr-2" />
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
          >
            {isProcessing ? (
              <>
                <Spinner className="mr-2" size="sm" />
                Processing...
              </>
            ) : (
              'Process Blueprint'
            )}
          </Button>
        )}
        
        {isComplete && (
          <p className="text-sm text-green-600 flex items-center">
            <CheckCircle className="h-4 w-4 mr-1" />
            Processing complete
          </p>
        )}
      </CardFooter>
    </Card>
  );
};

export default BlueprintUploader;