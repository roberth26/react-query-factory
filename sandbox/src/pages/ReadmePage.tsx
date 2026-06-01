import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { SpaceBetween, TextContent } from '@cloudscape-design/components';
import { CodeBlock } from '../shared.js';
import readme from '../../../README.md?raw';

export const handle = { label: 'README', source: readme };

export async function loader() {
  return null;
}

function ReadmePage() {
  return (
    <TextContent>
      <ReactMarkdown
        components={{
          code({ children, className }) {
            const isBlock = className?.startsWith('language-');
            if (!isBlock) return <code>{children}</code>;
            return (
              <SpaceBetween size="xs">
                <CodeBlock code={String(children).trimEnd()} />
              </SpaceBetween>
            );
          },
          // Open external links in new tab
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          // Strip the top-level h1 — the AppLayout header already shows the label
          h1() {
            return null;
          },
        }}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
      >
        {readme}
      </ReactMarkdown>
    </TextContent>
  );
}

export { ReadmePage as Component };
