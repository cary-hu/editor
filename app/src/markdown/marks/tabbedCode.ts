import { DOMOutputSpec } from 'prosemirror-model';
import { EditorCommand, MdSpecContext } from '@t/spec';

import Mark from '@/spec/mark';
import { createParagraph, createTextSelection } from '@/helper/manipulation';
import { clsWithMdPrefix } from '@/utils/dom';
import { resolveSelectionPos } from '../helper/pos';

const tabbedCodeSyntax = [
  '::: code-group',
  '```js [JavaScript]',
  '',
  '```',
  '```ts [TypeScript]',
  '',
  '```',
  ':::',
].join('\n');
const firstCodeContentLineIndex = 2;

export class TabbedCode extends Mark {
  context!: MdSpecContext;

  get name() {
    return 'tabbedCode';
  }

  get schema() {
    return {
      toDOM(): DOMOutputSpec {
        return ['span', { class: clsWithMdPrefix('tabbed-code') }, 0];
      },
    };
  }

  commands(): EditorCommand {
    return () =>
      ({ tr, selection, schema }, dispatch) => {
        const [from, to] = resolveSelectionPos(selection);
        const $from = tr.doc.resolve(from);
        const $to = tr.doc.resolve(to);
        const startOffset = $from.before(1);
        const endOffset = $to.after(1);
        const lines = tabbedCodeSyntax.split('\n');
        const nodes = lines.map((line) => createParagraph(schema, line));

        tr.replaceWith(startOffset, endOffset, nodes).setSelection(
          createTextSelection(
            tr,
            startOffset +
              nodes
                .slice(0, firstCodeContentLineIndex)
                .reduce((pos, node) => pos + node.nodeSize, 0) +
              1,
          ),
        );
        dispatch!(tr);

        return true;
      };
  }
}
