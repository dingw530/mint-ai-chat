import { citationsFromReferenceMarkers } from '../../eval.js';

const references = [
  {
    file: 'pages/eval/first.md',
    title: 'First',
    heading: 'Overview',
    chunkId: 'pages/eval/first.md#chunk:0',
    refId: 'C1',
  },
  {
    file: 'pages/eval/second.md',
    title: 'Second',
    heading: 'Details',
    chunkId: 'pages/eval/second.md#chunk:1',
    refId: 'C2',
  },
];

describe('citationsFromReferenceMarkers', () => {
  it('maps numeric model markers to the corresponding Wiki references', () => {
    const citations = citationsFromReferenceMarkers(
      '',
      'RAG 需要检索外部知识。[1]\n\n混合检索可以提升召回。[2]',
      references,
    );

    expect(citations.map((citation) => citation.file)).toEqual([
      'pages/eval/first.md',
      'pages/eval/second.md',
    ]);
  });

  it('does not treat ordered-list markers as citations', () => {
    const citations = citationsFromReferenceMarkers(
      '',
      '步骤如下：\n[1] 先检索\n[2] 再回答',
      references,
    );

    expect(citations).toEqual([]);
  });

  it('prefers emitted block citations when display ids were renumbered', () => {
    const citations = citationsFromReferenceMarkers(
      '',
      '答案引用来源。[1]',
      [references[0]],
      [{ file: 'pages/eval/displayed.md', refId: 'C1' }],
    );

    expect(citations).toEqual([{ file: 'pages/eval/displayed.md', refId: 'C1' }]);
  });
});
