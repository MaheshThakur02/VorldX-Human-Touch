"use client";

import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { CodeBlock } from "@/src/components/CodeBlock";
import styles from "@/src/styles/human-touch.module.css";

export function MarkdownRenderer(input: { content: string }) {
  return (
    <div className={styles.markdown}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            const { inline, className, children, ...rest } = props as {
              inline?: boolean;
              className?: string;
              children?: ReactNode;
            };
            const value = String(children ?? "").replace(/\n$/, "");
            const match = /language-(\w+)/.exec(className ?? "");
            if (inline) {
              return (
                <code className={className} {...rest}>
                  {children}
                </code>
              );
            }
            return <CodeBlock language={match?.[1] ?? "text"} value={value} />;
          },
          a(props) {
            return <a {...props} target="_blank" rel="noreferrer noopener" />;
          }
        }}
      >
        {input.content}
      </ReactMarkdown>
    </div>
  );
}
