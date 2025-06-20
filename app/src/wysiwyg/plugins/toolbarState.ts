import { Node, ResolvedPos, Schema } from 'prosemirror-model';
import { Plugin, Selection } from 'prosemirror-state';

import { includes } from '@/utils/common';

import { ToolbarStateMap, ToolbarStateKeys } from '@t/ui';
import { Emitter } from '@t/event';

type ListType = 'bulletList' | 'orderedList' | 'taskList';

const EXCEPT_TYPES = ['image', 'link', 'customBlock', 'frontMatter'];
const MARK_TYPES = ['strong', 'strike', 'emph', 'code'];
const LIST_TYPES: ListType[] = ['bulletList', 'orderedList', 'taskList'];

function getToolbarStateType(node: Node, parentNode: Node) {
  const type = node.type.name;

  if (type === 'listItem') {
    return node.attrs.task ? 'taskList' : parentNode.type.name;
  }

  if (type.indexOf('table') !== -1) {
    return 'table';
  }

  return type;
}

function setListNodeToolbarState(type: ToolbarStateKeys, nodeTypeState: ToolbarStateMap) {
  nodeTypeState[type] = { active: true };

  LIST_TYPES.filter((listName) => listName !== type).forEach((listType) => {
    if (nodeTypeState[listType]) {
      delete nodeTypeState[listType];
    }
  });
}

function setMarkTypeStates(
  from: ResolvedPos,
  to: ResolvedPos,
  schema: Schema,
  toolbarState: ToolbarStateMap
) {
  MARK_TYPES.forEach((type) => {
    const mark = schema.marks[type];
    const marksAtPos = from.marksAcross(to) || [];
    const foundMark = !!mark.isInSet(marksAtPos);

    if (foundMark) {
      toolbarState[type as ToolbarStateKeys] = { active: true };
    }
  });
}

function getToolbarState(selection: Selection, doc: Node, schema: Schema) {
  const { $from, $to, from, to } = selection;
  const toolbarState = {
    indent: { active: false, disabled: true },
    outdent: { active: false, disabled: true },
  } as ToolbarStateMap;

  // Check if we're inside a blockquote and get the current type
  const blockQuoteNode = schema.nodes.blockQuote;
  let insideBlockQuote = false;
  let currentBqType = '';

  if (blockQuoteNode) {
    for (let d = $from.depth; d >= 0; d -= 1) {
      if ($from.node(d).type === blockQuoteNode) {
        insideBlockQuote = true;
        currentBqType = $from.node(d).attrs.bqType || '';
        break;
      }
    }
  }

  // Check if we're in a code block, table, or have inline code mark - if so, disable blockquote
  let blockQuoteDisabled = false;
  // Track if we're inside a table to disable certain toolbar items
  let insideTable = false;
  // Track if we're inside a list to disable certain toolbar items
  let insideList = false;

  // Check for code blocks, tables, and lists: look for nodes with code: true in schema, codeBlock type, table-related types, or list types
  for (let d = $from.depth; d >= 0; d -= 1) {
    const node = $from.node(d);

    // Disable blockquote in code blocks
    if (
      node.type.spec.code === true ||
      node.type.name === 'codeBlock'
    ) {
      blockQuoteDisabled = true;
    }
    // Disable blockquote in table nodes and track table context
    if (
      node.type.name === 'table' ||
      node.type.name === 'tableHead' ||
      node.type.name === 'tableBody' ||
      node.type.name === 'tableRow' ||
      node.type.name === 'tableHeadCell' ||
      node.type.name === 'tableBodyCell') {
      blockQuoteDisabled = true;
      insideTable = true;
    }
    // Track if we're inside a list
    if (
      node.type.name === 'bulletList' ||
      node.type.name === 'orderedList' ||
      node.type.name === 'taskList' ||
      node.type.name === 'listItem'
    ) {
      insideList = true;
    }
  }

  // Check for inline code mark
  if (!blockQuoteDisabled) {
    const codeMarkType = schema.marks.code;

    if (codeMarkType && codeMarkType.isInSet($from.marks())) {
      blockQuoteDisabled = true;
    }
  }

  doc.nodesBetween(from, to, (node, _, parentNode) => {
    const type = getToolbarStateType(node, parentNode!);

    if (includes(EXCEPT_TYPES, type)) {
      return;
    }

    if (includes(LIST_TYPES, type)) {
      setListNodeToolbarState(type as ToolbarStateKeys, toolbarState);

      toolbarState.indent.disabled = false;
      toolbarState.outdent.disabled = false;
    } else if (type === 'paragraph' || type === 'text') {
      setMarkTypeStates($from, $to, schema, toolbarState);
    } else {
      toolbarState[type as ToolbarStateKeys] = { active: true };
    }
  });

  // Set blockquote state based on whether we're inside one and code context
  if (blockQuoteNode) {
    toolbarState.blockQuote = {
      active: insideBlockQuote,
      disabled: blockQuoteDisabled,
      bqType: currentBqType,
    };
  }

  // Disable specific toolbar items when inside a table
  if (insideTable) {
    // Disable heading, table, hrline, and codeblock
    const disableKeys: ToolbarStateKeys[] = ['heading', 'table', 'thematicBreak', 'codeBlock'];
    disableKeys.forEach((key) => {
      if (toolbarState[key]) {
        toolbarState[key] = { ...toolbarState[key], disabled: true };
      } else {
        toolbarState[key] = { active: false, disabled: true };
      }
    });
  }

  // Disable specific toolbar items when inside a list
  if (insideList) {
    // Disable heading, table, and codeblock
    const disableKeys: ToolbarStateKeys[] = ['heading', 'table', 'codeBlock', 'thematicBreak'];
    disableKeys.forEach((key) => {
      if (toolbarState[key]) {
        toolbarState[key] = { ...toolbarState[key], disabled: true };
      } else {
        toolbarState[key] = { active: false, disabled: true };
      }
    });
  }

  return toolbarState;
}

export function toolbarStateHighlight(eventEmitter: Emitter) {
  return new Plugin({
    view() {
      return {
        update(view) {
          const { selection, doc, schema } = view.state;

          eventEmitter.emit('changeToolbarState', {
            toolbarState: getToolbarState(selection, doc, schema),
          });
        },
      };
    },
  });
}

export { getToolbarState };
