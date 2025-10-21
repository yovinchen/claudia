import { create } from 'zustand';
import { api, type PromptFile, type CreatePromptFileRequest, type UpdatePromptFileRequest } from '@/lib/api';

interface PromptFilesState {
  // Data
  files: PromptFile[];
  activeFile: PromptFile | null;
  
  // UI state
  isLoading: boolean;
  error: string | null;
  
  // Actions
  loadFiles: () => Promise<void>;
  getFile: (id: string) => Promise<PromptFile>;
  createFile: (request: CreatePromptFileRequest) => Promise<PromptFile>;
  updateFile: (request: UpdatePromptFileRequest) => Promise<PromptFile>;
  deleteFile: (id: string) => Promise<void>;
  applyFile: (id: string, targetPath?: string) => Promise<string>;
  deactivateAll: () => Promise<void>;
  importFromClaudeMd: (name: string, description?: string, sourcePath?: string) => Promise<PromptFile>;
  exportFile: (id: string, exportPath: string) => Promise<void>;
  updateOrder: (ids: string[]) => Promise<void>;
  importBatch: (files: CreatePromptFileRequest[]) => Promise<PromptFile[]>;
  clearError: () => void;
}

export const usePromptFilesStore = create<PromptFilesState>((set, get) => ({
  // Initial state
  files: [],
  activeFile: null,
  isLoading: false,
  error: null,
  
  // Load all prompt files
  loadFiles: async () => {
    set({ isLoading: true, error: null });
    try {
      const files = await api.promptFilesList();
      const activeFile = files.find(f => f.is_active) || null;
      set({ files, activeFile, isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to load prompt files',
        isLoading: false 
      });
    }
  },
  
  // Get a single file
  getFile: async (id: string) => {
    try {
      const file = await api.promptFileGet(id);
      return file;
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to get prompt file' });
      throw error;
    }
  },
  
  // Create a new file
  createFile: async (request: CreatePromptFileRequest) => {
    set({ isLoading: true, error: null });
    try {
      const file = await api.promptFileCreate(request);
      await get().loadFiles(); // Reload to get updated list
      set({ isLoading: false });
      return file;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to create prompt file',
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Update an existing file
  updateFile: async (request: UpdatePromptFileRequest) => {
    set({ isLoading: true, error: null });
    try {
      const file = await api.promptFileUpdate(request);
      await get().loadFiles(); // Reload to get updated list
      set({ isLoading: false });
      return file;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to update prompt file',
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Delete a file
  deleteFile: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.promptFileDelete(id);
      await get().loadFiles(); // Reload to get updated list
      set({ isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to delete prompt file',
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Apply a file (replace CLAUDE.md)
  applyFile: async (id: string, targetPath?: string) => {
    set({ isLoading: true, error: null });
    try {
      const resultPath = await api.promptFileApply(id, targetPath);
      await get().loadFiles(); // Reload to update active state
      set({ isLoading: false });
      return resultPath;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to apply prompt file',
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Deactivate all files
  deactivateAll: async () => {
    set({ isLoading: true, error: null });
    try {
      await api.promptFileDeactivate();
      await get().loadFiles(); // Reload to update active state
      set({ isLoading: false });
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to deactivate prompt files',
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Import from CLAUDE.md
  importFromClaudeMd: async (name: string, description?: string, sourcePath?: string) => {
    set({ isLoading: true, error: null });
    try {
      const file = await api.promptFileImportFromClaudeMd(name, description, sourcePath);
      await get().loadFiles(); // Reload to get updated list
      set({ isLoading: false });
      return file;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to import from CLAUDE.md',
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Export a file
  exportFile: async (id: string, exportPath: string) => {
    try {
      await api.promptFileExport(id, exportPath);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to export prompt file' });
      throw error;
    }
  },
  
  // Update display order
  updateOrder: async (ids: string[]) => {
    try {
      await api.promptFilesUpdateOrder(ids);
      await get().loadFiles(); // Reload to get updated order
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to update order' });
      throw error;
    }
  },
  
  // Batch import files
  importBatch: async (files: CreatePromptFileRequest[]) => {
    set({ isLoading: true, error: null });
    try {
      const imported = await api.promptFilesImportBatch(files);
      await get().loadFiles(); // Reload to get updated list
      set({ isLoading: false });
      return imported;
    } catch (error) {
      set({ 
        error: error instanceof Error ? error.message : 'Failed to batch import prompt files',
        isLoading: false 
      });
      throw error;
    }
  },
  
  // Clear error
  clearError: () => set({ error: null }),
}));

