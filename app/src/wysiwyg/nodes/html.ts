import {
  ProsemirrorNode,
  Mark as ProsemirrorMark,
  DOMOutputSpec,
  NodeSpec,
  MarkSpec,
} from 'prosemirror-model';
import { MdNode } from '@toast-ui/toastmark';
import toArray from 'tui-code-snippet/collection/toArray';
import { Sanitizer, HTMLSchemaMap, CustomHTMLRenderer } from '@t/editor';
import { ToDOMAdaptor } from '@t/convertor';
import { registerTagWhitelistIfPossible } from '@/sanitizer/htmlSanitizer';
import { reHTMLTag, ATTRIBUTE } from '@/utils/constants';
import { isHtmlInlineMediaTag } from '@/utils/htmlInlineMedia';

export function getChildrenHTML(node: MdNode, typeName: string) {
  return node
    .literal!.replace(new RegExp(`(<\\s*${typeName}[^>]*>)|(</${typeName}\\s*[>])`, 'ig'), '')
    .trim();
}

export function getHTMLAttrsByHTMLString(html: string) {
  html = html.match(reHTMLTag)![0];
  const attrs = html.match(new RegExp(ATTRIBUTE, 'g'));

  return attrs
    ? attrs.reduce<Record<string, string | null>>((acc, attr) => {
        const [name, ...values] = attr.trim().split('=');

        if (values.length) {
          acc[name] = values.join('=').replace(/'|"/g, '').trim();
        }

        return acc;
      }, {})
    : {};
}

function getHTMLAttrs(dom: HTMLElement) {
  return toArray(dom.attributes).reduce<Record<string, string | null>>((acc, attr) => {
    acc[attr.nodeName] = attr.nodeValue;
    return acc;
  }, {});
}

export function sanitizeDOM(
  node: ProsemirrorNode | ProsemirrorMark,
  typeName: string,
  sanitizer: Sanitizer,
  wwToDOMAdaptor: ToDOMAdaptor,
) {
  let dom = wwToDOMAdaptor.getToDOMNode(typeName)!(node) as HTMLElement;
  const html = sanitizer(dom.outerHTML);
  const container = document.createElement('div');

  container.innerHTML = html;
  dom = container.firstChild as HTMLElement;

  const htmlAttrs = getHTMLAttrs(dom);

  return { dom, htmlAttrs };
}

// Tags that should be treated as inline atom nodes instead of marks.
// Keep only void-like tags here. Container tags such as video/audio can wrap
// fallback text, so they must remain htmlInline marks for markdown round-trip.
const INLINE_ATOM_TAGS = ['source', 'track'];
const schemaFactory = {
  htmlBlock(typeName: string, sanitizeHTML: Sanitizer, wwToDOMAdaptor: ToDOMAdaptor): NodeSpec {
    return {
      atom: true,
      content: 'block+',
      group: 'block',
      attrs: {
        htmlAttrs: { default: {} },
        childrenHTML: { default: '' },
        htmlBlock: { default: true },
      },
      parseDOM: [
        {
          tag: typeName,
          getAttrs(dom: Node | string) {
            return {
              htmlAttrs: getHTMLAttrs(dom as HTMLElement),
              childrenHTML: (dom as HTMLElement).innerHTML,
            };
          },
        },
      ],
      toDOM(node: ProsemirrorNode): DOMOutputSpec {
        const { dom, htmlAttrs } = sanitizeDOM(node, typeName, sanitizeHTML, wwToDOMAdaptor);

        htmlAttrs.class = htmlAttrs.class ? `${htmlAttrs.class} html-block` : 'html-block';

        return [typeName, htmlAttrs, ...toArray(dom.childNodes)];
      },
    };
  },
  // For inline atom nodes like source/track - they are inline but don't wrap text
  htmlInlineNode(
    typeName: string,
    sanitizeHTML: Sanitizer,
    wwToDOMAdaptor: ToDOMAdaptor,
  ): NodeSpec {
    return {
      inline: true,
      atom: true,
      selectable: true,
      group: 'inline',
      attrs: {
        htmlAttrs: { default: {} },
        htmlInline: { default: true },
      },
      parseDOM: [
        {
          tag: typeName,
          getAttrs(dom: Node | string) {
            return {
              htmlAttrs: getHTMLAttrs(dom as HTMLElement),
            };
          },
        },
      ],
      toDOM(node: ProsemirrorNode): DOMOutputSpec {
        const { htmlAttrs } = sanitizeDOM(node, typeName, sanitizeHTML, wwToDOMAdaptor);

        return [typeName, htmlAttrs];
      },
    };
  },
  htmlInline(typeName: string, sanitizeHTML: Sanitizer, wwToDOMAdaptor: ToDOMAdaptor): MarkSpec {
    return {
      inclusive: !isHtmlInlineMediaTag(typeName),
      attrs: {
        htmlAttrs: { default: {} },
        htmlInline: { default: true },
      },
      parseDOM: [
        {
          tag: typeName,
          getAttrs(dom: Node | string) {
            return {
              htmlAttrs: getHTMLAttrs(dom as HTMLElement),
            };
          },
        },
      ],
      toDOM(node: ProsemirrorMark): DOMOutputSpec {
        const { htmlAttrs } = sanitizeDOM(node, typeName, sanitizeHTML, wwToDOMAdaptor);

        return [typeName, htmlAttrs, 0];
      },
    };
  },
};

export function isInlineAtomTag(tagName: string): boolean {
  return INLINE_ATOM_TAGS.includes(tagName.toLowerCase());
}

export function createHTMLSchemaMap(
  convertorMap: CustomHTMLRenderer,
  sanitizeHTML: Sanitizer,
  wwToDOMAdaptor: ToDOMAdaptor,
): HTMLSchemaMap {
  const htmlSchemaMap: HTMLSchemaMap = { nodes: {}, marks: {} };

  (['htmlBlock', 'htmlInline'] as const).forEach((htmlType) => {
    if (convertorMap[htmlType]) {
      Object.keys(convertorMap[htmlType]!).forEach((type) => {
        // register tag white list for preventing to remove the html in sanitizer
        registerTagWhitelistIfPossible(type);

        if (htmlType === 'htmlBlock') {
          // Block level HTML elements -> nodes
          htmlSchemaMap.nodes[type] = schemaFactory.htmlBlock(type, sanitizeHTML, wwToDOMAdaptor);
        } else if (isInlineAtomTag(type)) {
          // Inline atom tags (source, track, etc.) -> nodes (not marks)
          // These are inline and don't wrap text content
          htmlSchemaMap.nodes[type] = schemaFactory.htmlInlineNode(
            type,
            sanitizeHTML,
            wwToDOMAdaptor,
          );
        } else {
          // Regular inline HTML elements -> marks
          htmlSchemaMap.marks[type] = schemaFactory.htmlInline(type, sanitizeHTML, wwToDOMAdaptor);
        }
      });
    }
  });

  return htmlSchemaMap;
}
