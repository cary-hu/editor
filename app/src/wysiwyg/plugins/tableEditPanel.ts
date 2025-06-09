import { Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Emitter } from '@t/event';

import { TableOffsetMap } from '@/wysiwyg/helper/tableOffsetMap';
import CellSelection from '@/wysiwyg/plugins/selection/cellSelection';

interface TableEditPanelState {
  isVisible: boolean;
  tableElement: HTMLElement | null;
  overlay: HTMLElement | null;
  panel: HTMLElement | null;
}

class TableEditPanelView {
  private eventEmitter: Emitter;

  private view: EditorView;

  private state: TableEditPanelState;

  private lastShowTime = 0;

  constructor(view: EditorView, eventEmitter: Emitter) {
    this.view = view;
    this.eventEmitter = eventEmitter;
    this.state = {
      isVisible: false,
      tableElement: null,
      overlay: null,
      panel: null,
    };
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleTableClick = this.handleTableClick.bind(this);
    this.init();
  }

  private init() {
    // Listen for clicks on the document
    document.addEventListener('click', this.handleDocumentClick);

    // Listen for table clicks
    this.view.dom.addEventListener('click', this.handleTableClick);

    // Listen for scroll events to update panel position
    window.addEventListener('scroll', this.updatePanelPosition.bind(this), true);
    window.addEventListener('resize', this.updatePanelPosition.bind(this));
  }

  private handleDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const now = Date.now();

    // Don't hide panel immediately after showing it (prevents event bubbling issues)
    if (now - this.lastShowTime < 100) {
      return;
    }

    // If clicking outside table or panel, hide the panel
    if (!this.isTableOrPanelElement(target)) {
      this.hidePanel();
    }
  }

  private handleTableClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const tableElement = target.closest('table');

    if (tableElement) {
      event.stopPropagation();
      event.preventDefault();
      this.showPanel(tableElement);
    }
  }

  private isTableOrPanelElement(element: HTMLElement): boolean {
    return !!(
      element.closest('table') ||
      element.closest('.toastui-editor-table-edit-panel') ||
      element.classList.contains('toastui-editor-add-row-btn') ||
      element.classList.contains('toastui-editor-add-col-btn') ||
      element.classList.contains('toastui-editor-row-divider-container') ||
      element.classList.contains('toastui-editor-col-divider-container')
    );
  }

  private showPanel(tableElement: HTMLElement) {
    // Hide existing panel if any
    this.hidePanel();

    this.state.tableElement = tableElement;
    this.lastShowTime = Date.now();
    this.createPanel();
    this.createOverlay();
    this.createRowDividers();
    this.createColumnDividers();
    this.state.isVisible = true;
  }

  private hidePanel() {
    if (this.state.panel) {
      this.state.panel.remove();
      this.state.panel = null;
    }
    if (this.state.overlay) {
      this.state.overlay.remove();
      this.state.overlay = null;
    }
    this.state.isVisible = false;
    this.state.tableElement = null;
  }

  private updatePanelPosition() {
    if (!this.state.panel || !this.state.tableElement) return;

    const tableRect = this.state.tableElement.getBoundingClientRect();

    this.state.panel.style.left = `${tableRect.left}px`;
    this.state.panel.style.top = `${tableRect.top}px`;
    this.state.panel.style.width = `${tableRect.width}px`;
    this.state.panel.style.height = `${tableRect.height}px`;
  }

  private createPanel() {
    if (!this.state.tableElement) return;

    const panel = document.createElement('div');

    panel.className = 'toastui-editor-table-edit-panel';

    // Position the panel to cover the table
    const tableRect = this.state.tableElement.getBoundingClientRect();
    const viewportOffset = { left: 0, top: 0 };

    // Use fixed positioning to avoid ProseMirror DOMObserver issues
    panel.style.position = 'fixed';
    panel.style.left = `${tableRect.left + viewportOffset.left}px`;
    panel.style.top = `${tableRect.top + viewportOffset.top}px`;
    panel.style.width = `${tableRect.width}px`;
    panel.style.height = `${tableRect.height}px`;
    panel.style.zIndex = '25';

    // Ensure panel is visible
    panel.style.display = 'block';
    panel.style.visibility = 'visible';

    // Add to document body instead of editor DOM to avoid ProseMirror DOMObserver
    document.body.appendChild(panel);
    this.state.panel = panel;
  }

  private createOverlay() {
    if (!this.state.panel || !this.state.tableElement) return;

    const overlay = document.createElement('div');

    overlay.className = 'toastui-editor-table-edit-overlay';

    // Set overlay to cover the entire table
    overlay.style.width = '100%';
    overlay.style.height = '100%';

    this.state.panel.appendChild(overlay);
    this.state.overlay = overlay;
  }

  private createRowDividers() {
    if (!this.state.panel || !this.state.tableElement) return;

    const rows = this.state.tableElement.querySelectorAll('tr');
    const panelRect = this.state.tableElement.getBoundingClientRect();

    // Create hover zones instead of visible buttons
    rows.forEach((row, index) => {
      const rowRect = row.getBoundingClientRect();

      // Calculate position relative to the panel (which uses fixed positioning)
      const dividerY = rowRect.bottom - panelRect.top;

      // Create hover container that includes both the zone and button
      const hoverContainer = document.createElement('div');

      hoverContainer.className = 'toastui-editor-row-divider-container';
      hoverContainer.style.position = 'absolute';
      hoverContainer.style.left = '0';
      hoverContainer.style.top = `${dividerY - 7}px`; // Expanded hover area
      hoverContainer.style.width = '100%';
      hoverContainer.style.height = '10px'; // 30px hover zone
      hoverContainer.style.cursor = 'pointer';
      hoverContainer.style.zIndex = '26';
      hoverContainer.style.backgroundColor = 'transparent'; // Remove debug background
      hoverContainer.style.pointerEvents = 'auto';

      // Create add row button (initially hidden)
      const addRowBtn = document.createElement('div');

      addRowBtn.className = 'toastui-editor-add-row-btn';
      addRowBtn.innerHTML = '+';
      addRowBtn.style.position = 'absolute';
      addRowBtn.style.left = '50%';
      addRowBtn.style.top = '50%';
      addRowBtn.style.transform = 'translate(-50%, -50%)';
      addRowBtn.style.width = '18px';
      addRowBtn.style.height = '18px';
      addRowBtn.style.borderRadius = '50%';
      addRowBtn.style.backgroundColor = '#007acc';
      addRowBtn.style.color = 'white';
      addRowBtn.style.fontSize = '14px';
      addRowBtn.style.fontWeight = 'bold';
      addRowBtn.style.cursor = 'pointer';
      addRowBtn.style.border = 'none';
      addRowBtn.style.display = 'none'; // Initially hidden
      addRowBtn.style.zIndex = '1'; // Relative to container
      addRowBtn.title = index === 0 ? 'Add row after header' : 'Add row below';

      // Append button to container
      hoverContainer.appendChild(addRowBtn);

      // Hover events for the container (includes both zone and button)
      hoverContainer.addEventListener('mouseenter', () => {
        addRowBtn.style.display = 'flex';
        addRowBtn.style.alignItems = 'center';
        addRowBtn.style.justifyContent = 'center';
        addRowBtn.style.lineHeight = '1';
        addRowBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      });

      hoverContainer.addEventListener('mouseleave', () => {
        addRowBtn.style.display = 'none';
      });

      // Click event for the button
      addRowBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.addRow(index + 1);
      });

      this.state.panel!.appendChild(hoverContainer);
    });
  }

  private createColumnDividers() {
    if (!this.state.panel || !this.state.tableElement) return;

    const firstRow = this.state.tableElement.querySelector('tr');

    if (!firstRow) return;

    const cells = firstRow.querySelectorAll('th, td');
    const panelRect = this.state.tableElement.getBoundingClientRect();

    // Add hover zone and button before first column (at the left)
    if (cells.length > 0) {
      const [firstCell] = cells;
      const firstCellRect = firstCell.getBoundingClientRect();

      // Calculate position relative to the panel (which uses fixed positioning)
      const dividerX = firstCellRect.left - panelRect.left;

      // Create hover container for column divider (first column)
      const hoverContainer = document.createElement('div');

      hoverContainer.className = 'toastui-editor-col-divider-container';
      hoverContainer.style.position = 'absolute';
      hoverContainer.style.left = `${dividerX - 7}px`; // Expanded hover area
      hoverContainer.style.top = '0';
      hoverContainer.style.width = '10px'; // 30px hover zone
      hoverContainer.style.height = '100%';
      hoverContainer.style.cursor = 'pointer';
      hoverContainer.style.zIndex = '26';
      hoverContainer.style.backgroundColor = 'transparent'; // Remove debug background
      hoverContainer.style.pointerEvents = 'auto';

      // Create add column button (initially hidden)
      const addColBtn = document.createElement('div');

      addColBtn.className = 'toastui-editor-add-col-btn';
      addColBtn.innerHTML = '+';
      addColBtn.style.position = 'absolute';
      addColBtn.style.left = '50%';
      addColBtn.style.top = '50%';
      addColBtn.style.transform = 'translate(-50%, -50%)';
      addColBtn.style.display = 'none'; // Initially hidden
      addColBtn.style.width = '18px';
      addColBtn.style.height = '18px';
      addColBtn.style.borderRadius = '50%';
      addColBtn.style.backgroundColor = '#007acc';
      addColBtn.style.color = 'white';
      addColBtn.style.fontSize = '14px';
      addColBtn.style.fontWeight = 'bold';
      addColBtn.style.cursor = 'pointer';
      addColBtn.style.border = 'none';
      addColBtn.style.display = 'none'; // Initially hidden
      addColBtn.style.zIndex = '1'; // Relative to container
      addColBtn.title = 'Add column left';

      // Append button to container
      hoverContainer.appendChild(addColBtn);

      // Hover events for the container
      hoverContainer.addEventListener('mouseenter', () => {
        addColBtn.style.display = 'flex';
        addColBtn.style.alignItems = 'center';
        addColBtn.style.justifyContent = 'center';
        addColBtn.style.lineHeight = '1';
        addColBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      });

      hoverContainer.addEventListener('mouseleave', () => {
        addColBtn.style.display = 'none';
      });

      // Click event for the button
      addColBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.addColumn(0); // Button index 0 - insert before first column
      });

      this.state.panel!.appendChild(hoverContainer);
    }

    // Add hover zones and buttons between columns and after last column
    cells.forEach((cell, index) => {
      const cellRect = cell.getBoundingClientRect();

      // Calculate position relative to the panel (which uses fixed positioning)
      const dividerX = cellRect.right - panelRect.left;

      // Create hover container for column divider
      const hoverContainer = document.createElement('div');

      hoverContainer.className = 'toastui-editor-col-divider-container';
      hoverContainer.style.position = 'absolute';
      hoverContainer.style.left = `${dividerX - 7}px`; // Expanded hover area
      hoverContainer.style.top = '0';
      hoverContainer.style.width = '10px'; // 30px hover zone
      hoverContainer.style.height = '100%';
      hoverContainer.style.cursor = 'pointer';
      hoverContainer.style.zIndex = '26';
      hoverContainer.style.backgroundColor = 'transparent'; // Remove debug background
      hoverContainer.style.pointerEvents = 'auto';

      // Create add column button (initially hidden)
      const addColBtn = document.createElement('div');

      addColBtn.className = 'toastui-editor-add-col-btn';
      addColBtn.innerHTML = '+';
      addColBtn.style.position = 'absolute';
      addColBtn.style.left = '50%';
      addColBtn.style.top = '50%';
      addColBtn.style.transform = 'translate(-50%, -50%)';
      addColBtn.style.display = 'none'; // Initially hidden
      addColBtn.style.width = '18px';
      addColBtn.style.height = '18px';
      addColBtn.style.borderRadius = '50%';
      addColBtn.style.backgroundColor = '#007acc';
      addColBtn.style.color = 'white';
      addColBtn.style.fontSize = '14px';
      addColBtn.style.fontWeight = 'bold';
      addColBtn.style.cursor = 'pointer';
      addColBtn.style.border = 'none';
      addColBtn.style.display = 'none'; // Initially hidden
      addColBtn.style.zIndex = '1'; // Relative to container
      addColBtn.title = 'Add column right';

      // Append button to container
      hoverContainer.appendChild(addColBtn);

      // Hover events for the container
      hoverContainer.addEventListener('mouseenter', () => {
        addColBtn.style.display = 'flex';
        addColBtn.style.alignItems = 'center';
        addColBtn.style.justifyContent = 'center';
        addColBtn.style.lineHeight = '1';
        addColBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      });

      hoverContainer.addEventListener('mouseleave', () => {
        addColBtn.style.display = 'none';
      });

      // Click event for the button
      addColBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        this.addColumn(index + 1); // Button index represents insertion point
      });

      this.state.panel!.appendChild(hoverContainer);
    });
  }

  private addRow(rowIndex: number) {
    if (!this.state.tableElement) return;

    // Find the table element in the document and get the table offset map
    const { state, dispatch } = this.view;
    const { doc, tr } = state;

    // Find the table position in the document
    let tablePos: number | null = null;

    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const domNode = this.view.domAtPos(pos + 1).node;

        if (
          domNode === this.state.tableElement ||
          (this.state.tableElement && this.state.tableElement.contains(domNode as Node))
        ) {
          tablePos = pos + 1;

          return false;
        }
      }

      return true;
    });

    if (tablePos === null) return;

    const cellPos = doc.resolve(tablePos);
    const map = TableOffsetMap.create(cellPos);

    if (!map) return;

    // Calculate the target position for row insertion
    // Since we don't allow insertion above header, all row insertions are "below" operations
    // - rowIndex 1 means insert after row 0 (header)
    // - rowIndex 2 means insert after row 1, etc.
    const targetColIdx = 0; // Always use first column to set selection

    // All insertions are after existing rows, so target row is rowIndex - 1
    let targetRowIdx = Math.min(rowIndex - 1, map.totalRowCount - 1);
    let command = 'addRowToDown';
    let direction: 'up' | 'down' = 'down';

    if (targetRowIdx === 0) {
      targetRowIdx = 1;
      command = 'addRowToUp';
      direction = 'up'; // Insert above first body row
    }

    // Get the cell offset for the target position
    const { offset: cellOffset } = map.getCellInfo(targetRowIdx, targetColIdx);
    const startCellPos = doc.resolve(cellOffset);
    const endCellPos = startCellPos;

    // Create cell selection and set it
    const cellSelection = new CellSelection(startCellPos, endCellPos);

    dispatch!(tr.setSelection(cellSelection));

    // Use event emitter to execute the command
    this.eventEmitter.emit('command', command);

    this.setCellSelection(tablePos, direction);
    // Re-show panel and select newly added row after a longer delay to allow DOM to update
    this.showPanel(this.state.tableElement);
  }

  private addColumn(columnIndex: number) {
    if (!this.state.tableElement) return;

    // Find the table element in the document and get the table offset map
    const { state, dispatch } = this.view;
    const { doc, tr } = state;

    // Find the table position in the document
    let tablePos: number | null = null;

    doc.descendants((node, pos) => {
      if (node.type.name === 'table') {
        const domNode = this.view.domAtPos(pos + 1).node;

        if (
          domNode === this.state.tableElement ||
          (this.state.tableElement && this.state.tableElement.contains(domNode as Node))
        ) {
          tablePos = pos + 1;

          return false;
        }
      }

      return true;
    });

    if (tablePos === null) return;

    const cellPos = doc.resolve(tablePos);
    const map = TableOffsetMap.create(cellPos);

    if (!map) return;

    // Calculate the target position for column insertion
    // Column buttons are positioned between columns, so:
    // - Button 0 (leftmost) inserts before column 0
    // - Button 1 (between col 0 and 1) inserts after column 0
    // - Button 2 (between col 1 and 2) inserts after column 1, etc.
    const targetRowIdx = 0; // Always use first row to set selection

    let targetColIdx: number;
    let command: string;
    let direction: 'left' | 'right';

    if (columnIndex === 0) {
      // Leftmost button - insert left of first column
      targetColIdx = 0;
      command = 'addColumnToLeft';
      direction = 'left';
    } else {
      // Other buttons - insert right of the column to the left
      targetColIdx = columnIndex - 1;
      command = 'addColumnToRight';
      direction = 'right';
    }

    // Ensure target column index is valid
    targetColIdx = Math.min(targetColIdx, map.totalColumnCount - 1);

    // Get the cell offset for the target position
    const { offset: cellOffset } = map.getCellInfo(targetRowIdx, targetColIdx);
    const startCellPos = doc.resolve(cellOffset);
    const endCellPos = startCellPos;

    // Create cell selection and set it
    const cellSelection = new CellSelection(startCellPos, endCellPos);

    dispatch!(tr.setSelection(cellSelection));

    // Use event emitter to execute the command
    this.eventEmitter.emit('command', command);

    this.setCellSelection(tablePos, direction);
    // Re-show panel and select newly added column after a longer delay to allow DOM to update
    this.showPanel(this.state.tableElement);
  }

  /**
   * Will select the new Added cell
   * @param tablePos - The position of the table in the document
   * @param direction - The direction where the new cell was added ('up', 'down', 'left', 'right')
   */
  private setCellSelection(
    tablePos: number | null = null,
    direction: 'up' | 'down' | 'left' | 'right' = 'down'
  ) {
    const { state, dispatch } = this.view;
    const { doc } = state;

    if (tablePos === null) return;

    try {
      const cellPos = doc.resolve(tablePos);
      const map = TableOffsetMap.create(cellPos);

      if (!map) return;

      // Get the current selection to determine the newly added cell position
      const { selection } = state;
      let targetRowIdx = 0;
      let targetColIdx = 0;

      // If there's a current cell selection, use it as reference
      if (selection instanceof CellSelection) {
        const selectionInfo = map.getRectOffsets(selection.startCell, selection.endCell);

        switch (direction) {
          case 'down':
            // New row was added below, select the first cell of the new row
            targetRowIdx = selectionInfo.endRowIdx + 1;
            targetColIdx = selectionInfo.startColIdx;
            break;
          case 'up':
            // New row was added above, select the first cell of the new row
            targetRowIdx = selectionInfo.startRowIdx - 1;
            targetColIdx = selectionInfo.startColIdx;
            break;
          case 'right':
            // New column was added to the right, select the first cell of the new column
            targetRowIdx = selectionInfo.startRowIdx;
            targetColIdx = selectionInfo.endColIdx + 1;
            break;
          case 'left':
            // New column was added to the left, select the first cell of the new column
            targetRowIdx = selectionInfo.startRowIdx;
            targetColIdx = selectionInfo.startColIdx - 1;
            break;
          default:
            throw new Error(`Unknown direction: ${direction}`);
        }
      } else {
        // No cell selection, determine position based on direction and table bounds
        switch (direction) {
          case 'down':
            targetRowIdx = map.totalRowCount - 1; // Last row (newly added)
            targetColIdx = 0;
            break;
          case 'up':
            targetRowIdx = 1; // First body row (header is 0)
            targetColIdx = 0;
            break;
          case 'right':
            targetRowIdx = 0;
            targetColIdx = map.totalColumnCount - 1; // Last column (newly added)
            break;
          case 'left':
            targetRowIdx = 0;
            targetColIdx = 0; // First column (newly added)
            break;
          default:
            throw new Error(`Unknown direction: ${direction}`);
        }
      }

      // Ensure the target position is within table bounds
      targetRowIdx = Math.max(0, Math.min(targetRowIdx, map.totalRowCount - 1));
      targetColIdx = Math.max(0, Math.min(targetColIdx, map.totalColumnCount - 1));

      // Get the cell offset for the target position
      const { offset: cellOffset } = map.getCellInfo(targetRowIdx, targetColIdx);
      const startCellPos = doc.resolve(cellOffset);

      // Create cell selection for the newly added cell
      const cellSelection = new CellSelection(startCellPos, startCellPos);
      const tr = state.tr.setSelection(cellSelection);

      dispatch(tr);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to select newly added cell:', error);
    }
  }

  destroy() {
    document.removeEventListener('click', this.handleDocumentClick);
    this.view.dom.removeEventListener('click', this.handleTableClick);
    window.removeEventListener('scroll', this.updatePanelPosition.bind(this), true);
    window.removeEventListener('resize', this.updatePanelPosition.bind(this));
    this.hidePanel();
  }
}

export function tableEditPanel(eventEmitter: Emitter) {
  return new Plugin({
    view(editorView) {
      return new TableEditPanelView(editorView, eventEmitter);
    },
  });
}
