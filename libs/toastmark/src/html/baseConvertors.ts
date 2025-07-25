import { HTMLConvertorMap } from '@t/renderer';
import {
  Node,
  HeadingNode,
  CodeBlockNode,
  ListNode,
  LinkNode,
  CustomBlockNode,
  BlockQuoteNode,
  ImageNode,
} from '../commonmark/node';
import { decodeImageCaption, escapeXml } from '../commonmark/common';
import { filterDisallowedTags } from './tagFilter';

const CUSTOM_SYNTAX_LENGTH = 4;

export const baseConvertors: HTMLConvertorMap = {
  heading(node, { entering }) {
    return {
      type: entering ? 'openTag' : 'closeTag',
      tagName: `h${(node as HeadingNode).level}`,
      outerNewLine: true,
    };
  },

  text(node) {
    return {
      type: 'text',
      content: node.literal!,
    };
  },

  softbreak(_, { options }) {
    return {
      type: 'html',
      content: options.softbreak,
    };
  },

  linebreak() {
    return {
      type: 'html',
      content: '<br />\n',
    };
  },

  emph(_, { entering }) {
    return {
      type: entering ? 'openTag' : 'closeTag',
      tagName: 'em',
    };
  },

  strong(_, { entering }) {
    return {
      type: entering ? 'openTag' : 'closeTag',
      tagName: 'strong',
    };
  },

  paragraph(node, { entering }) {
    const grandparent = node.parent?.parent;
    if (grandparent && grandparent.type === 'list') {
      if ((grandparent as ListNode).listData!.tight) {
        return null;
      }
    }

    // Check if paragraph contains only an image with caption that would be converted to figure
    // In this case, we should not render the paragraph wrapper to avoid invalid HTML structure
    if (node.firstChild && !node.firstChild.next && node.firstChild.type === 'image') {
      const imageNode = node.firstChild as ImageNode;

      if (imageNode.caption) {
        // This image will be converted to a figure element, so skip the paragraph wrapper
        return null;
      }
    }

    return {
      type: entering ? 'openTag' : 'closeTag',
      tagName: 'p',
      outerNewLine: true,
    };
  },

  thematicBreak() {
    return {
      type: 'openTag',
      tagName: 'hr',
      outerNewLine: true,
      selfClose: true,
    };
  },

  blockQuote(node, context) {
    if (context.entering) {
      return {
        type: 'openTag',
        attributes: {
          'data-block-quote-type': (node as BlockQuoteNode).bqType,
        },
        tagName: 'blockquote',
        outerNewLine: true,
        innerNewLine: true,
      };
    }
    return {
      type: 'closeTag',
      tagName: 'blockquote',
      outerNewLine: true,
      innerNewLine: true,
    };
  },

  list(node, { entering }) {
    const { type, start } = (node as ListNode).listData!;
    const tagName = type === 'bullet' ? 'ul' : 'ol';
    const attributes: Record<string, string> = {};
    if (tagName === 'ol' && start !== null && start !== 1) {
      attributes.start = start.toString();
    }

    return {
      type: entering ? 'openTag' : 'closeTag',
      tagName,
      attributes,
      outerNewLine: true,
    };
  },

  item(_, { entering }) {
    return {
      type: entering ? 'openTag' : 'closeTag',
      tagName: 'li',
      outerNewLine: true,
    };
  },

  htmlInline(node, { options }) {
    const content = options.tagFilter ? filterDisallowedTags(node.literal!) : node.literal!;

    return { type: 'html', content };
  },

  htmlBlock(node, { options }) {
    const content = options.tagFilter ? filterDisallowedTags(node.literal!) : node.literal!;

    if (options.nodeId) {
      return [
        { type: 'openTag', tagName: 'div', outerNewLine: true },
        { type: 'html', content },
        { type: 'closeTag', tagName: 'div', outerNewLine: true },
      ];
    }

    return { type: 'html', content, outerNewLine: true };
  },

  code(node) {
    return [
      { type: 'openTag', tagName: 'code' },
      { type: 'text', content: node.literal! },
      { type: 'closeTag', tagName: 'code' },
    ];
  },

  codeBlock(node) {
    const infoStr = (node as CodeBlockNode).info;
    const infoWords = infoStr ? infoStr.split(/\s+/) : [];
    const codeClassNames = [];
    if (infoWords.length > 0 && infoWords[0].length > 0) {
      codeClassNames.push(`language-${escapeXml(infoWords[0])}`);
    }

    return [
      { type: 'openTag', tagName: 'pre', outerNewLine: true },
      { type: 'openTag', tagName: 'code', classNames: codeClassNames },
      { type: 'text', content: node.literal! },
      { type: 'closeTag', tagName: 'code' },
      { type: 'closeTag', tagName: 'pre', outerNewLine: true },
    ];
  },

  link(node: Node, { entering }) {
    if (entering) {
      const { title, destination, target, rel } = node as LinkNode;

      return {
        type: 'openTag',
        tagName: 'a',
        attributes: {
          href: escapeXml(destination!),
          ...(title && { title: escapeXml(title) }),
          ...(target && { target: escapeXml(target) }),
          ...(rel && { rel: escapeXml(rel) }),
        },
      };
    }
    return { type: 'closeTag', tagName: 'a' };
  },

  image(node: Node, { getChildrenText, skipChildren }) {
    const { title, destination, width, verticalAlign, caption } = node as ImageNode;

    skipChildren();

    const imgAttributes: Record<string, string> = {
      src: escapeXml(destination!),
      alt: getChildrenText(node),
      ...(title && { title: escapeXml(title) }),
      ...(width && { style: `width: ${width}px` }),
      ...(verticalAlign && { 'data-verticalAlign': verticalAlign }),
      ...(verticalAlign && { style: `vertical-align: ${verticalAlign}` }),
    };

    const imgTag = {
      type: 'openTag' as const,
      tagName: 'img',
      selfClose: true,
      attributes: imgAttributes,
    };

    return imgTag;
  },

  customBlock(node, context, convertors) {
    const info = (node as CustomBlockNode).info!.trim().toLowerCase();
    const customConvertor = convertors![info];

    if (customConvertor) {
      try {
        return customConvertor!(node, context);
      } catch (e) {
        console.warn(
          `[@caryhu/tui.editor] - The error occurred when ${info} block node was parsed in markdown renderer: ${e}`
        );
      }
    }

    return [
      { type: 'openTag', tagName: 'div', outerNewLine: true },
      { type: 'text', content: node.literal! },
      { type: 'closeTag', tagName: 'div', outerNewLine: true },
    ];
  },

  frontMatter(node) {
    return [
      {
        type: 'openTag',
        tagName: 'div',
        outerNewLine: true,
        // Because front matter is metadata, it should not be render.
        attributes: { style: 'white-space: pre; display: none;' },
      },
      { type: 'text', content: node.literal! },
      { type: 'closeTag', tagName: 'div', outerNewLine: true },
    ];
  },

  customInline(node, context, convertors) {
    const { info, firstChild } = node as CustomBlockNode;
    const nomalizedInfo = info.trim().toLowerCase();
    const customConvertor = convertors![nomalizedInfo];
    const { entering } = context;

    if (customConvertor) {
      try {
        return customConvertor!(node, context);
      } catch (e) {
        console.warn(
          `[@caryhu/tui.editor] - The error occurred when ${nomalizedInfo} inline node was parsed in markdown renderer: ${e}`
        );
      }
    }

    return entering
      ? [
          { type: 'openTag', tagName: 'span' },
          { type: 'text', content: `$$${info}${firstChild ? ' ' : ''}` },
        ]
      : [
          { type: 'text', content: '$$' },
          { type: 'closeTag', tagName: 'span' },
        ];
  },
};
