import CodeMirror from '@uiw/react-codemirror';
import { StreamLanguage } from '@codemirror/language';
import { commonLisp } from '@codemirror/legacy-modes/mode/commonlisp';

// PDDL is S-expression / Lisp-like, so the Common Lisp stream parser gives us
// reasonable bracket + symbol highlighting without a custom grammar.
const pddlLanguage = StreamLanguage.define(commonLisp);

interface Props {
  value: string;
  onChange: (value: string) => void;
  label: string;
  height?: string;
  error?: string | null;
  theme?: 'light' | 'dark';
}

export function CodeEditor({
  value,
  onChange,
  label,
  height = '320px',
  error,
  theme = 'dark',
}: Props) {
  return (
    <div className={`editor${error ? ' editor-invalid' : ''}`}>
      <div className="editor-label">
        {label}
        {error && <span className="editor-error">⚠ {error}</span>}
      </div>
      <CodeMirror
        value={value}
        height={height}
        theme={theme}
        extensions={[pddlLanguage]}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          bracketMatching: true,
          closeBrackets: true,
        }}
      />
    </div>
  );
}
