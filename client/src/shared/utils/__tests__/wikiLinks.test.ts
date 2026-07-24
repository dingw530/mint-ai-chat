import { describe, expect, it } from 'vitest';
import { parseMintWikiLink } from '../wikiLinks';

describe('parseMintWikiLink', () => {
  it.each([
    ['mint-wiki://open?path=pages/intro.md', 'pages/intro.md'],
    ['mint-wiki://open?path=pages/%E7%9F%A5%E8%AF%86.md', 'pages/知识.md'],
  ])('parses valid protocol links', (href, expected) => expect(parseMintWikiLink(href)).toBe(expected));

  it.each(['https://example.com', 'mint-wiki://open?path=/etc/passwd', 'mint-wiki://open?path=../secret.md'])('rejects unsafe links: %s',
    (href) => expect(parseMintWikiLink(href)).toBeNull());
});
