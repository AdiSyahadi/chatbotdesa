"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Progress } from "./progress";
import { Button } from "./button";

export type FileType = 'image' | 'document' | 'video' | 'audio';

export interface FileUploadFile {
  file: File;
  preview?: string;
  progress: number;
  uploaded: boolean;
  error?: string;
  url?: string;
}

export interface FileUploadProps {
  accept?: FileType;
  multiple?: boolean;
  maxSize?: number; // in MB
  onChange?: (files: FileUploadFile[]) => void;
  onUpload?: (file: File) => Promise<{ url: string }>;
  disabled?: boolean;
  className?: string;
}

const ACCEPT_TYPES: Record<FileType, string> = {
  image: 'image/jpeg,image/png,image/gif,image/webp',
  document: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  video: 'video/mp4,video/mpeg,video/quicktime,video/webm',
  audio: 'audio/mpeg,audio/wav,audio/ogg',
};

const MAX_SIZES: Record<FileType, number> = {
  image: 16,
  document: 100,
  video: 64,
  audio: 16,
};

const FILE_ICONS: Record<FileType, string> = {
  image: '🖼️',
  document: '📄',
  video: '🎬',
  audio: '🎵',
};

const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  ({ accept = 'image', multiple = false, maxSize, onChange, onUpload, disabled = false, className }, ref) => {
    const [files, setFiles] = React.useState<FileUploadFile[]>([]);
    const [isDragging, setIsDragging] = React.useState(false);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const effectiveMaxSize = maxSize || MAX_SIZES[accept];
    const acceptTypes = ACCEPT_TYPES[accept];

    const validateFile = (file: File): string | null => {
      // Check file type
      const allowedTypes = acceptTypes.split(',');
      if (!allowedTypes.some(type => file.type === type || file.type.match(type.replace('*', '.*')))) {
        return `Invalid file type. Allowed: ${accept}`;
      }

      // Check file size
      const maxBytes = effectiveMaxSize * 1024 * 1024;
      if (file.size > maxBytes) {
        return `File too large. Maximum size: ${effectiveMaxSize}MB`;
      }

      return null;
    };

    const processFiles = async (fileList: FileList | File[]) => {
      const newFiles: FileUploadFile[] = [];

      for (const file of Array.from(fileList)) {
        const error = validateFile(file);
        const preview = accept === 'image' && !error ? URL.createObjectURL(file) : undefined;

        const uploadFile: FileUploadFile = {
          file,
          preview,
          progress: 0,
          uploaded: false,
          error: error || undefined,
        };

        newFiles.push(uploadFile);
      }

      if (!multiple) {
        // Clear previous preview URLs
        files.forEach(f => {
          if (f.preview) URL.revokeObjectURL(f.preview);
        });
        setFiles(newFiles.slice(0, 1));
      } else {
        setFiles(prev => [...prev, ...newFiles]);
      }
    };

    // Auto-upload when files change
    React.useEffect(() => {
      const uploadFiles = async () => {
        if (!onUpload) return;

        const updatedFiles = [...files];
        let hasChanges = false;

        for (let i = 0; i < updatedFiles.length; i++) {
          const fileData = updatedFiles[i];
          if (!fileData.uploaded && !fileData.error && fileData.progress === 0) {
            hasChanges = true;
            updatedFiles[i] = { ...fileData, progress: 10 };
            setFiles([...updatedFiles]);

            try {
              // Simulate progress
              const progressInterval = setInterval(() => {
                setFiles(prev => {
                  const updated = [...prev];
                  if (updated[i] && updated[i].progress < 90) {
                    updated[i] = { ...updated[i], progress: updated[i].progress + 10 };
                  }
                  return updated;
                });
              }, 100);

              const result = await onUpload(fileData.file);
              clearInterval(progressInterval);

              updatedFiles[i] = {
                ...fileData,
                progress: 100,
                uploaded: true,
                url: result.url,
              };
              setFiles([...updatedFiles]);
            } catch (err) {
              updatedFiles[i] = {
                ...fileData,
                progress: 0,
                error: err instanceof Error ? err.message : 'Upload failed',
              };
              setFiles([...updatedFiles]);
            }
          }
        }

        if (hasChanges) {
          onChange?.(updatedFiles);
        }
      };

      uploadFiles();
    }, [files.length]);

    // Notify parent when files change
    React.useEffect(() => {
      onChange?.(files);
    }, [files, onChange]);

    // Cleanup preview URLs on unmount
    React.useEffect(() => {
      return () => {
        files.forEach(f => {
          if (f.preview) URL.revokeObjectURL(f.preview);
        });
      };
    }, []);

    const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const droppedFiles = e.dataTransfer.files;
      if (droppedFiles.length > 0) {
        processFiles(droppedFiles);
      }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (selectedFiles && selectedFiles.length > 0) {
        processFiles(selectedFiles);
      }
      // Reset input value so same file can be selected again
      e.target.value = '';
    };

    const handleRemove = (index: number) => {
      setFiles(prev => {
        const updated = [...prev];
        if (updated[index]?.preview) {
          URL.revokeObjectURL(updated[index].preview!);
        }
        updated.splice(index, 1);
        return updated;
      });
    };

    const openFilePicker = () => {
      if (!disabled) {
        inputRef.current?.click();
      }
    };

    return (
      <div ref={ref} className={cn("w-full", className)}>
        {/* Hidden file input */}
        <input
          ref={inputRef}
          type="file"
          accept={acceptTypes}
          multiple={multiple}
          onChange={handleFileSelect}
          disabled={disabled}
          className="hidden"
        />

        {/* Drop zone */}
        <div
          onClick={openFilePicker}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "relative border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50",
            disabled && "cursor-not-allowed opacity-50",
            files.length > 0 && "border-solid"
          )}
        >
          {files.length === 0 ? (
            <div className="space-y-2">
              <div className="text-4xl">{FILE_ICONS[accept]}</div>
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-primary">Click to upload</span>
                {" or drag and drop"}
              </div>
              <div className="text-xs text-muted-foreground">
                {accept.charAt(0).toUpperCase() + accept.slice(1)} files up to {effectiveMaxSize}MB
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {files.map((fileData, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-2 bg-muted/50 rounded-md"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Preview or icon */}
                  {fileData.preview ? (
                    <img
                      src={fileData.preview}
                      alt={fileData.file.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 flex items-center justify-center bg-muted rounded text-2xl">
                      {FILE_ICONS[accept]}
                    </div>
                  )}

                  {/* File info */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium truncate">
                      {fileData.file.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {(fileData.file.size / 1024 / 1024).toFixed(2)} MB
                    </div>
                    
                    {/* Error message */}
                    {fileData.error && (
                      <div className="text-xs text-destructive mt-1">
                        {fileData.error}
                      </div>
                    )}

                    {/* Progress bar */}
                    {!fileData.error && !fileData.uploaded && fileData.progress > 0 && (
                      <Progress value={fileData.progress} className="h-1 mt-1" />
                    )}

                    {/* Success indicator */}
                    {fileData.uploaded && (
                      <div className="text-xs text-green-600 mt-1">
                        ✓ Uploaded
                      </div>
                    )}
                  </div>

                  {/* Remove button */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(index)}
                    disabled={disabled}
                    className="shrink-0"
                  >
                    ✕
                  </Button>
                </div>
              ))}

              {/* Add more button for multiple */}
              {multiple && (
                <div className="text-sm text-muted-foreground pt-2">
                  Click or drop to add more files
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

FileUpload.displayName = "FileUpload";

export { FileUpload };
