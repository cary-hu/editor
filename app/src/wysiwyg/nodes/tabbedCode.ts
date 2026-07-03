import { DOMOutputSpec, ResolvedPos } from 'prosemirror-model';
import { Command } from 'prosemirror-commands';

import { addParagraph, createTextSelection } from '@/helper/manipulation';
import NodeSchema from '@/spec/node';

import { EditorCommand } from '@t/spec';

function findTabbedCode($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const node = $pos.node(depth);

    if (node.type.name === 'tabbedCode') {
      return { node, pos: $pos.before(depth) };
    }
  }

  return null;
}

function isInCodeBlock($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'codeBlock') {
      return true;
    }
  }

  return false;
}

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

  moveCursorAfterTabbedCode(): Command {
    return (state, dispatch, view) => {
      const { doc, schema, selection, tr } = state;
      const editorView = view || this.context.view;
      const tabbedCodeInfo = findTabbedCode(selection.$from);

      if (
        !editorView ||
        !selection.empty ||
        !tabbedCodeInfo ||
        !isInCodeBlock(selection.$from) ||
        !editorView.endOfTextblock('down')
      ) {
        return false;
      }

      const tabbedCodeEndPos = tabbedCodeInfo.pos + tabbedCodeInfo.node.nodeSize;
      const $tabbedCodeEnd = doc.resolve(tabbedCodeEndPos);

      if (dispatch) {
        if ($tabbedCodeEnd.nodeAfter) {
          dispatch(tr.setSelection(createTextSelection(tr, tabbedCodeEndPos + 1)).scrollIntoView());
        } else {
          dispatch(addParagraph(tr, $tabbedCodeEnd, schema).scrollIntoView());
        }
      }

      return true;
    };
  }

  keymaps() {
    return {
      ArrowDown: this.moveCursorAfterTabbedCode(),
    };
  }
}
