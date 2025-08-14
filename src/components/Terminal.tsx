import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
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
  const fitAddonRef = useRef<FitAddon | null>(null);
  const isInitializedRef = useRef(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // 调整终端大小
  const handleResize = useCallback(() => {
    if (fitAddonRef.current) {
      setTimeout(() => {
        try {
          fitAddonRef.current?.fit();
        } catch (error) {
          console.warn('Terminal resize failed:', error);
        }
      }, 100);
    }
  }, []);

  // 初始化和启动终端 - 只运行一次
  useEffect(() => {
    if (isInitializedRef.current || !terminalRef.current) return;
    
    let isMounted = true;
    
    const initializeTerminal = async () => {
      try {
        console.log('Initializing terminal...');
        isInitializedRef.current = true;

        // 创建终端实例
        const xterm = new XTerm({
          theme: {
            background: '#1e1e1e',
            foreground: '#d4d4d4',
            cursor: '#ffffff',
            cursorAccent: '#000000',
            selectionBackground: '#264f78',
            // ANSI 颜色
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
          // 使用支持 Powerline 和 Nerd Font 的字体
          fontFamily: '"MesloLGS NF", "JetBrainsMono Nerd Font", "FiraCode Nerd Font", "Hack Nerd Font", "SauceCodePro Nerd Font", "JetBrains Mono", "SF Mono", "Monaco", "Inconsolata", "Fira Code", "Source Code Pro", monospace',
          fontSize: 14,
          fontWeight: 'normal',
          fontWeightBold: 'bold',
          lineHeight: 1.2,
          letterSpacing: 0,
          cols: 80,
          rows: 24,
          allowTransparency: false,
          scrollback: 10000,
          convertEol: true,
          cursorBlink: true,
          cursorStyle: 'block',
          drawBoldTextInBrightColors: true,
          macOptionIsMeta: true,
          rightClickSelectsWord: true,
          // 启用提议的 API 以支持 Unicode 插件
          allowProposedApi: true,
          // 使用 canvas 渲染器以获得更好的性能
          // @ts-ignore - xterm.js 类型定义可能过时
          rendererType: 'canvas',
          windowsMode: false,
        });

        // 添加插件
        const fitAddon = new FitAddon();
        const webLinksAddon = new WebLinksAddon();
        const searchAddon = new SearchAddon();

        xterm.loadAddon(fitAddon);
        xterm.loadAddon(webLinksAddon);
        xterm.loadAddon(searchAddon);

        // 打开终端
        if (terminalRef.current) {
          xterm.open(terminalRef.current);
        }
        
        // 适应容器大小 - 延迟一点确保容器尺寸计算正确
        setTimeout(() => {
          fitAddon.fit();
          // 发送 resize 命令到后端（虽然当前未实现）
          const { cols, rows } = fitAddon.proposeDimensions() || { cols: 120, rows: 30 };
          if (newSessionId) {
            api.resizeTerminal(newSessionId, cols, rows).catch(console.error);
          }
        }, 150);

        // 存储引用
        xtermRef.current = xterm;
        fitAddonRef.current = fitAddon;

        // 创建终端会话
        const newSessionId = await api.createTerminalSession(projectPath || process.cwd());
        
        if (!isMounted) {
          // 如果组件已卸载，清理会话
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
        // 使用PTY后，shell会自动处理回显
        xterm.onData((data) => {
          console.log('Terminal onData received:', JSON.stringify(data), 'Session ID:', newSessionId);
          if (newSessionId && isMounted) {
            // 直接发送数据到PTY，PTY会处理回显
            api.sendTerminalInput(newSessionId, data).catch((error) => {
              console.error('Failed to send terminal input:', error);
            });
          }
        });

        console.log('Terminal initialized with session:', newSessionId);

      } catch (error) {
        console.error('Failed to initialize terminal:', error);
        if (xtermRef.current && isMounted) {
          xtermRef.current.write('\r\n\x1b[31mFailed to start terminal session\x1b[0m\r\n');
        }
      }
    };

    initializeTerminal();

    return () => {
      isMounted = false;
      
      // 清理监听器
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }

      // 关闭会话
      if (sessionId) {
        api.closeTerminalSession(sessionId).catch(console.error);
      }

      // 清理终端实例
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
      
      fitAddonRef.current = null;
      isInitializedRef.current = false;

      // 清理孤儿会话
      setTimeout(() => {
        api.cleanupTerminalSessions().catch(console.error);
      }, 1000);
    };
  }, []); // 空依赖数组 - 只运行一次

  // 监听窗口大小变化
  useEffect(() => {
    const handleWindowResize = () => handleResize();
    window.addEventListener('resize', handleWindowResize);
    
    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [handleResize]);

  // 当最大化状态改变时调整大小
  useEffect(() => {
    handleResize();
  }, [isMaximized, handleResize]);

  return (
    <div className={cn('flex flex-col h-full bg-[#1e1e1e]', className)}>
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
      <div className="flex-1 relative bg-[#1e1e1e]">
        <div
          ref={terminalRef}
          className="absolute inset-0"
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