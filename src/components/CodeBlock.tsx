"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

import styles from "@/src/styles/human-touch.module.css";

export function CodeBlock(input: {
  language: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timeout);
  }, [copied]);

  const language = input.language || "text";

  return (
    <div className={styles.codeWrap}>
      <div className={styles.codeHead}>
        <span className={styles.codeLang}>{language}</span>
        <button
          className={`${styles.copyButton} ${copied ? styles.copyButtonCopied : ""}`}
          onClick={async () => {
            await navigator.clipboard.writeText(input.value);
            setCopied(true);
          }}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className={styles.codeArea}>
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            margin: 0,
            background: "transparent",
            padding: "16px",
            fontSize: "13px",
            lineHeight: "1.6"
          }}
          showLineNumbers={false}
          wrapLongLines={false}
        >
          {input.value}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}
