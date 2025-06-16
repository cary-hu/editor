import { Node, DOMOutputSpec, Fragment, ProsemirrorNode } from 'prosemirror-model';
import { TextSelection, Transaction, Selection } from 'prosemirror-state';
import { Command } from 'prosemirror-commands';

import NodeSchema from '@/spec/node';
import {
  isInTableNode,
  findNodeBy,
  createDOMInfoParsedRawHTML,
  getCustomAttrs,
  getDefaultCustomAttrs,
} from '@/wysiwyg/helper/node';

import {
  createTableHeadRow,
  createTableBodyRows,
  createDummyCells,
  getResolvedSelection,
  getRowAndColumnCount,
  setAttrs,
} from '@/wysiwyg/helper/table';
import {
  canBeOutOfTable,
  canMoveBetweenCells,
  canSelectTableNode,
  selectNode,
  addParagraphBeforeTable,
  addParagraphAfterTable,
  moveToCell,
} from '@/wysiwyg/command/table';

import { createTextSelection } from '@/helper/manipulation';

import { EditorCommand } from '@t/spec';
import { ColumnAlign } from '@t/wysiwyg';
import { SelectionInfo, TableOffsetMap } from '@/wysiwyg/helper/tableOffsetMap';
import { EditorView } from 'prosemirror-view';

interface AddTablePayload {
  rowCount: number;
  columnCount: number;
  data: string[];
}

interface AlignColumnPayload {
  align: ColumnAlign;
}

// eslint-disable-next-line no-shadow
export const enum Direction {
  LEFT = 'left',
  RIGHT = 'right',
  UP = 'up',
  DOWN = 'down',
}
interface RangeInfo {
  startNode: ProsemirrorNode;
  startPos: number;
  rowCount: number;
  columnCount: number;
}
function getTargetColInfo(
  direction: ColDirection,
  map: TableOffsetMap,
  selectionInfo: SelectionInfo
) {
  let targetColIdx: number;
  let judgeToExtendColspan: (rowIdx: number) => boolean;
  let insertColIdx: number;

  if (direction === Direction.LEFT) {
    targetColIdx = selectionInfo.startColIdx;
    judgeToExtendColspan = (rowIdx: number) => map.extendedColSpan(rowIdx, targetColIdx);
    insertColIdx = targetColIdx;
  } else {
    targetColIdx = selectionInfo.endColIdx;
    judgeToExtendColspan = (rowIdx: number) => map.getColspanCount(rowIdx, targetColIdx) > 1;
    insertColIdx = targetColIdx + 1;
  }

  return { targetColIdx, judgeToExtendColspan, insertColIdx };
}
function setCellSelection(
  view: EditorView,
  selection: Selection,
  tableStartPos: number,
  selectionInfo: SelectionInfo
) {
  // @ts-ignore
  // judge cell selection
  if (selection.isCellSelection) {
    const { tr } = view.state;
    const CellSelection = Object.getPrototypeOf(selection).constructor;
    const { startRowIdx, startColIdx, endRowIdx, endColIdx } = selectionInfo;

    // get changed cell offsets
    const map = TableOffsetMap.create(tr.doc.resolve(tableStartPos))!;
    const { offset: startOffset } = map.getCellInfo(startRowIdx, startColIdx);
    const { offset: endOffset } = map.getCellInfo(endRowIdx, endColIdx);

    tr.setSelection(new CellSelection(tr.doc.resolve(startOffset), tr.doc.resolve(endOffset)));
    view.dispatch(tr);
  }
}

function judgeInsertToNextRow(
  map: TableOffsetMap,
  mappedPos: number,
  rowIdx: number,
  colIdx: number
) {
  const { totalColumnCount } = map;

  return (
    map.extendedRowSpan(rowIdx, colIdx) &&
    map.extendedRowSpan(rowIdx, totalColumnCount - 1) &&
    mappedPos === map.posAt(rowIdx, totalColumnCount - 1)
  );
}

function getColspanEndIdx(rowIdx: number, colIdx: number, map: TableOffsetMap) {
  let endColIdx = colIdx;

  if (!map.extendedRowSpan(rowIdx, colIdx) && map.extendedColSpan(rowIdx, colIdx)) {
    const { startSpanIdx, count } = map.getColspanStartInfo(rowIdx, colIdx)!;

    endColIdx = startSpanIdx + count;
  }
  return endColIdx;
}
type ColDirection = Direction.LEFT | Direction.RIGHT;
type RowDirection = Direction.UP | Direction.DOWN;
function setSpanToRootCell(tr: Transaction, fragment: Fragment, rangeInfo: RangeInfo) {
  const { startNode, startPos, rowCount, columnCount } = rangeInfo;

  tr.setNodeMarkup(
    startPos,
    null,
    setAttrs(startNode, { colspan: columnCount, rowspan: rowCount })
  );

  if (fragment.size) {
    // add 1 for text start offset(not node start offset)
    tr.replaceWith(startPos + 1, startPos + startNode.content.size, fragment);
  }
}
function appendFragment(rowIdx: number, colIdx: number, fragment: Fragment, map: TableOffsetMap) {
  const targetFragment = map.getNodeAndPos(rowIdx, colIdx).node.content;

  // prevent to add empty string
  return targetFragment.size > 2 ? fragment.append(targetFragment) : fragment;
}

function getTargetRowInfo(
  direction: RowDirection,
  map: TableOffsetMap,
  selectionInfo: SelectionInfo
) {
  let targetRowIdx: number;
  let judgeToExtendRowspan: (rowIdx: number) => boolean;
  let insertColIdx: number;
  let nodeSize: number;

  if (direction === Direction.UP) {
    targetRowIdx = selectionInfo.startRowIdx;
    judgeToExtendRowspan = (colIdx: number) => map.extendedRowSpan(targetRowIdx, colIdx);
    insertColIdx = 0;
    nodeSize = -1;
  } else {
    targetRowIdx = selectionInfo.endRowIdx;
    judgeToExtendRowspan = (colIdx: number) => map.getRowSpanCount(targetRowIdx, colIdx) > 1;
    insertColIdx = map.totalColumnCount - 1;
    nodeSize = !map.extendedRowSpan(targetRowIdx, insertColIdx)
      ? map.getCellInfo(targetRowIdx, insertColIdx).nodeSize + 1
      : 2;
  }
  return { targetRowIdx, judgeToExtendRowspan, insertColIdx, nodeSize };
}

function getRowRanges(map: TableOffsetMap, rowIdx: number) {
  const { totalColumnCount } = map;
  let from = Number.MAX_VALUE;
  let to = 0;

  for (let colIdx = 0; colIdx < totalColumnCount; colIdx += 1) {
    if (!map.extendedRowSpan(rowIdx, colIdx)) {
      const { offset, nodeSize } = map.getCellInfo(rowIdx, colIdx);

      from = Math.min(from, offset);
      to = Math.max(to, offset + nodeSize);
    }
  }
  return { from, to };
}


export class Table extends NodeSchema {
  get name() {
    return 'table';
  }

  get schema() {
    return {
      content: 'tableHead{1} tableBody{1}',
      group: 'block',
      attrs: {
        rawHTML: { default: null },
        ...getDefaultCustomAttrs(),
      },
      parseDOM: [createDOMInfoParsedRawHTML('table')],
      toDOM({ attrs }: ProsemirrorNode): DOMOutputSpec {
        return ['table', getCustomAttrs(attrs), 0];
      },
    };
  }

  private addTable(): EditorCommand<AddTablePayload> {
    return (payload = { rowCount: 2, columnCount: 1, data: [] }) => (state, dispatch) => {
      const { rowCount, columnCount, data } = payload;
      const { schema, selection, tr } = state;
      const { from, to, $from } = selection;
      const collapsed = from === to;

      if (collapsed && !isInTableNode($from)) {
        const { tableHead, tableBody } = schema.nodes;

        const theadData = data?.slice(0, columnCount);
        const tbodyData = data?.slice(columnCount, data.length);
        const tableHeadRow = createTableHeadRow(columnCount, schema, theadData);
        const tableBodyRows = createTableBodyRows(rowCount - 1, columnCount, schema, tbodyData);
        const table = schema.nodes.table.create(null, [
          tableHead.create(null, tableHeadRow),
          tableBody.create(null, tableBodyRows),
        ]);

        dispatch!(tr.replaceSelectionWith(table));

        return true;
      }

      return false;
    };
  }

  private removeTable(): EditorCommand {
    return () => (state, dispatch) => {
      const { selection, tr } = state;
      const map = TableOffsetMap.create(selection.$anchor)!;

      if (map) {
        const { tableStartOffset, tableEndOffset } = map;
        const startOffset = tableStartOffset - 1;
        const cursorPos = createTextSelection(tr.delete(startOffset, tableEndOffset), startOffset);

        dispatch!(tr.setSelection(cursorPos));
        return true;
      }
      return false;
    };
  }

  private addColumn(direction: ColDirection): EditorCommand {
    return () => (state, dispatch) => {
      const { selection, tr, schema } = state;
      const { anchor, head } = getResolvedSelection(selection);

      if (!anchor || !head) {
        return false;
      }

      const map = TableOffsetMap.create(anchor)!;
      const selectionInfo = map.getRectOffsets(anchor, head);

      const { targetColIdx, judgeToExtendColspan, insertColIdx } = getTargetColInfo(
        direction,
        map,
        selectionInfo
      );

      const { columnCount } = getRowAndColumnCount(selectionInfo);
      const { totalRowCount } = map;

      for (let rowIdx = 0; rowIdx < totalRowCount; rowIdx += 1) {
        // increase colspan count inside the col-spanning cell
        if (judgeToExtendColspan(rowIdx)) {
          const { node, pos } = map.getColspanStartInfo(rowIdx, targetColIdx)!;
          const attrs = setAttrs(node, { colspan: node.attrs.colspan + columnCount });

          tr.setNodeMarkup(tr.mapping.map(pos), null, attrs);
        } else {
          const cells = createDummyCells(columnCount, rowIdx, schema);

          tr.insert(tr.mapping.map(map.posAt(rowIdx, insertColIdx)), cells);
        }
      }
      dispatch!(tr);
      return true;
    };
  }

  private removeColumn(): EditorCommand {
    return () => (state, dispatch) => {
      const { selection, tr } = state;
      const { anchor, head } = getResolvedSelection(selection);

      if (!anchor || !head) {
        return false;
      }

      const map = TableOffsetMap.create(anchor)!;
      const selectionInfo = map.getRectOffsets(anchor, head);

      const { totalColumnCount, totalRowCount } = map;
      const { columnCount } = getRowAndColumnCount(selectionInfo);
      const selectedAllColumn = columnCount === totalColumnCount;

      if (selectedAllColumn) {
        return false;
      }

      const { startColIdx, endColIdx } = selectionInfo;
      const mapStart = tr.mapping.maps.length;

      for (let rowIdx = 0; rowIdx < totalRowCount; rowIdx += 1) {
        for (let colIdx = endColIdx; colIdx >= startColIdx; colIdx -= 1) {
          const { offset, nodeSize } = map.getCellInfo(rowIdx, colIdx);
          const colspanInfo = map.getColspanStartInfo(rowIdx, colIdx)!;

          if (!map.extendedRowSpan(rowIdx, colIdx)) {
            // decrease colspan count inside the col-spanning cell
            if (colspanInfo?.count > 1) {
              const { node, pos } = map.getColspanStartInfo(rowIdx, colIdx)!;
              const colspan = map.decreaseColspanCount(rowIdx, colIdx);
              const attrs = setAttrs(node, { colspan: colspan > 1 ? colspan : null });

              tr.setNodeMarkup(tr.mapping.slice(mapStart).map(pos), null, attrs);
            } else {
              const from = tr.mapping.slice(mapStart).map(offset);
              const to = from + nodeSize;

              tr.delete(from, to);
            }
          }
        }
      }
      dispatch!(tr);
      return true;
    };
  }

  private addRow(direction: Direction.UP | Direction.DOWN): EditorCommand {
    return () => (state, dispatch) => {
      const { selection, schema, tr } = state;
      const { anchor, head } = getResolvedSelection(selection);

      if (!anchor || !head) {
        return false;
      }

      const map = TableOffsetMap.create(anchor)!;
      const { totalColumnCount } = map;
      const selectionInfo = map.getRectOffsets(anchor, head);
      const { rowCount } = getRowAndColumnCount(selectionInfo);
      const { targetRowIdx, judgeToExtendRowspan, insertColIdx, nodeSize } = getTargetRowInfo(
        direction,
        map,
        selectionInfo
      );
      const selectedThead = targetRowIdx === 0;

      if (selectedThead) {
        return false;
      }

      const rows: Node[] = [];

      const from = tr.mapping.map(map.posAt(targetRowIdx, insertColIdx)) + nodeSize;
      let cells: Node[] = [];

      for (let colIdx = 0; colIdx < totalColumnCount; colIdx += 1) {
        // increase rowspan count inside the row-spanning cell
        if (judgeToExtendRowspan(colIdx)) {
          const { node, pos } = map.getRowSpanStartInfo(targetRowIdx, colIdx)!;
          const attrs = setAttrs(node, { rowspan: node.attrs.rowspan + rowCount });

          tr.setNodeMarkup(tr.mapping.map(pos), null, attrs);
        } else {
          cells = cells.concat(createDummyCells(1, targetRowIdx, schema));
        }
      }

      for (let i = 0; i < rowCount; i += 1) {
        rows.push(schema.nodes.tableRow.create(null, cells));
      }
      dispatch!(tr.insert(from, rows));
      return true;
    };
  }

  private removeRow(): EditorCommand {
    return () => (state, dispatch) => {
      const { selection, tr } = state;
      const { anchor, head } = getResolvedSelection(selection);

      if (anchor && head) {
        let map = TableOffsetMap.create(anchor)!;
        const { totalRowCount, totalColumnCount } = map;
        const selectionInfo = map.getRectOffsets(anchor, head);
        const { rowCount } = getRowAndColumnCount(selectionInfo);
        const { startRowIdx, endRowIdx } = selectionInfo;

        const selectedThead = startRowIdx === 0;
        const selectedAllTbodyRow = rowCount === totalRowCount - 1;

        if (selectedAllTbodyRow || selectedThead) {
          return false;
        }

        for (let rowIdx = endRowIdx; rowIdx >= startRowIdx; rowIdx -= 1) {
          const mapStart = tr.mapping.maps.length;
          const { from, to } = getRowRanges(map, rowIdx);

          // delete table row
          tr.delete(from - 1, to + 1);

          for (let colIdx = 0; colIdx < totalColumnCount; colIdx += 1) {
            const rowspanInfo = map.getRowSpanStartInfo(rowIdx, colIdx)!;

            if (rowspanInfo?.count > 1 && !map.extendedColSpan(rowIdx, colIdx)) {
              // decrease rowspan count inside the row-spanning cell
              // eslint-disable-next-line max-depth
              if (map.extendedRowSpan(rowIdx, colIdx)) {
                const { node, pos } = map.getRowSpanStartInfo(rowIdx, colIdx)!;
                const rowspan = map.decreaseRowSpanCount(rowIdx, colIdx);
                const attrs = setAttrs(node, { rowspan: rowspan > 1 ? rowspan : null });

                tr.setNodeMarkup(tr.mapping.slice(mapStart).map(pos), null, attrs);
                // the row-spanning cell should be moved down
              } else if (!map.extendedRowSpan(rowIdx, colIdx)) {
                const { node, count } = map.getRowSpanStartInfo(rowIdx, colIdx)!;
                const attrs = setAttrs(node, { rowspan: count > 2 ? count - 1 : null });
                const copiedCell = node.type.create(attrs, node.content);

                tr.insert(tr.mapping.slice(mapStart).map(map.posAt(rowIdx + 1, colIdx)), copiedCell);
              }
            }
          }
          map = TableOffsetMap.create(tr.doc.resolve(map.tableStartOffset))!;
        }
        dispatch!(tr);
        return true;
      }

      return false;
    };
  }

  private alignColumn(): EditorCommand<AlignColumnPayload> {
    return (payload = { align: 'center' }) => (state, dispatch) => {
      const { align } = payload;
      const { selection, tr } = state;
      const { anchor, head } = getResolvedSelection(selection);

      if (anchor && head) {
        const map = TableOffsetMap.create(anchor)!;
        const { totalRowCount } = map;
        const selectionInfo = map.getRectOffsets(anchor, head);
        const { startColIdx, endColIdx } = selectionInfo;

        for (let rowIdx = 0; rowIdx < totalRowCount; rowIdx += 1) {
          for (let colIdx = startColIdx; colIdx <= endColIdx; colIdx += 1) {
            if (!map.extendedRowSpan(rowIdx, colIdx) && !map.extendedColSpan(rowIdx, colIdx)) {
              const { node, pos } = map.getNodeAndPos(rowIdx, colIdx);
              const attrs = setAttrs(node, { align });

              tr.setNodeMarkup(pos, null, attrs);
            }
          }
        }
        dispatch!(tr);
        return true;
      }
      return false;
    };
  }

  private moveToCell(direction: Direction): Command {
    return (state, dispatch) => {
      const { selection, tr, schema } = state;
      const { anchor, head } = getResolvedSelection(selection);

      if (anchor && head) {
        const map = TableOffsetMap.create(anchor)!;
        const cellIndex = map.getCellIndex(anchor);
        let newTr: Transaction | null;

        // Check if we're in the last cell and pressing Tab (moving right)
        const [rowIdx, colIdx] = cellIndex;
        const isLastCell = rowIdx === map.totalRowCount - 1 && colIdx === map.totalColumnCount - 1;
        const isMovingRight = direction === Direction.RIGHT;

        if (isLastCell && isMovingRight) {
          // Add a new row and move to its first cell
          const { totalColumnCount } = map;
          const rows: ProsemirrorNode[] = [];
          let cells: ProsemirrorNode[] = [];

          // Create cells for the new row
          for (let colIdx = 0; colIdx < totalColumnCount; colIdx += 1) {
            cells = cells.concat(createDummyCells(1, map.totalRowCount, schema));
          }
          rows.push(schema.nodes.tableRow.create(null, cells));

          // Insert the new row at the end of the table
          const tableEndPos = map.tableEndOffset - 2; // Position before </tbody></table>
          const insertPos = tr.mapping.map(tableEndPos);
          const insertTr = tr.insert(insertPos, rows);

          // Move cursor to the first cell of the new row
          const newRowFirstCellOffset = insertPos + 3; // Position inside the first cell of new row
          newTr = insertTr.setSelection(Selection.near(insertTr.doc.resolve(newRowFirstCellOffset), 1));
        } else if (canBeOutOfTable(direction, map, cellIndex)) {
          // When there is no content before or after the table,
          // an empty line('paragraph') is created by pressing the arrow keys.
          newTr = addParagraphAfterTable(tr, map, schema);
        } else {
          newTr = moveToCell(direction, tr, cellIndex, map);
        }

        if (newTr) {
          dispatch!(newTr);
          return true;
        }
      }

      return false;
    };
  }

  private moveInCell(direction: Direction): Command {
    return (state, dispatch) => {
      const { selection, tr, doc, schema } = state;
      const { $from } = selection;
      const { view } = this.context;

      if (!view.endOfTextblock(direction)) {
        return false;
      }

      const cell = findNodeBy(
        $from,
        ({ type }) => type.name === 'tableHeadCell' || type.name === 'tableBodyCell'
      );

      if (cell) {
        const para = findNodeBy($from, ({ type }) => type.name === 'paragraph');
        const { depth: cellDepth } = cell;

        if (para && canMoveBetweenCells(direction, [cellDepth, para.depth], $from, doc)) {
          const { anchor } = getResolvedSelection(selection);
          const map = TableOffsetMap.create(anchor)!;
          const cellIndex = map.getCellIndex(anchor);

          let newTr;

          if (canSelectTableNode(direction, map, cellIndex)) {
            // When the cursor position is at the end of the cell,
            // the table is selected when the left / right arrow keys are pressed.
            newTr = selectNode(tr, $from, cellDepth);
          } else if (canBeOutOfTable(direction, map, cellIndex)) {
            // When there is no content before or after the table,
            // an empty line('paragraph') is created by pressing the arrow keys.
            if (direction === Direction.UP) {
              newTr = addParagraphBeforeTable(tr, map, schema);
            } else if (direction === Direction.DOWN) {
              newTr = addParagraphAfterTable(tr, map, schema);
            }
          } else {
            newTr = moveToCell(direction, tr, cellIndex, map);
          }

          if (newTr) {
            dispatch!(newTr);

            return true;
          }
        }
      }

      return false;
    };
  }

  private deleteCells(): Command {
    return (state, dispatch) => {
      const { schema, selection, tr } = state;
      const { anchor, head } = getResolvedSelection(selection);
      const textSelection = selection instanceof TextSelection;

      if (anchor && head && !textSelection) {
        const map = TableOffsetMap.create(anchor)!;
        const { startRowIdx, startColIdx, endRowIdx, endColIdx } = map.getRectOffsets(anchor, head);

        for (let rowIdx = startRowIdx; rowIdx <= endRowIdx; rowIdx += 1) {
          for (let colIdx = startColIdx; colIdx <= endColIdx; colIdx += 1) {
            if (!map.extendedRowSpan(rowIdx, colIdx) && !map.extendedColSpan(rowIdx, colIdx)) {
              const { node, pos } = map.getNodeAndPos(rowIdx, colIdx);
              const cells = createDummyCells(1, rowIdx, schema, node.attrs);

              tr.replaceWith(tr.mapping.map(pos), tr.mapping.map(pos + node.nodeSize), cells);
            }
          }
        }
        dispatch!(tr);
        return true;
      }
      return false;
    };
  }

  private exitTable(): Command {
    return (state, dispatch) => {
      const { selection, tr, schema } = state;
      const { $from } = selection;
      const cell = findNodeBy(
        $from,
        ({ type }) => type.name === 'tableHeadCell' || type.name === 'tableBodyCell'
      );

      if (cell) {
        const para = findNodeBy($from, ({ type }) => type.name === 'paragraph');

        if (para) {
          const { anchor } = getResolvedSelection(selection);
          const map = TableOffsetMap.create(anchor)!;

          dispatch!(addParagraphAfterTable(tr, map, schema, true));
          return true;
        }
      }
      return false;
    };
  }

  private mergeCells(): EditorCommand {
    return () => (state, dispatch) => {
      const { selection, tr } = state;
      const { anchor, head } = getResolvedSelection(selection);

      // @ts-ignore
      // judge cell selection
      if (!anchor || !head || !selection.isCellSelection) {
        return false;
      }

      const map = TableOffsetMap.create(anchor)!;
      const CellSelection = Object.getPrototypeOf(selection).constructor;

      const { totalRowCount, totalColumnCount } = map;
      const selectionInfo = map.getRectOffsets(anchor, head);
      const { rowCount, columnCount } = getRowAndColumnCount(selectionInfo);

      const { startRowIdx, startColIdx, endRowIdx, endColIdx } = selectionInfo;

      const allSelected = rowCount >= totalRowCount - 1 && columnCount === totalColumnCount;
      const hasTableHead = startRowIdx === 0 && endRowIdx > startRowIdx;

      if (allSelected || hasTableHead) {
        return false;
      }

      let fragment = Fragment.empty;

      for (let rowIdx = startRowIdx; rowIdx <= endRowIdx; rowIdx += 1) {
        for (let colIdx = startColIdx; colIdx <= endColIdx; colIdx += 1) {
          // set first cell content
          if (rowIdx === startRowIdx && colIdx === startColIdx) {
            fragment = appendFragment(rowIdx, colIdx, fragment, map);
            // set each cell content and delete the cell for spanning
          } else if (!map.extendedRowSpan(rowIdx, colIdx) && !map.extendedColSpan(rowIdx, colIdx)) {
            const { offset, nodeSize } = map.getCellInfo(rowIdx, colIdx);
            const from = tr.mapping.map(offset);
            const to = from + nodeSize;

            fragment = appendFragment(rowIdx, colIdx, fragment, map);

            tr.delete(from, to);
          }
        }
      }

      const { node, pos } = map.getNodeAndPos(startRowIdx, startColIdx);

      // set rowspan, colspan to first root cell
      setSpanToRootCell(tr, fragment, {
        startNode: node,
        startPos: pos,
        rowCount,
        columnCount,
      });

      tr.setSelection(new CellSelection(tr.doc.resolve(pos)));

      dispatch!(tr);
      return true;
    }
  }

  private splitCells(): EditorCommand {
    return () => (state, dispatch, view) => {
      const { selection, tr } = state;
      const { anchor, head } = getResolvedSelection(selection);

      if (!anchor || !head) {
        return false;
      }

      const map = TableOffsetMap.create(anchor)!;
      const selectionInfo = map.getRectOffsets(anchor, head);
      const { startRowIdx, startColIdx, endRowIdx, endColIdx } = selectionInfo;

      let lastCellPos = -1;

      for (let rowIdx = startRowIdx; rowIdx <= endRowIdx; rowIdx += 1) {
        for (let colIdx = startColIdx; colIdx <= endColIdx; colIdx += 1) {
          if (map.extendedRowSpan(rowIdx, colIdx) || map.extendedColSpan(rowIdx, colIdx)) {
            // insert empty cell in spanning cell position
            const { node } = map.getNodeAndPos(rowIdx, colIdx);
            const colspanEndIdx = getColspanEndIdx(rowIdx, colIdx, map);
            const mappedPos = map.posAt(rowIdx, colspanEndIdx);

            let pos = tr.mapping.map(mappedPos);

            // add 2(tr end, open tag length) to insert the cell on the next row
            // in case that all next cells are spanning on the current row
            if (judgeInsertToNextRow(map, mappedPos, rowIdx, colspanEndIdx)) {
              pos += 2;
            }

            // get the last cell position for cell selection after splitting cells
            lastCellPos = Math.max(pos, lastCellPos);

            tr.insert(
              pos,
              node.type.createAndFill(setAttrs(node, { colspan: null, rowspan: null }))!
            );
          } else {
            // remove colspan, rowspan of the root spanning cell
            const { node, pos } = map.getNodeAndPos(rowIdx, colIdx);

            // get the last cell position for cell selection after splitting cells
            lastCellPos = Math.max(tr.mapping.map(pos), lastCellPos);

            tr.setNodeMarkup(
              tr.mapping.map(pos),
              null,
              setAttrs(node, { colspan: null, rowspan: null })
            );
          }
        }
      }
      dispatch!(tr);
      setCellSelection(view, selection, map.tableStartOffset, selectionInfo);

      return true;
    }
  }

  commands() {
    return {
      addTable: this.addTable(),
      removeTable: this.removeTable(),
      addColumnToLeft: this.addColumn(Direction.LEFT),
      addColumnToRight: this.addColumn(Direction.RIGHT),
      removeColumn: this.removeColumn(),
      addRowToUp: this.addRow(Direction.UP),
      addRowToDown: this.addRow(Direction.DOWN),
      removeRow: this.removeRow(),
      alignColumn: this.alignColumn(),
      mergeCells: this.mergeCells(),
      splitCells: this.splitCells(),
    };
  }

  keymaps() {
    const deleteCellContent = this.deleteCells();

    return {
      Tab: this.moveToCell(Direction.RIGHT),
      'Shift-Tab': this.moveToCell(Direction.LEFT),

      ArrowUp: this.moveInCell(Direction.UP),
      ArrowDown: this.moveInCell(Direction.DOWN),

      ArrowLeft: this.moveInCell(Direction.LEFT),
      ArrowRight: this.moveInCell(Direction.RIGHT),

      Backspace: deleteCellContent,
      'Mod-Backspace': deleteCellContent,
      Delete: deleteCellContent,
      'Mod-Delete': deleteCellContent,

      'Mod-Enter': this.exitTable(),
    };
  }
}
