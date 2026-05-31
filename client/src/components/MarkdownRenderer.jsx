import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import { defaultSchema } from 'hast-util-sanitize';
import CodeBlock from './CodeBlock';

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...(defaultSchema.attributes?.span || []), 'className'],
    code: [...(defaultSchema.attributes?.code || []), 'className'],
    pre: [...(defaultSchema.attributes?.pre || []), 'className'],
    th: [...(defaultSchema.attributes?.th || []), 'align'],
    td: [...(defaultSchema.attributes?.td || []), 'align'],
  },
};

export default function MarkdownRenderer({ content }) {
  return useMemo(() => {
    if (!content) return null;

    return (
      <div className="markdown-body">
        <ReactMarkdown
          rehypePlugins={[rehypeHighlight, [rehypeSanitize, sanitizeSchema]]}
          remarkPlugins={[remarkGfm]}
          components={{
            pre: ({ children }) => children,
            code: CodeBlock,
            table: ({ children }) => (
              <div className="table-wrapper">
                <table>{children}</table>
              </div>
            ),
            a: ({ href, children }) => {
              if (!href || href.startsWith('javascript:')) {
                return <span>{children}</span>;
              }
              return (
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {children}
                </a>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }, [content]);
}
