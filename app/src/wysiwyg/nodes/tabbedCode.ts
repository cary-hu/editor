import { DOMOutputSpec } from 'prosemirror-model';

import NodeSchema from '@/spec/node';

import { EditorCommand } from '@t/spec';

export class TabbedCode extends NodeSchema {
  get name() {
    return 'tabbedCode';
  }

  get schema() {
    return {
      content: 'codeBlock+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'div.toastui-editor-code-group' }],
      toDOM(): DOMOutputSpec {
        return ['div', { class: 'toastui-editor-code-group' }, 0];
      },
    };
  }

  commands(): EditorCommand {
    return () =>
      ({ schema, tr }, dispatch) => {
        const { tabbedCode, codeBlock } = schema.nodes;
        const firstCodeBlock = codeBlock.create({ language: 'js', label: 'JavaScript' });
        const secondCodeBlock = codeBlock.create({ language: 'ts', label: 'TypeScript' });

        tr.replaceSelectionWith(tabbedCode.create(null, [firstCodeBlock, secondCodeBlock]));
        dispatch!(tr);

        return true;
      };
  }
}
