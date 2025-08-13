/**
 * 文件同步管理器 - 管理文件变化通知和内容同步
 */

interface FileChangeListener {
  id: string;
  filePath: string;
  callback: (filePath: string, changeType: string) => void;
}

interface FileContentListener {
  id: string;
  filePath: string;
  callback: (filePath: string, newContent: string) => void;
}

class FileSyncManager {
  private changeListeners: Map<string, FileChangeListener[]> = new Map();
  private contentListeners: Map<string, FileContentListener[]> = new Map();
  private static instance: FileSyncManager | null = null;

  public static getInstance(): FileSyncManager {
    if (!FileSyncManager.instance) {
      FileSyncManager.instance = new FileSyncManager();
    }
    return FileSyncManager.instance;
  }

  /**
   * 注册文件变化监听器
   * @param id 监听器唯一标识
   * @param filePath 文件路径（可以是相对路径或绝对路径）
   * @param callback 变化回调函数
   */
  public registerChangeListener(
    id: string, 
    filePath: string, 
    callback: (filePath: string, changeType: string) => void
  ): void {
    const normalizedPath = this.normalizePath(filePath);
    
    if (!this.changeListeners.has(normalizedPath)) {
      this.changeListeners.set(normalizedPath, []);
    }
    
    const listeners = this.changeListeners.get(normalizedPath)!;
    
    // 移除已存在的相同ID监听器
    const existingIndex = listeners.findIndex(l => l.id === id);
    if (existingIndex !== -1) {
      listeners.splice(existingIndex, 1);
    }
    
    // 添加新监听器
    listeners.push({ id, filePath: normalizedPath, callback });
    
    console.log(`[FileSyncManager] Registered change listener ${id} for ${normalizedPath}`);
  }

  /**
   * 注册文件内容监听器
   * @param id 监听器唯一标识
   * @param filePath 文件路径
   * @param callback 内容更新回调函数
   */
  public registerContentListener(
    id: string,
    filePath: string,
    callback: (filePath: string, newContent: string) => void
  ): void {
    const normalizedPath = this.normalizePath(filePath);
    
    if (!this.contentListeners.has(normalizedPath)) {
      this.contentListeners.set(normalizedPath, []);
    }
    
    const listeners = this.contentListeners.get(normalizedPath)!;
    
    // 移除已存在的相同ID监听器
    const existingIndex = listeners.findIndex(l => l.id === id);
    if (existingIndex !== -1) {
      listeners.splice(existingIndex, 1);
    }
    
    // 添加新监听器
    listeners.push({ id, filePath: normalizedPath, callback });
    
    console.log(`[FileSyncManager] Registered content listener ${id} for ${normalizedPath}`);
  }

  /**
   * 注销监听器
   * @param id 监听器ID
   * @param filePath 文件路径（可选）
   */
  public unregisterListener(id: string, filePath?: string): void {
    if (filePath) {
      const normalizedPath = this.normalizePath(filePath);
      
      // 从变化监听器中移除
      const changeListeners = this.changeListeners.get(normalizedPath);
      if (changeListeners) {
        const index = changeListeners.findIndex(l => l.id === id);
        if (index !== -1) {
          changeListeners.splice(index, 1);
          if (changeListeners.length === 0) {
            this.changeListeners.delete(normalizedPath);
          }
        }
      }
      
      // 从内容监听器中移除
      const contentListeners = this.contentListeners.get(normalizedPath);
      if (contentListeners) {
        const index = contentListeners.findIndex(l => l.id === id);
        if (index !== -1) {
          contentListeners.splice(index, 1);
          if (contentListeners.length === 0) {
            this.contentListeners.delete(normalizedPath);
          }
        }
      }
    } else {
      // 移除所有该ID的监听器
      for (const [path, listeners] of this.changeListeners.entries()) {
        const index = listeners.findIndex(l => l.id === id);
        if (index !== -1) {
          listeners.splice(index, 1);
          if (listeners.length === 0) {
            this.changeListeners.delete(path);
          }
        }
      }
      
      for (const [path, listeners] of this.contentListeners.entries()) {
        const index = listeners.findIndex(l => l.id === id);
        if (index !== -1) {
          listeners.splice(index, 1);
          if (listeners.length === 0) {
            this.contentListeners.delete(path);
          }
        }
      }
    }
    
    console.log(`[FileSyncManager] Unregistered listener ${id}${filePath ? ` for ${filePath}` : ''}`);
  }

  /**
   * 通知文件变化
   * @param filePath 变化的文件路径
   * @param changeType 变化类型
   */
  public notifyFileChange(filePath: string, changeType: string): void {
    const normalizedPath = this.normalizePath(filePath);
    const listeners = this.changeListeners.get(normalizedPath);
    
    if (listeners && listeners.length > 0) {
      console.log(`[FileSyncManager] Notifying ${listeners.length} change listeners for ${normalizedPath}`);
      
      listeners.forEach(listener => {
        try {
          listener.callback(normalizedPath, changeType);
        } catch (error) {
          console.error(`[FileSyncManager] Error in change listener ${listener.id}:`, error);
        }
      });
    }
  }

  /**
   * 通知文件内容更新
   * @param filePath 文件路径
   * @param newContent 新内容
   */
  public notifyContentUpdate(filePath: string, newContent: string): void {
    const normalizedPath = this.normalizePath(filePath);
    const listeners = this.contentListeners.get(normalizedPath);
    
    if (listeners && listeners.length > 0) {
      console.log(`[FileSyncManager] Notifying ${listeners.length} content listeners for ${normalizedPath}`);
      
      listeners.forEach(listener => {
        try {
          listener.callback(normalizedPath, newContent);
        } catch (error) {
          console.error(`[FileSyncManager] Error in content listener ${listener.id}:`, error);
        }
      });
    }
  }

  /**
   * 规范化文件路径
   * @param filePath 原始文件路径
   * @returns 规范化后的路径
   */
  private normalizePath(filePath: string): string {
    return filePath
      .replace(/\\/g, '/') // 统一使用正斜杠
      .replace(/\/+/g, '/') // 移除重复斜杠
      .replace(/\/$/, ''); // 移除结尾斜杠
  }

  /**
   * 检查路径是否匹配（支持相对路径匹配）
   * @param watchPath 监听的路径
   * @param changePath 变化的路径
   * @returns 是否匹配
   */
  public pathMatches(watchPath: string, changePath: string): boolean {
    const normalizedWatchPath = this.normalizePath(watchPath);
    const normalizedChangePath = this.normalizePath(changePath);
    
    // 完全匹配
    if (normalizedWatchPath === normalizedChangePath) {
      return true;
    }
    
    // 检查是否为相对路径匹配
    const watchPathParts = normalizedWatchPath.split('/');
    const changePathParts = normalizedChangePath.split('/');
    
    // 如果监听路径更短，检查是否为后缀匹配
    if (watchPathParts.length <= changePathParts.length) {
      const offset = changePathParts.length - watchPathParts.length;
      for (let i = 0; i < watchPathParts.length; i++) {
        if (watchPathParts[i] !== changePathParts[i + offset]) {
          return false;
        }
      }
      return true;
    }
    
    return false;
  }

  /**
   * 获取当前注册的监听器统计
   */
  public getStats(): { changeListeners: number; contentListeners: number; totalFiles: number } {
    const changeListenerCount = Array.from(this.changeListeners.values()).reduce((sum, arr) => sum + arr.length, 0);
    const contentListenerCount = Array.from(this.contentListeners.values()).reduce((sum, arr) => sum + arr.length, 0);
    const totalFiles = new Set([...this.changeListeners.keys(), ...this.contentListeners.keys()]).size;
    
    return {
      changeListeners: changeListenerCount,
      contentListeners: contentListenerCount,
      totalFiles
    };
  }
}

export const fileSyncManager = FileSyncManager.getInstance();
export default fileSyncManager;