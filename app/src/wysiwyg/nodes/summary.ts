import { DOMOutputSpec } from 'prosemirror-model';

import NodeSchema from '@/spec/node';

export class Summary extends NodeSchema {
  get name() {
    return 'summary';
  }

  get schema() {
    return {
      content: 'inline*',
      defining: true,
      parseDOM: [{ tag: 'summary.toastui-editor-block-quote-summary' }, { tag: 'summary' }],
      toDOM(): DOMOutputSpec {
        return [
          'summary',
          { class: 'toastui-editor-block-quote-summary' },
          ['span', { class: 'toastui-editor-block-quote-summary-marker', contenteditable: 'false' }],
          ['span', { class: 'toastui-editor-block-quote-summary-text' }, 0],
        ];
      },
    };
  }
}