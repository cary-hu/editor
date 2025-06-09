import { DOMOutputSpec, ProsemirrorNode } from 'prosemirror-model';
import { wrapIn } from 'prosemirror-commands';

import NodeSchema from '@/spec/node';
import {
  createDOMInfoParsedRawHTML,
  getCustomAttrs,
  getDefaultCustomAttrs,
} from '@/wysiwyg/helper/node';

import { EditorCommand } from '@t/spec';

export class BlockQuote extends NodeSchema {
  get name() {
    return 'blockQuote';
  }

  get schema() {
    return {
      attrs: {
        bqType: { default: 'default' },
        rawHTML: { default: null },
        ...getDefaultCustomAttrs(),
      },
      content: 'block+',
      group: 'block',
      parseDOM: [createDOMInfoParsedRawHTML('blockquote')],
      toDOM({ attrs }: ProsemirrorNode): DOMOutputSpec {
        const customAttrs = getCustomAttrs(attrs);
        const domAttrs = {
          ...customAttrs,
          'data-block-quote-type': attrs.bqType || 'default',
        };

        return ['blockquote', domAttrs, 0];
      },
    };
  }

  commands(): EditorCommand {
    return () => (state, dispatch) => wrapIn(state.schema.nodes.blockQuote)(state, dispatch);
  }

  keymaps() {
    const blockQutoeCommand = this.commands()();

    return {
      'Alt-q': blockQutoeCommand,
      'Alt-Q': blockQutoeCommand,
    };
  }
}
