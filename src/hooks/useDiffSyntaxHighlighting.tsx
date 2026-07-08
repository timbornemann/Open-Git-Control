import React, { useCallback } from 'react';

const tokenRegex = /(\/\/.*|#.*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^\`\\]|\\.)*`)|(\b(?:const|let|var|function|class|interface|type|struct|import|export|from|as|return|if|else|for|while|do|switch|case|default|break|continue|new|delete|try|catch|finally|throw|def|fn|func|pub|impl|use|package|go|defer|select|chan|map|range|nil|null|undefined|true|false|void|int|float|string|bool|boolean|any|public|private|protected|static|readonly|async|await|yield)\b)|(\b\d+(?:\.\d+)?\b)|(\b[A-Z][a-zA-Z0-9_]*\b)|(\b[a-zA-Z_][a-zA-Z0-9_]*(?=\s*\())/g;

export const useDiffSyntaxHighlighting = () => {
  const highlightLine = useCallback((text: string | null | undefined): React.ReactNode[] => {
    if (typeof text !== 'string' || !text) return [];

    const result: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    tokenRegex.lastIndex = 0;
    while ((match = tokenRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push(text.slice(lastIndex, match.index));
      }

      const matchedText = match[0];
      const key = `hl-${match.index}`;

      if (match[1]) {
        result.push(<span key={key} className="hl-comment">{matchedText}</span>);
      } else if (match[2]) {
        result.push(<span key={key} className="hl-string">{matchedText}</span>);
      } else if (match[3]) {
        result.push(<span key={key} className="hl-keyword">{matchedText}</span>);
      } else if (match[4]) {
        result.push(<span key={key} className="hl-number">{matchedText}</span>);
      } else if (match[5]) {
        result.push(<span key={key} className="hl-type">{matchedText}</span>);
      } else if (match[6]) {
        result.push(<span key={key} className="hl-function">{matchedText}</span>);
      } else {
        result.push(matchedText);
      }

      lastIndex = tokenRegex.lastIndex;
    }

    if (lastIndex < text.length) {
      result.push(text.slice(lastIndex));
    }

    return result;
  }, []);

  return { highlightLine };
};
