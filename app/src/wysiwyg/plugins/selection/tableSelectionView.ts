import { ResolvedPos } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { PluginKey, TextSelection } from 'prosemirror-state';

import { findCell, findCellElement } from '@/wysiwyg/helper/table';

import CellSelection from './cellSelection';

interface EventHandlers {
  mousedown: (ev: Event) => void;
  mousemove: (ev: Event) => void;
  mouseup: () => void;
  dblclick: (ev: Event) => void;
}

export const pluginKey = new PluginKey('cellSelection');

const MOUSE_RIGHT_BUTTON = 2;

export default class TableSelection {
  private view: EditorView;

  private handlers: EventHandlers;

  private startCellPos: ResolvedPos | null;

  private isSelecting: boolean;

  private startMousePos: { x: number; y: number } | null;

  constructor(view: EditorView) {
    this.view = view;

    this.handlers = {
      mousedown: this.handleMousedown.bind(this),
      mousemove: this.handleMousemove.bind(this),
      mouseup: this.handleMouseup.bind(this),
      dblclick: this.handleDblclick.bind(this),
    };

    this.startCellPos = null;
    this.isSelecting = false;
    this.startMousePos = null;

    this.init();
  }

  init() {
    this.view.dom.addEventListener('mousedown', this.handlers.mousedown);
    this.view.dom.addEventListener('mousemove', this.handlers.mousemove);
    this.view.dom.addEventListener('mouseup', this.handlers.mouseup);
    this.view.dom.addEventListener('dblclick', this.handlers.dblclick);
  }

  handleMousedown(ev: Event) {
    const foundCell = findCellElement(ev.target as HTMLElement, this.view.dom);

    if ((ev as MouseEvent).button === MOUSE_RIGHT_BUTTON) {
      ev.preventDefault();
      return;
    }

    if (foundCell) {
      const startCellPos = this.getCellPos(ev as MouseEvent);

      if (startCellPos) {
        this.startCellPos = startCellPos;
        this.startMousePos = {
          x: (ev as MouseEvent).clientX,
          y: (ev as MouseEvent).clientY,
        };
        this.isSelecting = false;
      }
    } else {
      // 如果不在单元格内，重置状态
      this.startCellPos = null;
      this.startMousePos = null;
      this.isSelecting = false;
    }
  }

  handleMousemove(ev: Event) {
    // 如果没有起始单元格位置，不处理
    if (!this.startCellPos || !this.startMousePos) {
      return;
    }

    const mouseEvent = ev as MouseEvent;
    const currentMousePos = { x: mouseEvent.clientX, y: mouseEvent.clientY };

    // 检查是否已经开始选择模式
    if (!this.isSelecting) {
      // 计算鼠标移动距离
      const deltaX = Math.abs(currentMousePos.x - this.startMousePos.x);
      const deltaY = Math.abs(currentMousePos.y - this.startMousePos.y);
      const moveThreshold = 5; // 5像素的移动阈值

      // 检查是否移动到了不同的单元格
      const currentCellPos = this.getCellPos(mouseEvent);
      const movedToDifferentCell = currentCellPos && currentCellPos.pos !== this.startCellPos.pos;

      // 只有当移动距离超过阈值或移动到不同单元格时，才开始单元格选择
      if ((deltaX > moveThreshold || deltaY > moveThreshold) && movedToDifferentCell) {
        this.isSelecting = true;
        // 阻止默认的文本选择行为
        ev.preventDefault();
      } else {
        // 还没有达到开始单元格选择的条件，允许正常的文本选择
        return;
      }
    }

    // 如果已经在选择模式，阻止默认行为
    if (this.isSelecting) {
      ev.preventDefault();
    }

    const prevEndCellOffset = pluginKey.getState(this.view.state);
    const endCellPos = this.getCellPos(mouseEvent);
    const { startCellPos } = this;

    let prevEndCellPos;

    if (prevEndCellOffset) {
      prevEndCellPos = this.view.state.doc.resolve(prevEndCellOffset);
    } else if (startCellPos !== endCellPos) {
      prevEndCellPos = startCellPos;
    }

    if (prevEndCellPos && startCellPos && endCellPos) {
      this.setCellSelection(startCellPos, endCellPos);
    }
  }

  handleMouseup() {
    this.startCellPos = null;
    this.startMousePos = null;
    this.isSelecting = false;

    if (pluginKey.getState(this.view.state) !== null) {
      this.view.dispatch(this.view.state.tr.setMeta(pluginKey, -1));
    }
  }

  handleDblclick(ev: Event) {
    const foundCell = findCellElement(ev.target as HTMLElement, this.view.dom);

    if (foundCell) {
      const cellPos = this.getCellPos(ev as MouseEvent);

      if (cellPos) {
        // 获取单元格的内容范围
        const cell = this.view.state.doc.nodeAt(cellPos.pos);

        if (cell) {
          // 计算单元格内容的开始和结束位置
          const startPos = cellPos.pos + 1; // 单元格内容开始位置
          const endPos = cellPos.pos + cell.nodeSize - 1; // 单元格内容结束位置

          // 创建文本选择
          const selection = TextSelection.create(this.view.state.doc, startPos, endPos);

          // 应用选择
          this.view.dispatch(this.view.state.tr.setSelection(selection));

          // 阻止默认行为
          ev.preventDefault();
        }
      }
    }
  }

  getCellPos({ clientX, clientY }: MouseEvent) {
    const mousePos = this.view.posAtCoords({ left: clientX, top: clientY });

    if (mousePos) {
      const { doc } = this.view.state;
      const currentPos = doc.resolve(mousePos.pos);
      const foundCell = findCell(currentPos);

      if (foundCell) {
        const cellOffset = currentPos.before(foundCell.depth);

        return doc.resolve(cellOffset);
      }
    }

    return null;
  }

  setCellSelection(startCellPos: ResolvedPos, endCellPos: ResolvedPos) {
    const { selection, tr } = this.view.state;
    const starting = pluginKey.getState(this.view.state) === null;
    const cellSelection = new CellSelection(startCellPos, endCellPos);

    if (starting || !selection.eq(cellSelection)) {
      const newTr = tr.setSelection(cellSelection);

      if (starting) {
        newTr.setMeta(pluginKey, endCellPos.pos);
      }

      this.view.dispatch!(newTr);
    }
  }

  destroy() {
    this.view.dom.removeEventListener('mousedown', this.handlers.mousedown);
    this.view.dom.removeEventListener('mousemove', this.handlers.mousemove);
    this.view.dom.removeEventListener('mouseup', this.handlers.mouseup);
    this.view.dom.removeEventListener('dblclick', this.handlers.dblclick);
  }
}
