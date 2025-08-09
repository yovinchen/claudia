import * as monaco from 'monaco-editor';
import type { Linter } from 'eslint';

// 将 ESLint 诊断转换为 Monaco 标记
export function convertESLintToMonacoMarkers(
  eslintMessages: Linter.LintMessage[],
  _model: monaco.editor.ITextModel
): monaco.editor.IMarkerData[] {
  return eslintMessages.map(message => {
    return {
      severity: message.severity === 2 
        ? monaco.MarkerSeverity.Error 
        : monaco.MarkerSeverity.Warning,
      startLineNumber: message.line || 1,
      startColumn: message.column || 1,
      endLineNumber: message.endLine || message.line || 1,
      endColumn: message.endColumn || (message.column ? message.column + 1 : 1),
      message: message.message,
      source: message.ruleId || 'eslint',
    };
  });
}

// 实时语法检查配置
export interface RealtimeLintOptions {
  enabled: boolean;
  delay: number; // 延迟时间（毫秒）
  showInlineErrors: boolean;
  showErrorsInScrollbar: boolean;
  showErrorsInMinimap: boolean;
}

export const defaultLintOptions: RealtimeLintOptions = {
  enabled: true,
  delay: 500,
  showInlineErrors: true,
  showErrorsInScrollbar: true,
  showErrorsInMinimap: true,
};

// 配置实时语法检查
export function setupRealtimeLinting(
  editor: monaco.editor.IStandaloneCodeEditor,
  options: RealtimeLintOptions = defaultLintOptions
) {
  if (!options.enabled) return;
  
  let lintTimer: NodeJS.Timeout | null = null;
  
  const performLinting = () => {
    const model = editor.getModel();
    if (!model) return;
    
    const language = model.getLanguageId();
    if (language !== 'typescript' && language !== 'javascript' && 
        language !== 'typescriptreact' && language !== 'javascriptreact') {
      return;
    }
    
    // 根据选项配置显示
    if (options.showErrorsInScrollbar) {
      editor.updateOptions({
        overviewRulerLanes: 3,
      });
    }
    
    if (options.showErrorsInMinimap) {
      editor.updateOptions({
        minimap: {
          showSlider: 'always',
          renderCharacters: false,
        },
      });
    }
  };
  
  // 监听内容变化
  editor.onDidChangeModelContent(() => {
    if (lintTimer) {
      clearTimeout(lintTimer);
    }
    
    lintTimer = setTimeout(() => {
      performLinting();
    }, options.delay);
  });
  
  // 初始检查
  performLinting();
}

// 代码快速修复建议
export interface QuickFix {
  title: string;
  kind: string;
  edit: monaco.languages.WorkspaceEdit;
}

// 注册代码操作提供器（快速修复）
export function registerCodeActionProvider() {
  monaco.languages.registerCodeActionProvider(['typescript', 'javascript', 'typescriptreact', 'javascriptreact'], {
    provideCodeActions: (model, _range, context, _token) => {
      const actions: monaco.languages.CodeAction[] = [];
      
      // 检查是否有错误标记
      const markers = context.markers.filter(marker => marker.severity === monaco.MarkerSeverity.Error);
      
      for (const marker of markers) {
        // 未使用变量的快速修复
        if (marker.code === '6133' || marker.message.includes('is declared but')) {
          actions.push({
            title: `Remove unused declaration`,
            kind: 'quickfix',
            diagnostics: [marker],
            edit: {
              edits: [{
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: marker.startLineNumber,
                    startColumn: 1,
                    endLineNumber: marker.endLineNumber,
                    endColumn: model.getLineLength(marker.endLineNumber) + 1,
                  },
                  text: '',
                },
                versionId: undefined,
              }],
            },
            isPreferred: true,
          });
        }
        
        // 缺少导入的快速修复
        if (marker.message.includes('Cannot find name')) {
          const variableName = marker.message.match(/Cannot find name '([^']+)'/)?.[1];
          if (variableName) {
            actions.push({
              title: `Import '${variableName}'`,
              kind: 'quickfix',
              diagnostics: [marker],
              edit: {
                edits: [{
                  resource: model.uri,
                  textEdit: {
                    range: {
                      startLineNumber: 1,
                      startColumn: 1,
                      endLineNumber: 1,
                      endColumn: 1,
                    },
                    text: `import { ${variableName} } from './${variableName.toLowerCase()}';\n`,
                  },
                  versionId: undefined,
                }],
              },
              isPreferred: false,
            });
          }
        }
        
        // 类型错误的快速修复
        if (marker.message.includes('Type') && marker.message.includes('is not assignable')) {
          actions.push({
            title: 'Add type assertion',
            kind: 'quickfix',
            diagnostics: [marker],
            edit: {
              edits: [{
                resource: model.uri,
                textEdit: {
                  range: {
                    startLineNumber: marker.startLineNumber,
                    startColumn: marker.startColumn,
                    endLineNumber: marker.endLineNumber,
                    endColumn: marker.endColumn,
                  },
                  text: `(${model.getValueInRange({
                    startLineNumber: marker.startLineNumber,
                    startColumn: marker.startColumn,
                    endLineNumber: marker.endLineNumber,
                    endColumn: marker.endColumn,
                  })} as any)`,
                },
                versionId: undefined,
              }],
            },
            isPreferred: false,
          });
        }
      }
      
      // 添加格式化操作
      actions.push({
        title: 'Format Document',
        kind: 'source.formatAll',
        command: {
          id: 'editor.action.formatDocument',
          title: 'Format Document',
        },
      });
      
      // 添加组织导入操作
      actions.push({
        title: 'Organize Imports',
        kind: 'source.organizeImports',
        command: {
          id: 'editor.action.organizeImports',
          title: 'Organize Imports',
        },
      });
      
      return {
        actions,
        dispose: () => {},
      };
    },
  });
}