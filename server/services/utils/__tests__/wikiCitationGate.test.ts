import { describe, expect, it } from 'vitest';
import { buildMissingWikiCitationFooter } from '../wikiCitationGate.js';

describe('buildMissingWikiCitationFooter', () => {
  const references = [{ refId: 'C1' }, { refId: 'C2' }];

  it('adds all retrieved references when the answer has no usable citation', () => {
    expect(buildMissingWikiCitationFooter('结论。', references))
      .toBe('\n\n参考来源（模型未逐句标注）：[C1] [C2]');
  });

  it('adds only uncited references when inline citations already exist', () => {
    expect(buildMissingWikiCitationFooter('结论。[1]', references))
      .toBe('\n\n补充检索来源：[C2]');
  });

  it('does not treat an ordered list item as a citation', () => {
    expect(buildMissingWikiCitationFooter('步骤如下：\n[1] 先检索', references))
      .toBe('\n\n参考来源（模型未逐句标注）：[C1] [C2]');
  });

  it('does not append a footer when every reference is cited', () => {
    expect(buildMissingWikiCitationFooter('结论。[C1] 依据。[C2]', references)).toBe('');
  });
});
