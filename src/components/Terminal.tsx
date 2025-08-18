import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { SearchAddon } from 'xterm-addon-search';
import 'xterm/css/xterm.css';
import { Button } from '@/components/ui/button';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface TerminalProps {
  className?: string;
  onClose?: () => void;
  isMaximized?: boolean;
  onToggleMaximize?: () => void;
  projectPath?: string;
}

export const Terminal: React.FC<TerminalProps> = ({
  className,
  onClose,
  isMaximized = false,
  onToggleMaximize,
  projectPath
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const isInitializedRef = useRef(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [terminalSize, setTerminalSize] = useState({ cols: 80, rows: 24 });
  const [containerWidth, setContainerWidth] = useState(0);

  // 计算终端应该有的尺寸
  const calculateOptimalSize = useCallback(() => {
    if (!terminalRef.current) return { cols: 80, rows: 24 };

    const container = terminalRef.current;
    const rect = container.getBoundingClientRect();

    // 获取或估算字符尺寸
    const fontSize = 14; // 我们设置的字体大小
    const charWidth = fontSize * 0.6; // 等宽字体的典型宽度比例
    const lineHeight = fontSize * 1.2; // 行高

    // 计算能容纳的最大列数和行数
    const availableWidth = rect.width - 2;
    const availableHeight = rect.height - 2;

    const cols = Math.max(80, Math.floor(availableWidth / charWidth));
    const rows = Math.max(24, Math.floor(availableHeight / lineHeight));

    // 计算实际使用的宽度
    const usedWidth = cols * charWidth;
    const unusedWidth = availableWidth - usedWidth;
    const percentUsed = ((usedWidth / availableWidth) * 100).toFixed(1);

    console.log('[Terminal] Size calculation:', {
      containerWidth: rect.width,
      availableWidth,
      charWidth,
      cols,
      usedWidth,
      unusedWidth,
      percentUsed: `${percentUsed}%`,
      message: unusedWidth > 10 ? `还有 ${unusedWidth.toFixed(1)}px 未使用` : '宽度使用正常'
    });

    return { cols, rows };
  }, []);

  // 调整终端大小
  const resizeTerminal = useCallback(() => {
    if (!xtermRef.current || !terminalRef.current) return;

    // 先尝试获取实际的字符尺寸
    let actualCharWidth = 8.4; // 默认值
    let actualLineHeight = 16.8; // 默认值

    try {
      const core = (xtermRef.current as any)._core;
      if (core && core._renderService && core._renderService.dimensions) {
        const dims = core._renderService.dimensions;
        if (dims.actualCellWidth) actualCharWidth = dims.actualCellWidth;
        if (dims.actualCellHeight) actualLineHeight = dims.actualCellHeight;

        console.log('[Terminal] Using actual char dimensions:', {
          actualCharWidth,
          actualLineHeight
        });
      }
    } catch (e) {
      // 使用默认值
    }

    // 使用实际字符尺寸计算新的列数和行数
    const rect = terminalRef.current.getBoundingClientRect();
    const availableWidth = rect.width - 2;
    const availableHeight = rect.height - 2;

    // 更新容器宽度显示
    setContainerWidth(rect.width);

    const newCols = Math.max(80, Math.floor(availableWidth / actualCharWidth));
    const newRows = Math.max(24, Math.floor(availableHeight / actualLineHeight));

    // 计算宽度使用情况
    const usedWidth = newCols * actualCharWidth;
    const unusedWidth = availableWidth - usedWidth;
    const percentUsed = ((usedWidth / availableWidth) * 100).toFixed(1);

    // 只有当尺寸真的改变时才调整
    if (newCols !== terminalSize.cols || newRows !== terminalSize.rows) {
      console.log('[Terminal] Resizing:', {
        from: terminalSize,
        to: { cols: newCols, rows: newRows },
        containerWidth: rect.width,
        availableWidth,
        usedWidth,
        unusedWidth,
        percentUsed: `${percentUsed}%`
      });

      setTerminalSize({ cols: newCols, rows: newRows });
      xtermRef.current.resize(newCols, newRows);

      // 更新后端
      if (sessionId) {
        api.resizeTerminal(sessionId, newCols, newRows).catch(console.error);
      }

      // 强制刷新渲染
      try {
        const core = (xtermRef.current as any)._core;
        if (core && core._renderService && core._renderService._onIntersectionChange) {
          core._renderService._onIntersectionChange({ intersectionRatio: 1 });
        }
      } catch (e) {
        // 忽略错误，某些版本的 xterm 可能没有这个方法
      }
    }
  }, [terminalSize, sessionId]);

  // 防抖的resize处理
  const handleResize = useCallback(() => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }

    resizeTimeoutRef.current = setTimeout(() => {
      resizeTerminal();
    }, 100);
  }, [resizeTerminal]);

  // 初始化终端
  useEffect(() => {
    if (isInitializedRef.current || !terminalRef.current) return;

    let isMounted = true;

    const initializeTerminal = async () => {
      try {
        console.log('[Terminal] Initializing...');
        isInitializedRef.current = true;

        // 先计算初始尺寸
        const initialSize = calculateOptimalSize();
        setTerminalSize(initialSize);

        // 创建终端实例
        const xterm = new XTerm({
          cols: initialSize.cols,
          rows: initialSize.rows,
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#ffffff',
            cursorAccent: '#000000',
            selectionBackground: '#264f78',
            black: '#000000',
            red: '#cd3131',
            green: '#0dbc79',
            yellow: '#e5e510',
            blue: '#2472c8',
            magenta: '#bc3fbc',
            cyan: '#11a8cd',
            white: '#e5e5e5',
            brightBlack: '#666666',
            brightRed: '#f14c4c',
            brightGreen: '#23d18b',
            brightYellow: '#f5f543',
            brightBlue: '#3b8eea',
            brightMagenta: '#d670d6',
            brightCyan: '#29b8db',
            brightWhite: '#e5e5e5',
          },
          fontFamily: '"MesloLGS NF", "JetBrainsMono Nerd Font", "FiraCode Nerd Font", "Hack Nerd Font", "JetBrains Mono", "SF Mono", "Monaco", "Consolas", "Courier New", monospace',
          fontSize: 14,
          fontWeight: 'normal',
          fontWeightBold: 'bold',
          lineHeight: 1.2,
          letterSpacing: 0,
          scrollback: 10000,
          convertEol: true,
          cursorBlink: true,
          cursorStyle: 'block',
          drawBoldTextInBrightColors: true,
          macOptionIsMeta: true,
          rightClickSelectsWord: true,
          allowProposedApi: true,
          // @ts-ignore
          rendererType: 'canvas',
          windowsMode: false,
        });

        // 添加插件
        const webLinksAddon = new WebLinksAddon();
        const searchAddon = new SearchAddon();

        xterm.loadAddon(webLinksAddon);
        xterm.loadAddon(searchAddon);

        // 打开终端
        if (terminalRef.current) {
          xterm.open(terminalRef.current);
        } else {

          console.error('[Terminal] Terminal container ref is null');
          return;
        }

        // 保存引用
        xtermRef.current = xterm;

        // 延迟一下确保渲染完成，然后获取实际字符尺寸并调整
        setTimeout(() => {
          if (xtermRef.current && terminalRef.current) {
            // 尝试获取实际的字符尺寸
            try {
              const core = (xtermRef.current as any)._core;
              if (core && core._renderService && core._renderService.dimensions) {
                const dims = core._renderService.dimensions;
                const actualCharWidth = dims.actualCellWidth || dims.scaledCellWidth;
                const actualLineHeight = dims.actualCellHeight || dims.scaledCellHeight;

                if (actualCharWidth && actualLineHeight) {
                  console.log('[Terminal] Actual character dimensions:', {
                    charWidth: actualCharWidth,
                    lineHeight: actualLineHeight
                  });

                  // 使用实际尺寸重新计算
                  const rect = terminalRef.current.getBoundingClientRect();
                  const availableWidth = rect.width - 2;
                  const newCols = Math.floor(availableWidth / actualCharWidth);

                  console.log('[Terminal] Recalculating with actual dimensions:', {
                    availableWidth,
                    actualCharWidth,
                    newCols,
                    currentCols: xtermRef.current.cols
                  });

                  if (newCols > xtermRef.current.cols) {
                    xtermRef.current.resize(newCols, xtermRef.current.rows);
                    setTerminalSize({ cols: newCols, rows: xtermRef.current.rows });
                  }
                }
              }
            } catch (e) {
              console.warn('[Terminal] Could not get actual char dimensions:', e);
            }
          }
          resizeTerminal();
        }, 150);

        // 创建终端会话
        const newSessionId = await api.createTerminalSession(projectPath || process.cwd());

        if (!isMounted) {
          await api.closeTerminalSession(newSessionId);
          return;
        }

        setSessionId(newSessionId);
        setIsConnected(true);

        // 监听终端输出
        const unlisten = await api.listenToTerminalOutput(newSessionId, (data: string) => {
          if (xtermRef.current && isMounted) {
            xtermRef.current.write(data);
          }
        });

        unlistenRef.current = unlisten;

        // 监听数据输入
        xterm.onData((data) => {
          if (newSessionId && isMounted) {
            api.sendTerminalInput(newSessionId, data).catch((error) => {
              console.error('[Terminal] Failed to send input:', error);
            });
          }
        });

        console.log('[Terminal] Initialized with session:', newSessionId);

      } catch (error) {
        console.error('[Terminal] Failed to initialize:', error);
        if (xtermRef.current && isMounted) {
          xtermRef.current.write('\r\n\x1b[31mFailed to start terminal session\x1b[0m\r\n');
        }
      }
    };

    initializeTerminal();

    return () => {
      isMounted = false;

      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }

      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      if (sessionId) {
        api.closeTerminalSession(sessionId).catch(console.error);
      }

      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }

      isInitializedRef.current = false;

      setTimeout(() => {
        api.cleanupTerminalSessions().catch(console.error);
      }, 1000);
    };
  }, []); // 只运行一次

  // 监听容器大小变化
  useEffect(() => {
    if (!terminalRef.current) return;

    // 初始化时立即获取容器宽度
    const rect = terminalRef.current.getBoundingClientRect();
    setContainerWidth(rect.width);

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        setContainerWidth(width);
      }
      handleResize();
    });

    resizeObserver.observe(terminalRef.current);

    // 监听窗口大小变化
    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  // 最大化状态改变时调整大小
  useEffect(() => {
    handleResize();
  }, [isMaximized, handleResize]);

  return (
    <div className={cn('flex flex-col h-full w-full bg-[#1e1e1e]', className)}>
      {/* 终端头部 */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-red-500'
            )} />
            <span className="text-sm text-gray-300">
              Terminal {sessionId ? `(${sessionId.slice(0, 8)})` : ''}
            </span>
          </div>
          {projectPath && (
            <span className="text-xs text-gray-500">
              {projectPath}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {terminalSize.cols}×{terminalSize.rows}
          </span>
          <span className="text-xs text-yellow-400">
            容器宽度: {containerWidth.toFixed(0)}px
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onToggleMaximize && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleMaximize}
              className="h-6 w-6 text-gray-400 hover:text-white"
            >
              {isMaximized ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-6 w-6 text-gray-400 hover:text-white hover:bg-red-600"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* 终端主体 */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={terminalRef}
          className="absolute inset-0 p-1"
          style={{
            backgroundColor: '#1e1e1e',
          }}
        />

        {!isConnected && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2" />
              <p className="text-gray-300 text-sm">正在连接终端...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Terminal;
