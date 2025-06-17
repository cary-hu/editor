import { Mark as ProsemirrorMark, DOMOutputSpec } from 'prosemirror-model';
import { toggleMark } from 'prosemirror-commands';

import Mark from '@/spec/mark';
import { escapeXml } from '@/utils/common';
import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';
import { createTextNode } from '@/helper/manipulation';
import { getCustomAttrs, getDefaultCustomAttrs } from '@/wysiwyg/helper/node';

import { EditorCommand } from '@t/spec';
import { LinkAttributes } from '@t/editor';

export class Link extends Mark {
  private linkAttributes: LinkAttributes;

  constructor(linkAttributes: LinkAttributes) {
    super();
    this.linkAttributes = linkAttributes;
  }

  get name() {
    return 'link';
  }

  get schema() {
    return {
      attrs: {
        linkUrl: { default: '' },
        title: { default: null },
        target: { default: null },
        rel: { default: null },
        rawHTML: { default: null },
        ...getDefaultCustomAttrs(),
      },
      inclusive: false,
      parseDOM: [
        {
          tag: 'a[href]',
          getAttrs(dom: Node | string) {
            const sanitizedDOM = sanitizeHTML<DocumentFragment>(dom, { RETURN_DOM_FRAGMENT: true })
              .firstChild as HTMLElement;
            const href = sanitizedDOM.getAttribute('href') || '';
            const title = sanitizedDOM.getAttribute('title') || '';
            const target = sanitizedDOM.getAttribute('target') || null;
            const rel = sanitizedDOM.getAttribute('rel') || null;
            const rawHTML = sanitizedDOM.getAttribute('data-raw-html');

            return {
              linkUrl: href,
              title,
              target,
              rel,
              ...(rawHTML && { rawHTML }),
            };
          },
        },
      ],
      toDOM: ({ attrs }: ProsemirrorMark): DOMOutputSpec => [
        attrs.rawHTML || 'a',
        {
          href: attrs.linkUrl,
          ...(attrs.title && { title: attrs.title }),
          ...(attrs.target && { target: attrs.target }),
          ...(attrs.rel && { rel: attrs.rel }),
          ...this.linkAttributes,
          ...getCustomAttrs(attrs),
        },
      ],
    };
  }

  private addLink(): EditorCommand {
    return (payload) => (state, dispatch) => {
      const { linkUrl, linkText = '', target, rel } = payload!;
      const { schema, tr, selection } = state;
      const { empty, from, to } = selection;

      if (from && to && linkUrl) {
        const attrs: any = { linkUrl };
        
        if (target) attrs.target = target;
        if (rel) attrs.rel = rel;
        
        const mark = schema.mark('link', attrs);

        if (empty && linkText) {
          const node = createTextNode(schema, linkText, mark);

          tr.replaceRangeWith(from, to, node);
        } else {
          tr.addMark(from, to, mark);
        }

        dispatch!(tr.scrollIntoView());

        return true;
      }

      return false;
    };
  }

  private toggleLink(): EditorCommand {
    return (payload) => (state, dispatch) =>
      toggleMark(state.schema.marks.link, payload)(state, dispatch);
  }

  commands() {
    return {
      addLink: this.addLink(),
      toggleLink: this.toggleLink(),
    };
  }
}
