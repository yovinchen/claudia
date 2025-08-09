import * as monaco from 'monaco-editor';
import { registerCodeActionProvider } from './eslint-integration';

// TypeScript 默认编译选项
export const defaultCompilerOptions: monaco.languages.typescript.CompilerOptions = {
  target: monaco.languages.typescript.ScriptTarget.Latest,
  allowNonTsExtensions: true,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  noEmit: true,
  esModuleInterop: true,
  jsx: monaco.languages.typescript.JsxEmit.React,
  reactNamespace: 'React',
  allowJs: true,
  typeRoots: ['node_modules/@types'],
  lib: ['es2020', 'dom', 'dom.iterable', 'esnext'],
  strict: true,
  skipLibCheck: true,
  forceConsistentCasingInFileNames: true,
  resolveJsonModule: true,
  isolatedModules: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
};

// JavaScript 默认编译选项
export const jsCompilerOptions: monaco.languages.typescript.CompilerOptions = {
  ...defaultCompilerOptions,
  strict: false,
  noUnusedLocals: false,
  noUnusedParameters: false,
  checkJs: true,
  allowJs: true,
};

// 配置 TypeScript 语言服务
export function configureMonacoTypescript() {
  // 配置 TypeScript 默认选项
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(defaultCompilerOptions);
  
  // 配置 JavaScript 默认选项
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(jsCompilerOptions);
  
  // 设置诊断选项
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  });
  
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false,
  });
  
  // 启用格式化选项
  monaco.languages.typescript.typescriptDefaults.setEagerModelSync(true);
  monaco.languages.typescript.javascriptDefaults.setEagerModelSync(true);
}

// 添加常用类型定义
export async function addTypeDefinitions() {
  const typeDefs = [
    {
      name: '@types/react',
      content: `
declare module "react" {
  export interface ReactElement<P = any, T extends string | JSXElementConstructor<any> = string | JSXElementConstructor<any>> {
    type: T;
    props: P;
    key: Key | null;
  }
  export type FC<P = {}> = FunctionComponent<P>;
  export interface FunctionComponent<P = {}> {
    (props: P, context?: any): ReactElement<any, any> | null;
  }
  export function useState<S>(initialState: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useEffect(effect: EffectCallback, deps?: DependencyList): void;
  export function useCallback<T extends Function>(callback: T, deps: DependencyList): T;
  export function useMemo<T>(factory: () => T, deps: DependencyList): T;
  export function useRef<T>(initialValue: T): MutableRefObject<T>;
}
      `
    },
    {
      name: '@types/node',
      content: `
declare module "fs" {
  export function readFileSync(path: string, encoding?: string): string | Buffer;
  export function writeFileSync(path: string, data: string | Buffer): void;
}
declare module "path" {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}
      `
    }
  ];
  
  for (const typeDef of typeDefs) {
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      typeDef.content,
      `file:///node_modules/${typeDef.name}/index.d.ts`
    );
    monaco.languages.typescript.javascriptDefaults.addExtraLib(
      typeDef.content,
      `file:///node_modules/${typeDef.name}/index.d.ts`
    );
  }
}

// 注册自定义主题
export function registerCustomThemes() {
  // VS Code Dark+ 主题
  monaco.editor.defineTheme('vs-dark-plus', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955' },
      { token: 'keyword', foreground: '569CD6' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'class', foreground: '4EC9B0' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'constant', foreground: '4FC1FF' },
      { token: 'parameter', foreground: '9CDCFE' },
      { token: 'property', foreground: '9CDCFE' },
      { token: 'regexp', foreground: 'D16969' },
      { token: 'operator', foreground: 'D4D4D4' },
      { token: 'namespace', foreground: '4EC9B0' },
      { token: 'type.identifier', foreground: '4EC9B0' },
      { token: 'tag', foreground: '569CD6' },
      { token: 'attribute.name', foreground: '9CDCFE' },
      { token: 'attribute.value', foreground: 'CE9178' },
    ],
    colors: {
      'editor.background': '#1E1E1E',
      'editor.foreground': '#D4D4D4',
      'editorLineNumber.foreground': '#858585',
      'editorCursor.foreground': '#AEAFAD',
      'editor.selectionBackground': '#264F78',
      'editor.inactiveSelectionBackground': '#3A3D41',
      'editorIndentGuide.background': '#404040',
      'editorIndentGuide.activeBackground': '#707070',
      'editor.wordHighlightBackground': '#515C6A',
      'editor.wordHighlightStrongBackground': '#515C6A',
      'editorError.foreground': '#F48771',
      'editorWarning.foreground': '#CCA700',
      'editorInfo.foreground': '#75BEFF',
    }
  });
}

// 配置 JSON 语言
export function configureJsonLanguage() {
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    schemas: [
      {
        uri: 'http://json-schema.org/draft-07/schema#',
        fileMatch: ['*.json'],
        schema: {
          type: 'object',
          properties: {},
          additionalProperties: true
        }
      },
      {
        uri: 'http://json.schemastore.org/package',
        fileMatch: ['package.json'],
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            version: { type: 'string' },
            dependencies: { type: 'object' },
            devDependencies: { type: 'object' },
            scripts: { type: 'object' }
          }
        }
      },
      {
        uri: 'http://json.schemastore.org/tsconfig',
        fileMatch: ['tsconfig.json', 'tsconfig.*.json'],
        schema: {
          type: 'object',
          properties: {
            compilerOptions: { type: 'object' },
            include: { type: 'array' },
            exclude: { type: 'array' }
          }
        }
      }
    ],
    allowComments: true,
    trailingCommas: 'warning'
  });
}

// 添加代码片段
export function registerSnippets() {
  // TypeScript/JavaScript 代码片段
  monaco.languages.registerCompletionItemProvider(['typescript', 'javascript', 'typescriptreact', 'javascriptreact'], {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      
      const suggestions = [
        {
          label: 'log',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'console.log(${1:message});',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Console log statement',
          range
        },
        {
          label: 'useState',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: 'const [${1:state}, set${1/(.*)/${1:/capitalize}/}] = useState(${2:initialValue});',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'React useState hook',
          range
        },
        {
          label: 'useEffect',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            'useEffect(() => {',
            '\t${1:// Effect logic}',
            '\treturn () => {',
            '\t\t${2:// Cleanup}',
            '\t};',
            '}, [${3:dependencies}]);'
          ].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'React useEffect hook',
          range
        },
        {
          label: 'component',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            'const ${1:ComponentName}: React.FC = () => {',
            '\treturn (',
            '\t\t<div>',
            '\t\t\t${2:content}',
            '\t\t</div>',
            '\t);',
            '};',
            '',
            'export default ${1:ComponentName};'
          ].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'React functional component',
          range
        },
        {
          label: 'async',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            'async function ${1:functionName}() {',
            '\ttry {',
            '\t\tconst result = await ${2:promise};',
            '\t\t${3:// Handle result}',
            '\t} catch (error) {',
            '\t\tconsole.error(error);',
            '\t}',
            '}'
          ].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: 'Async function with try-catch',
          range
        }
      ];
      
      return { suggestions };
    }
  });
}

// 配置语言特性
export function configureLanguageFeatures() {
  // 配置 HTML 标签自动闭合
  monaco.languages.registerOnTypeFormattingEditProvider(['html', 'xml', 'javascriptreact', 'typescriptreact'], {
    autoFormatTriggerCharacters: ['>'],
    provideOnTypeFormattingEdits: (model, position, ch) => {
      if (ch === '>') {
        const lineContent = model.getLineContent(position.lineNumber);
        const beforeCursor = lineContent.substring(0, position.column - 1);
        
        // 检查是否是开始标签
        const tagMatch = beforeCursor.match(/<(\w+)(?:\s+[^>]*)?>/);
        if (tagMatch) {
          const tagName = tagMatch[1];
          // 自闭合标签列表
          const selfClosingTags = ['img', 'br', 'hr', 'input', 'meta', 'link'];
          if (!selfClosingTags.includes(tagName.toLowerCase())) {
            return [{
              range: {
                startLineNumber: position.lineNumber,
                startColumn: position.column,
                endLineNumber: position.lineNumber,
                endColumn: position.column
              },
              text: `</${tagName}>`
            }];
          }
        }
      }
      return [];
    }
  });
  
  // 配置括号自动配对
  monaco.languages.setLanguageConfiguration('typescript', {
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
      { open: '<', close: '>' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
      { open: '`', close: '`' },
      { open: '<', close: '>' },
    ],
  });
}

// 初始化 Monaco Editor 配置
export async function initializeMonaco() {
  // 配置 TypeScript/JavaScript
  configureMonacoTypescript();
  
  // 添加类型定义
  await addTypeDefinitions();
  
  // 注册自定义主题
  registerCustomThemes();
  
  // 配置 JSON
  configureJsonLanguage();
  
  // 注册代码片段
  registerSnippets();
  
  // 配置语言特性
  configureLanguageFeatures();
  
  // 注册代码操作提供器（快速修复）
  registerCodeActionProvider();
}

// 格式化文档
export function formatDocument(editor: monaco.editor.IStandaloneCodeEditor) {
  editor.getAction('editor.action.formatDocument')?.run();
}

// 添加错误标记
export function addErrorMarkers(
  editor: monaco.editor.IStandaloneCodeEditor,
  errors: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning' | 'info';
  }>
) {
  const model = editor.getModel();
  if (!model) return;
  
  const markers = errors.map(error => ({
    severity: error.severity === 'error' 
      ? monaco.MarkerSeverity.Error 
      : error.severity === 'warning' 
        ? monaco.MarkerSeverity.Warning 
        : monaco.MarkerSeverity.Info,
    startLineNumber: error.line,
    startColumn: error.column,
    endLineNumber: error.line,
    endColumn: error.column + 1,
    message: error.message,
  }));
  
  monaco.editor.setModelMarkers(model, 'owner', markers);
}

// 清除错误标记
export function clearErrorMarkers(editor: monaco.editor.IStandaloneCodeEditor) {
  const model = editor.getModel();
  if (model) {
    monaco.editor.setModelMarkers(model, 'owner', []);
  }
}