import type { Node, ResolvedPos } from 'prosemirror-model';
import { findNodeBy } from '@/wysiwyg/helper/node';
import { assign, getSortedNumPair } from '@/utils/common';

export interface CellInfo {
  offset: number;
  nodeSize: number;
  extended?: boolean;
}
export interface SelectionInfo {
  startRowIdx: number;
  startColIdx: number;
  endRowIdx: number;
  endColIdx: number;
}

interface SpanMap {
  [key: number]: { count: number; startSpanIdx: number };
}

export interface RowInfo {
  [key: number]: CellInfo;
  length: number;
  rowSpanMap: SpanMap;
  colspanMap: SpanMap;
}

interface SpanInfo {
  node: Node;
  pos: number;
  count: number;
  startSpanIdx: number;
}

interface OffsetMap {
  rowInfo: RowInfo[];
  table: Node;
  totalRowCount: number;
  totalColumnCount: number;
  tableStartOffset: number;
  tableEndOffset: number;
  getCellInfo(rowIdx: number, colIdx: number): CellInfo;
  posAt(rowIdx: number, colIdx: number): number;
  getNodeAndPos(rowIdx: number, colIdx: number): { node: Node; pos: number };
  extendedRowSpan(rowIdx: number, colIdx: number): boolean;
  extendedColspan(rowIdx: number, colIdx: number): boolean;
  getRowSpanCount(rowIdx: number, colIdx: number): number;
  getColspanCount(rowIdx: number, colIdx: number): number;
  decreaseColspanCount(rowIdx: number, colIdx: number): number;
  decreaseRowSpanCount(rowIdx: number, colIdx: number): number;
  getColspanStartInfo(rowIdx: number, colIdx: number): SpanInfo | null;
  getRowSpanStartInfo(rowIdx: number, colIdx: number): SpanInfo | null;
  getRectOffsets(startCellPos: ResolvedPos, endCellPos?: ResolvedPos): SelectionInfo;
  getSpannedOffsets(selectionInfo: SelectionInfo): SelectionInfo;
}

type CreateOffsetMapMixin = (
  headOrBody: Node,
  startOffset: number,
  startFromBody?: boolean
) => RowInfo[];

const cache = new Map();

/* eslint-disable @typescript-eslint/no-unused-vars */
export class TableOffsetMap {
  private table: Node;

  private tableRows: Node[];

  private tableStartPos: number;

  private rowInfo: RowInfo[];

  constructor(table: Node, tableRows: Node[], tableStartPos: number, rowInfo: RowInfo[]) {
    this.table = table;
    this.tableRows = tableRows;
    this.tableStartPos = tableStartPos;
    this.rowInfo = rowInfo;
  }

  static create(cellPos: ResolvedPos): TableOffsetMap | null {
    const table = findNodeBy(cellPos, ({ type }: Node) => type.name === 'table');

    if (table) {
      const { node, depth, offset } = table;
      const cached = cache.get(node);

      if (cached?.tableStartPos === offset + 1) {
        return cached;
      }

      const rows: Node[] = [];
      const tablePos = cellPos.start(depth);

      const thead = node.child(0);
      const tbody = node.child(1);

      const theadCellInfo = createOffsetMap(thead, tablePos);
      const tbodyCellInfo = createOffsetMap(tbody, tablePos + thead.nodeSize);

      thead.forEach((row) => rows.push(row));
      tbody.forEach((row) => rows.push(row));

      const map = new TableOffsetMap(node, rows, tablePos, theadCellInfo.concat(tbodyCellInfo));

      cache.set(node, map);

      return map;
    }

    return null;
  }

  get totalRowCount() {
    return this.rowInfo.length;
  }

  get totalColumnCount() {
    return this.rowInfo[0].length;
  }

  get tableStartOffset() {
    return this.tableStartPos;
  }

  get tableEndOffset() {
    return this.tableStartPos + this.table.nodeSize - 1;
  }

  getCellInfo(rowIdx: number, colIdx: number) {
    return this.rowInfo[rowIdx][colIdx];
  }

  posAt(rowIdx: number, colIdx: number): number {
    for (let i = 0, rowStart = this.tableStartPos; ; i += 1) {
      const rowEnd = rowStart + this.tableRows[i].nodeSize;

      if (i === rowIdx) {
        let index = colIdx;

        // Skip the cells from previous row(via rowSpan)
        while (index < this.totalColumnCount && this.rowInfo[i][index].offset < rowStart) {
          index += 1;
        }
        return index === this.totalColumnCount ? rowEnd : this.rowInfo[i][index].offset;
      }
      rowStart = rowEnd;
    }
  }

  getNodeAndPos(rowIdx: number, colIdx: number) {
    const cellInfo = this.rowInfo[rowIdx][colIdx];

    return {
      node: this.table.nodeAt(cellInfo.offset - this.tableStartOffset)!,
      pos: cellInfo.offset,
    };
  }

  getCellStartOffset(rowIdx: number, colIdx: number) {
    const { offset } = this.rowInfo[rowIdx][colIdx];

    return this.extendedRowSpan(rowIdx, colIdx) ? this.posAt(rowIdx, colIdx) : offset;
  }

  getCellEndOffset(rowIdx: number, colIdx: number) {
    const { offset, nodeSize } = this.rowInfo[rowIdx][colIdx];

    return this.extendedRowSpan(rowIdx, colIdx) ? this.posAt(rowIdx, colIdx) : offset + nodeSize;
  }

  getCellIndex(cellPos: ResolvedPos): [rowIdx: number, colIdx: number] {
    for (let rowIdx = 0; rowIdx < this.totalRowCount; rowIdx += 1) {
      const rowInfo = this.rowInfo[rowIdx];

      for (let colIdx = 0; colIdx < this.totalColumnCount; colIdx += 1) {
        if (rowInfo[colIdx].offset + 1 > cellPos.pos) {
          return [rowIdx, colIdx];
        }
      }
    }
    return [0, 0];
  }

  getRectOffsets(startCellPos: ResolvedPos, endCellPos = startCellPos) {
    if (startCellPos.pos > endCellPos.pos) {
      [startCellPos, endCellPos] = [endCellPos, startCellPos];
    }
    let [startRowIdx, startColIdx] = this.getCellIndex(startCellPos);
    let [endRowIdx, endColIdx] = this.getCellIndex(endCellPos);

    [startRowIdx, endRowIdx] = getSortedNumPair(startRowIdx, endRowIdx);
    [startColIdx, endColIdx] = getSortedNumPair(startColIdx, endColIdx);

    return this.getSpannedOffsets({ startRowIdx, startColIdx, endRowIdx, endColIdx });
  }
  extendedRowSpan(rowIdx: number, colIdx: number) {
    const rowSpanInfo = this.rowInfo[rowIdx].rowSpanMap[colIdx];

    return !!rowSpanInfo && rowSpanInfo.startSpanIdx !== rowIdx;
  }
  extendedColSpan(rowIdx: number, colIdx: number) {
    const colspanInfo = this.rowInfo[rowIdx].colspanMap[colIdx];

    return !!colspanInfo && colspanInfo.startSpanIdx !== colIdx;
  }
  getRowSpanCount(rowIdx: number, colIdx: number) {
    const rowSpanInfo = this.rowInfo[rowIdx].rowSpanMap[colIdx];

    return rowSpanInfo ? rowSpanInfo.count : 0;
  }
  getColspanCount(rowIdx: number, colIdx: number) {
    const colspanInfo = this.rowInfo[rowIdx].colspanMap[colIdx];

    return colspanInfo ? colspanInfo.count : 0;
  }
  decreaseColspanCount(rowIdx: number, colIdx: number) {
    const colspanInfo = this.rowInfo[rowIdx].colspanMap[colIdx];
    const startColspanInfo = this.rowInfo[rowIdx].colspanMap[colspanInfo.startSpanIdx];

    startColspanInfo.count -= 1;

    return startColspanInfo.count;
  }
  decreaseRowSpanCount(rowIdx: number, colIdx: number) {
    const rowSpanInfo = this.rowInfo[rowIdx].rowSpanMap[colIdx];
    const startRowSpanInfo = this.rowInfo[rowSpanInfo.startSpanIdx].rowSpanMap[colIdx];

    startRowSpanInfo.count -= 1;

    return startRowSpanInfo.count;
  }
  getColspanStartInfo(rowIdx: number, colIdx: number) {
    const { colspanMap } = this.rowInfo[rowIdx];
    const colspanInfo = colspanMap[colIdx];

    if (colspanInfo) {
      const { startSpanIdx } = colspanInfo;
      const cellInfo = this.rowInfo[rowIdx][startSpanIdx];

      return {
        node: this.table.nodeAt(cellInfo.offset - this.tableStartOffset)!,
        pos: cellInfo.offset,
        startSpanIdx,
        count: colspanMap[startSpanIdx].count,
      };
    }
    return null;
  }
  getRowSpanStartInfo(rowIdx: number, colIdx: number) {
    const { rowSpanMap } = this.rowInfo[rowIdx];
    const rowSpanInfo = rowSpanMap[colIdx];

    if (rowSpanInfo) {
      const { startSpanIdx } = rowSpanInfo;
      const cellInfo = this.rowInfo[startSpanIdx][colIdx];

      return {
        node: this.table.nodeAt(cellInfo.offset - this.tableStartOffset)!,
        pos: cellInfo.offset,
        startSpanIdx,
        count: this.rowInfo[startSpanIdx].rowSpanMap[colIdx].count,
      };
    }
    return null;
  }
  getSpannedOffsets(selectionInfo: SelectionInfo): SelectionInfo {
    let { startRowIdx, startColIdx, endRowIdx, endColIdx } = selectionInfo;

    for (let rowIdx = endRowIdx; rowIdx >= startRowIdx; rowIdx -= 1) {
      if (this.rowInfo[rowIdx]) {
        const { rowSpanMap, colspanMap } = this.rowInfo[rowIdx];

        for (let colIdx = endColIdx; colIdx >= startColIdx; colIdx -= 1) {
          const rowSpanInfo = rowSpanMap[colIdx];
          const colspanInfo = colspanMap[colIdx];

          if (rowSpanInfo) {
            startRowIdx = Math.min(startRowIdx, rowSpanInfo.startSpanIdx);
          }
          if (colspanInfo) {
            startColIdx = Math.min(startColIdx, colspanInfo.startSpanIdx);
          }
        }
      }
    }

    for (let rowIdx = startRowIdx; rowIdx <= endRowIdx; rowIdx += 1) {
      if (this.rowInfo[rowIdx]) {
        const { rowSpanMap, colspanMap } = this.rowInfo[rowIdx];

        for (let colIdx = startColIdx; colIdx <= endColIdx; colIdx += 1) {
          const rowSpanInfo = rowSpanMap[colIdx];
          const colspanInfo = colspanMap[colIdx];

          if (rowSpanInfo) {
            endRowIdx = Math.max(endRowIdx, rowIdx + rowSpanInfo.count - 1);
          }
          if (colspanInfo) {
            endColIdx = Math.max(endColIdx, colIdx + colspanInfo.count - 1);
          }
        }
      }
    }

    return { startRowIdx, startColIdx, endRowIdx, endColIdx };
  }
}
function extendPrevRowSpan(prevRowInfo: RowInfo, rowInfo: RowInfo) {
  const { rowSpanMap, colspanMap } = rowInfo;
  const { rowSpanMap: prevRowSpanMap, colspanMap: prevColspanMap } = prevRowInfo;

  Object.keys(prevRowSpanMap).forEach((key) => {
    const colIdx = Number(key);
    const prevRowSpanInfo = prevRowSpanMap[colIdx];

    if (prevRowSpanInfo?.count > 1) {
      const prevColspanInfo = prevColspanMap[colIdx];
      const { count, startSpanIdx } = prevRowSpanInfo;

      rowSpanMap[colIdx] = { count: count - 1, startSpanIdx };
      colspanMap[colIdx] = prevColspanInfo;

      rowInfo[colIdx] = { ...prevRowInfo[colIdx], extended: true };
      rowInfo.length += 1;
    }
  });
}
function extendPrevColspan(
  rowSpan: number,
  colSpan: number,
  rowIdx: number,
  colIdx: number,
  rowInfo: RowInfo
) {
  const { rowSpanMap, colspanMap } = rowInfo;

  for (let i = 1; i < colSpan; i += 1) {
    colspanMap[colIdx + i] = { count: colSpan - i, startSpanIdx: colIdx };

    if (rowSpan > 1) {
      rowSpanMap[colIdx + i] = { count: rowSpan, startSpanIdx: rowIdx };
    }

    rowInfo[colIdx + i] = { ...rowInfo[colIdx] };
    rowInfo.length += 1;
  }
}
let createOffsetMap = (headOrBody: Node, startOffset: number, startFromBody = false) => {
  const cellInfoMatrix: RowInfo[] = [];
  const beInBody = headOrBody.type.name === 'tableBody';

  headOrBody.forEach((row: Node, rowOffset: number, rowIdx: number) => {
    // get row index based on table(not table head or table body)
    const rowIdxInWholeTable = beInBody && !startFromBody ? rowIdx + 1 : rowIdx;
    const prevRowInfo = cellInfoMatrix[rowIdx - 1];
    const rowInfo: RowInfo = { rowSpanMap: {}, colspanMap: {}, length: 0 };

    if (prevRowInfo) {
      extendPrevRowSpan(prevRowInfo, rowInfo);
    }

    row.forEach(({ nodeSize, attrs }: Node, cellOffset: number) => {
      const colSpan: number = attrs.colspan ?? 1;
      const rowSpan: number = attrs.rowspan ?? 1;
      let colIdx = 0;

      while (rowInfo[colIdx]) {
        colIdx += 1;
      }

      rowInfo[colIdx] = {
        // 2 is the sum of the front and back positions of the tag
        offset: startOffset + rowOffset + cellOffset + 2,
        nodeSize,
      };

      rowInfo.length += 1;

      if (rowSpan > 1) {
        rowInfo.rowSpanMap[colIdx] = { count: rowSpan, startSpanIdx: rowIdxInWholeTable };
      }

      if (colSpan > 1) {
        rowInfo.colspanMap[colIdx] = { count: colSpan, startSpanIdx: colIdx };
        extendPrevColspan(rowSpan, colSpan, rowIdxInWholeTable, colIdx, rowInfo);
      }
    });
    cellInfoMatrix.push(rowInfo);
  });

  return cellInfoMatrix;
};

export function mixinTableOffsetMapPrototype(
  offsetMapMixin: OffsetMap,
  createOffsetMapMixin: CreateOffsetMapMixin
) {
  assign(TableOffsetMap.prototype, offsetMapMixin);
  createOffsetMap = createOffsetMapMixin;

  return TableOffsetMap;
}
