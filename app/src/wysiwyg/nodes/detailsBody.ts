import { DOMOutputSpec } from 'prosemirror-model';

import NodeSchema from '@/spec/node';

export class DetailsBody extends NodeSchema {
  get name() {
    return 'detailsBody';
  }

  get schema() {
    return {
      content: 'block+',
      defining: true,
      parseDOM: [
        { tag: 'div.toastui-editor-block-quote-body', priority: 100 },
        { tag: 'blockquote.toastui-editor-block-quote-body', priority: 100 },
        { tag: 'details[data-detail-summary-type] blockquote', priority: 100 },
        { tag: 'details[data-block-quote-details="true"] blockquote', priority: 100 },
      ],
      toDOM(): DOMOutputSpec {
        return ['div', { class: 'toastui-editor-block-quote-body' }, 0];
      },
    };
  }
}