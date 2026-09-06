// File System Access API (Chrome / Edge). Not in lib.dom yet.
interface Window {
  showDirectoryPicker(opts?: { mode?: 'read' | 'readwrite'; id?: string; startIn?: string }): Promise<FileSystemDirectoryHandle>;
  showSaveFilePicker(opts?: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }): Promise<FileSystemFileHandle>;
  showOpenFilePicker(opts?: {
    multiple?: boolean;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }): Promise<FileSystemFileHandle[]>;
}

interface FileSystemHandle {
  queryPermission(opts?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission(opts?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}
