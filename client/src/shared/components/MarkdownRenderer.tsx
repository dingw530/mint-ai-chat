import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';
import { defaultSchema } from 'hast-util-sanitize';
import CodeBlock from './CodeBlock';
import type { Components } from 'react-markdown';

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

interface MarkdownRendererProps {
  content: string;
}

export default function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return useMemo(() => {
    if (!content) return null;

    const components: Partial<Components> = {
      pre: ({ children }) => <>{children}</>,
      code: CodeBlock as unknown as Components['code'],
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
    };

    return (
      <div className="markdown-body">
        <ReactMarkdown
          rehypePlugins={[rehypeHighlight as unknown as (tree: unknown) => void, [rehypeSanitize, sanitizeSchema]]}
          remarkPlugins={[remarkGfm as unknown as (tree: unknown) => void]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </div>
    );
  }, [content]);
}
