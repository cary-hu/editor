import { Parser } from '../blocks';
import { HeadingNode, CodeBlockNode, BlockQuoteNode, DetailsNode } from '../node';

const parser = new Parser();

describe('headingType ', () => {
  it('atx heading', () => {
    const root = parser.parse('# Heading');
    const heading = root.firstChild as HeadingNode;

    expect(heading.headingType).toBe('atx');
  });

  it('setext heading', () => {
    const root = parser.parse('Heading\n----');
    const heading = root.firstChild as HeadingNode;

    expect(heading.headingType).toBe('setext');
  });
});

describe('CodeBlockNode', () => {
  it('infoPadding is none', () => {
    const root = parser.parse('```js');
    const codeBlock = root.firstChild as CodeBlockNode;

    expect(codeBlock.infoPadding).toBe(0);
  });

  it('infoPadding is more than zero', () => {
    const root = parser.parse('```   js');
    const codeBlock = root.firstChild as CodeBlockNode;

    expect(codeBlock.infoPadding).toBe(3);
  });

  it('info string', () => {
    const root = parser.parse('```   javascript  ');
    const codeBlock = root.firstChild as CodeBlockNode;

    expect(codeBlock.info).toBe('javascript');
  });
});

describe('BlockQuoteType', () => {
  it('normal block quote', () => {
    const root = parser.parse('> This is a block quote');
    const blockQuote = root.firstChild as BlockQuoteNode;
    expect(blockQuote.bqType).toBe('default');
  });
  it('warning block quote', () => {
    const root = parser.parse('>type=warning\n> This is a warning block quote');
    const blockQuote = root.firstChild as BlockQuoteNode;
    expect(blockQuote.bqType).toBe('warning');
  });
  it('danger block quote', () => {
    const root = parser.parse('>type=danger\n> This is a danger block quote');
    const blockQuote = root.firstChild as BlockQuoteNode;
    expect(blockQuote.bqType).toBe('danger');
  });
  it('info block quote', () => {
    const root = parser.parse('>type=info\n> This is an info block quote');
    const blockQuote = root.firstChild as BlockQuoteNode;
    expect(blockQuote.bqType).toBe('info');
  });
  it('success block quote', () => {
    const root = parser.parse('>type=success\n> This is a success block quote');
    const blockQuote = root.firstChild as BlockQuoteNode;
    expect(blockQuote.bqType).toBe('success');
  });
  it('open details block quote', () => {
    const root = parser.parse('> [!warning]+ Summary\n> Details');
    const details = root.firstChild as DetailsNode;
    expect(details.type).toBe('details');
    expect(details.detailType).toBe('warning');
    expect(details.detailsOpen).toBe(true);
    expect(details.summary).toBe('Summary');
  });
  it('closed details block quote', () => {
    const root = parser.parse('> [!info]- Summary\n> Details');
    const details = root.firstChild as DetailsNode;
    expect(details.type).toBe('details');
    expect(details.detailType).toBe('info');
    expect(details.detailsOpen).toBe(false);
    expect(details.summary).toBe('Summary');
  });
});
