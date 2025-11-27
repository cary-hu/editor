import { EditorView, NodeView } from 'prosemirror-view';
import { ProsemirrorNode, Slice, Fragment, Mark, Schema } from 'prosemirror-model';
import isNumber from 'tui-code-snippet/type/isNumber';
import toArray from 'tui-code-snippet/collection/toArray';

import EditorBase from '@/base';
import { getWwCommands } from '@/commands/wwCommands';

import { createParagraph, createTextSelection } from '@/helper/manipulation';
import { emitImageBlobHook, pasteImageOnly } from '@/helper/image';

import { tableSelection } from './plugins/selection/tableSelection';
import { tableContextMenu } from './plugins/tableContextMenu';
import { tableEditPanel } from './plugins/tableEditPanel';
import { imageEditPanel } from './plugins/imageEditPanel';
import { linkEditPanel } from './plugins/linkEditPanel';
import { task } from './plugins/task';
import { toolbarStateHighlight } from './plugins/toolbarState';

import { CustomBlockView } from './nodeview/customBlockView';
import { ImageView } from './nodeview/imageView';
import { CodeBlockView } from './nodeview/codeBlockView';
import { BlockQuoteView } from './nodeview/blockQuoteView';

import { changePastedHTML, changePastedSlice } from './clipboard/paste';
import { pasteToTable } from './clipboard/pasteToTable';
import { createSpecs } from './specCreator';

import { Emitter } from '@t/event';
import { ToDOMAdaptor } from '@t/convertor';
import { EditPanelOptions, HTMLSchemaMap, LinkAttributes, WidgetStyle } from '@t/editor';
import { NodeViewPropMap, PluginProp } from '@t/plugin';
import { createNodesWithWidget } from '@/widget/rules';
import { widgetNodeView } from '@/widget/widgetNode';
import { cls, removeProseMirrorHackNodes } from '@/utils/dom';
import { includes } from '@/utils/common';
import { isInTableNode } from '@/wysiwyg/helper/node';

interface WindowWithClipboard extends Window {
  clipboardData?: DataTransfer | null;
}

interface WysiwygOptions {
  toDOMAdaptor: ToDOMAdaptor;
  useCommandShortcut?: boolean;
  editPanel?: EditPanelOptions;
  htmlSchemaMap?: HTMLSchemaMap;
  linkAttributes?: LinkAttributes | null;
  wwPlugins?: PluginProp[];
  wwNodeViews?: NodeViewPropMap;
}

type PluginNodeVeiwFn = (node: ProsemirrorNode, view: EditorView, getPos: () => number) => NodeView;

interface PluginNodeViews {
  [k: string]: PluginNodeVeiwFn;
}

const CONTENTS_CLASS_NAME = cls('contents');

interface LineInfo {
  line: number;
  start: number;
}

export default class WysiwygEditor extends EditorBase {
  private toDOMAdaptor: ToDOMAdaptor;

  private linkAttributes: LinkAttributes;

  private pluginNodeViews: NodeViewPropMap;

  private editPanelOptions: EditPanelOptions;

  constructor(eventEmitter: Emitter, options: WysiwygOptions) {
    super(eventEmitter);

    const {
      toDOMAdaptor,
      htmlSchemaMap = {} as HTMLSchemaMap,
      linkAttributes = {},
      useCommandShortcut = true,
      wwPlugins = [],
      wwNodeViews = {},
      editPanel,
    } = options;

    this.editPanelOptions = editPanel!;
    this.editorType = 'wysiwyg';
    this.el.classList.add('ww-mode');
    this.toDOMAdaptor = toDOMAdaptor;
    this.linkAttributes = linkAttributes!;
    this.extraPlugins = wwPlugins;
    this.pluginNodeViews = wwNodeViews;
    this.specs = this.createSpecs();
    this.schema = this.createSchema(htmlSchemaMap);
    this.context = this.createContext();
    this.keymaps = this.createKeymaps(useCommandShortcut);
    this.view = this.createView();
    this.commands = this.createCommands();
    this.specs.setContext({ ...this.context, view: this.view });
    this.initEvent();
  }

  createSpecs() {
    return createSpecs(this.linkAttributes);
  }

  createContext() {
    return {
      schema: this.schema,
      eventEmitter: this.eventEmitter,
    };
  }

  createSchema(htmlSchemaMap?: HTMLSchemaMap) {
    return new Schema({
      nodes: { ...this.specs.nodes, ...htmlSchemaMap!.nodes },
      marks: { ...this.specs.marks, ...htmlSchemaMap!.marks },
    });
  }

  createPlugins() {
    const editPanelPlugins = []
    if (this.editPanelOptions.useImageEditPanel) {
      editPanelPlugins.push(imageEditPanel(this.eventEmitter));
    }
    if (this.editPanelOptions.useLinkEditPanel) {
      editPanelPlugins.push(linkEditPanel(this.eventEmitter));
    }
    if (this.editPanelOptions.useTableEditPanel) {
      editPanelPlugins.push(tableEditPanel(this.eventEmitter));
    }
    return [
      tableSelection(),
      tableContextMenu(this.eventEmitter),
      task(),
      toolbarStateHighlight(this.eventEmitter),
      ...this.createPluginProps(),
    ]
      .concat(editPanelPlugins)
      .concat(this.defaultPlugins);
  }

  createPluginNodeViews() {
    const { eventEmitter, pluginNodeViews } = this;
    const pluginNodeViewMap: PluginNodeViews = {};

    if (pluginNodeViews) {
      Object.keys(pluginNodeViews).forEach((key) => {
        pluginNodeViewMap[key] = (node, view, getPos) =>
          pluginNodeViews[key](node, view, getPos, eventEmitter);
      });
    }

    return pluginNodeViewMap;
  }

  createView() {
    const { toDOMAdaptor, eventEmitter } = this;

    return new EditorView(this.el, {
      state: this.createState(),
      attributes: {
        class: CONTENTS_CLASS_NAME,
      },
      nodeViews: {
        customBlock(node, view, getPos) {
          return new CustomBlockView(node, view, getPos as (() => number) | boolean, toDOMAdaptor);
        },
        image(node, view, getPos) {
          return new ImageView(node, view, getPos as (() => number) | boolean, eventEmitter);
        },
        codeBlock(node, view, getPos) {
          return new CodeBlockView(node, view, getPos as (() => number) | boolean, eventEmitter);
        },
        blockQuote(node, view, getPos) {
          return new BlockQuoteView(node, view, getPos as (() => number) | boolean, eventEmitter);
        },
        widget: widgetNodeView,
        ...this.createPluginNodeViews(),
      },
      dispatchTransaction: (tr) => {
        const { state } = this.view.state.applyTransaction(tr);

        this.view.updateState(state);
        this.emitChangeEvent(tr.scrollIntoView());
        this.eventEmitter.emit('setFocusedNode', state.selection.$from.node(1));
      },
      transformPastedHTML: changePastedHTML,
      transformPasted: (slice: Slice) =>
        changePastedSlice(slice, this.schema, isInTableNode(this.view.state.selection.$from)),
      handlePaste: (view: EditorView, _: ClipboardEvent, slice: Slice) => pasteToTable(view, slice),
      handleKeyDown: (_, ev) => {
        this.eventEmitter.emit('keydown', this.editorType, ev);
        return false;
      },
      handleDOMEvents: {
        paste: (_, ev) => {
          const clipboardData =
            (ev as ClipboardEvent).clipboardData || (window as WindowWithClipboard).clipboardData;
          const items = clipboardData?.items;

          if (items) {
            const containRtfItem = toArray(items).some(
              (item) => item.kind === 'string' && item.type === 'text/rtf'
            );

            // if it contains rtf, it's most likely copy paste from office -> no image
            if (!containRtfItem) {
              const imageBlob = pasteImageOnly(items);

              if (imageBlob) {
                ev.preventDefault();

                emitImageBlobHook(this.eventEmitter, imageBlob, ev.type);
              }
            }
          }
          return false;
        },
        keyup: (_, ev: KeyboardEvent) => {
          this.eventEmitter.emit('keyup', this.editorType, ev);
          return false;
        },
        scroll: () => {
          this.eventEmitter.emit('scroll', 'editor');
          return true;
        },
      },
    });
  }

  createCommands() {
    return this.specs.commands(this.view, getWwCommands());
  }

  getHTML() {
    return removeProseMirrorHackNodes(this.view.dom.innerHTML);
  }

  getModel() {
    return this.view.state.doc;
  }

  getSelection(): [number, number] {
    const { from, to } = this.view.state.selection;

    return [from, to];
  }

  getSchema() {
    return this.view.state.schema;
  }

  replaceSelection(text: string, start?: number, end?: number) {
    const { schema, tr } = this.view.state;
    const lineTexts = text.split('\n');
    const paras = lineTexts.map((lineText) =>
      createParagraph(schema, createNodesWithWidget(lineText, schema))
    );
    const slice = new Slice(Fragment.from(paras), 1, 1);
    const newTr =
      isNumber(start) && isNumber(end)
        ? tr.replaceRange(start, end, slice)
        : tr.replaceSelection(slice);

    this.view.dispatch(newTr);
    this.focus();
  }

  deleteSelection(start?: number, end?: number) {
    const { tr } = this.view.state;
    const newTr =
      isNumber(start) && isNumber(end) ? tr.deleteRange(start, end) : tr.deleteSelection();

    this.view.dispatch(newTr.scrollIntoView());
  }

  getSelectedText(start?: number, end?: number) {
    const { doc, selection } = this.view.state;
    let { from, to } = selection;

    if (isNumber(start) && isNumber(end)) {
      from = start;
      to = end;
    }
    return doc.textBetween(from, to, '\n');
  }

  setModel(newDoc: ProsemirrorNode | [], cursorToEnd = false) {
    const { tr, doc } = this.view.state;

    this.view.dispatch(tr.replaceWith(0, doc.content.size, newDoc));

    if (cursorToEnd) {
      this.moveCursorToEnd(true);
    }
  }

  setSelection(start: number, end = start) {
    const { tr } = this.view.state;
    const selection = createTextSelection(tr, start, end);

    this.view.dispatch(tr.setSelection(selection).scrollIntoView());
  }

  moveCursorTo(line: number, focus = true) {
    let targetPos = -1;

    this.iterateLines((info) => {
      if (info.line === line) {
        targetPos = info.start;
        return true;
      }

      return false;
    });

    if (targetPos >= 0) {
      this.setSelection(targetPos, targetPos);
      if (focus) {
        this.focus();
      }
    }
  }

  getCursorLine() {
    const targetPos = this.view.state.selection.from;
    let resolvedLine = 1;

    this.iterateLines((info) => {
      if (targetPos < info.start) {
        return true;
      }

      resolvedLine = info.line;

      if (targetPos === info.start) {
        return true;
      }

      return false;
    });

    return resolvedLine;
  }

  addWidget(node: Node, style: WidgetStyle, pos?: number) {
    const { dispatch, state } = this.view;

    dispatch(state.tr.setMeta('widget', { pos: pos ?? state.selection.to, node, style }));
  }

  replaceWithWidget(start: number, end: number, text: string) {
    const { tr, schema } = this.view.state;
    const nodes = createNodesWithWidget(text, schema);

    this.view.dispatch(tr.replaceWith(start, end, nodes));
  }

  private iterateLines(visitor: (info: LineInfo) => boolean) {
    const { doc } = this.view.state;
    let currentLine = 0;

    const traverse = (node: ProsemirrorNode, pos: number): boolean => {
      const nodeName = node.type.name;

      if (nodeName === 'tableRow') {
        currentLine += 1;
        const start = node.childCount > 0 ? pos + 1 : pos;

        return visitor({ line: currentLine, start });
      }

      if (nodeName === 'codeBlock') {
        const text = node.textContent;
        const lines = text.split('\n');
        let textOffset = 0;

        for (let i = 0; i < lines.length; i += 1) {
          const start = pos + textOffset;
          currentLine += 1;

          if (visitor({ line: currentLine, start })) {
            return true;
          }

          textOffset += lines[i].length + 1;
        }

        return false;
      }

      if (node.isTextblock) {
        currentLine += 1;
        return visitor({ line: currentLine, start: pos });
      }

      if (node.childCount > 0) {
        let childPos = pos + 1;

        for (let i = 0; i < node.childCount; i += 1) {
          const child = node.child(i);

          if (traverse(child, childPos)) {
            return true;
          }

          childPos += child.nodeSize;
        }
      }

      return false;
    };

    traverse(doc, 0);
  }

  getRangeInfoOfNode(pos?: number) {
    const { doc, selection } = this.view.state;
    const $pos = pos ? doc.resolve(pos) : selection.$from;
    const marks = $pos.marks();
    const node = $pos.node();
    let start = $pos.start();
    let end = $pos.end();
    let type = node.type.name;

    if (marks.length || type === 'paragraph') {
      const mark = marks[marks.length - 1];
      const maybeHasMark = (nodeMarks: Mark[]) =>
        nodeMarks.length ? includes(nodeMarks, mark) : true;

      type = mark ? mark.type.name : 'text';

      node.forEach((child, offset) => {
        const { isText, nodeSize, marks: nodeMarks } = child;
        const startOffset = $pos.pos - start;

        if (
          isText &&
          offset <= startOffset &&
          offset + nodeSize >= startOffset &&
          maybeHasMark(nodeMarks as Mark[])
        ) {
          start = start + offset;
          end = start + nodeSize;
        }
      });
    }
    return { range: [start, end] as [number, number], type };
  }
}
