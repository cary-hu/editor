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

  private updateTimer: number | null = null;

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

    // Listen for input events to update panel when content changes
    this.view.dom.addEventListener('input', this.handleInput.bind(this));
    this.view.dom.addEventListener('keyup', this.handleInput.bind(this));
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
    panel.style.left = `${tableRect.left + viewportOffset.left}px`;
    panel.style.top = `${tableRect.top + viewportOffset.top}px`;
    panel.style.width = `${tableRect.width}px`;
    panel.style.height = `${tableRect.height}px`;

    // Add to document body instead of editor DOM to avoid ProseMirror DOMObserver
    document.body.appendChild(panel);
    this.state.panel = panel;
  }

  private createOverlay() {
    if (!this.state.panel || !this.state.tableElement) return;

    const overlay = document.createElement('div');

    overlay.className = 'toastui-editor-table-edit-overlay';

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
      hoverContainer.style.top = `${dividerY - 7}px`; // Expanded hover area

      // Create add row button (initially hidden)
      const addRowBtn = document.createElement('div');

      addRowBtn.className = 'toastui-editor-add-row-btn';
      addRowBtn.innerHTML = '+';
      addRowBtn.title = index === 0 ? 'Add row after header' : 'Add row below';

      // Append button to container
      hoverContainer.appendChild(addRowBtn);

      // Hover events for the container (includes both zone and button)
      hoverContainer.addEventListener('mouseenter', () => {
        addRowBtn.style.display = 'flex';
        addRowBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      });

      hoverContainer.addEventListener('mouseleave', () => {
        addRowBtn.style.display = 'none';
      });

      // Prevent hover container from interfering with cell selection
      hoverContainer.addEventListener('click', (event) => {
        // Only allow clicks on the button, block all other clicks
        if (event.target !== addRowBtn) {
          event.stopPropagation();
          event.preventDefault();
        }
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
      hoverContainer.style.left = `${dividerX - 7}px`; // Expanded hover area

      // Create add column button (initially hidden)
      const addColBtn = document.createElement('div');

      addColBtn.className = 'toastui-editor-add-col-btn';
      addColBtn.innerHTML = '+';
      addColBtn.title = 'Add column left';

      // Append button to container
      hoverContainer.appendChild(addColBtn);

      // Hover events for the container
      hoverContainer.addEventListener('mouseenter', () => {
        addColBtn.style.display = 'flex';
        addColBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      });

      hoverContainer.addEventListener('mouseleave', () => {
        addColBtn.style.display = 'none';
      });

      // Prevent hover container from interfering with cell selection
      hoverContainer.addEventListener('click', (event) => {
        // Only allow clicks on the button, block all other clicks
        if (event.target !== addColBtn) {
          event.stopPropagation();
          event.preventDefault();
        }
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
      hoverContainer.style.left = `${dividerX - 7}px`; // Expanded hover area

      // Create add column button (initially hidden)
      const addColBtn = document.createElement('div');

      addColBtn.className = 'toastui-editor-add-col-btn';
      addColBtn.innerHTML = '+';
      addColBtn.title = 'Add column right';

      // Append button to container
      hoverContainer.appendChild(addColBtn);

      // Hover events for the container
      hoverContainer.addEventListener('mouseenter', () => {
        addColBtn.style.display = 'flex';
        addColBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      });

      hoverContainer.addEventListener('mouseleave', () => {
        addColBtn.style.display = 'none';
      });

      // Prevent hover container from interfering with cell selection
      hoverContainer.addEventListener('click', (event) => {
        // Only allow clicks on the button, block all other clicks
        if (event.target !== addColBtn) {
          event.stopPropagation();
          event.preventDefault();
        }
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

  private handleInput() {
    // Clear existing timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    // Debounce updates to avoid excessive recalculation
    this.updateTimer = window.setTimeout(() => {
      if (this.state.isVisible && this.state.tableElement) {
        this.updatePanelPosition();
        this.recreateDividers();
      }
      this.updateTimer = null;
    }, 50); // 50ms debounce
  }

  private recreateDividers() {
    if (!this.state.panel || !this.state.tableElement) return;

    // Check if table structure actually changed
    const currentRows = this.state.tableElement.querySelectorAll('tr').length;
    const currentCols =
      this.state.tableElement.querySelector('tr')?.querySelectorAll('th, td').length || 0;

    const existingRowDividers = this.state.panel.querySelectorAll(
      '.toastui-editor-row-divider-container'
    ).length;
    const existingColDividers = this.state.panel.querySelectorAll(
      '.toastui-editor-col-divider-container'
    ).length;

    // Only recreate if the structure actually changed
    const rowsChanged = currentRows !== existingRowDividers;
    const colsChanged = currentCols + 1 !== existingColDividers; // +1 because we have one extra divider before first column

    if (rowsChanged || colsChanged) {
      // Remove existing dividers
      const existingDividers = this.state.panel.querySelectorAll(
        '.toastui-editor-row-divider-container, .toastui-editor-col-divider-container'
      );

      existingDividers.forEach((divider) => divider.remove());

      // Recreate dividers with updated table structure
      this.createRowDividers();
      this.createColumnDividers();
    }
  }

  isVisible(): boolean {
    return this.state.isVisible;
  }

  handleDocumentChange() {
    // Clear existing timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    // Debounce updates to avoid excessive recalculation during rapid changes
    this.updateTimer = window.setTimeout(() => {
      if (this.state.isVisible && this.state.tableElement) {
        this.updatePanelPosition();
        this.recreateDividers();
      }
      this.updateTimer = null;
    }, 50); // 50ms debounce
  }

  destroy() {
    // Clear any pending updates
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }

    document.removeEventListener('click', this.handleDocumentClick);
    this.view.dom.removeEventListener('click', this.handleTableClick);
    this.view.dom.removeEventListener('input', this.handleInput.bind(this));
    this.view.dom.removeEventListener('keyup', this.handleInput.bind(this));
    window.removeEventListener('scroll', this.updatePanelPosition.bind(this), true);
    window.removeEventListener('resize', this.updatePanelPosition.bind(this));
    this.hidePanel();
  }
}

export function tableEditPanel(eventEmitter: Emitter) {
  let tableEditPanelView: TableEditPanelView | null = null;

  return new Plugin({
    view(editorView) {
      tableEditPanelView = new TableEditPanelView(editorView, eventEmitter);
      return tableEditPanelView;
    },
    state: {
      init() {
        return null;
      },
      apply(tr, oldState) {
        // When the document changes, update the panel if it's visible
        if (tableEditPanelView && tableEditPanelView.isVisible() && tr.docChanged) {
          // Use requestAnimationFrame to ensure DOM has updated
          requestAnimationFrame(() => {
            if (tableEditPanelView) {
              tableEditPanelView.handleDocumentChange();
            }
          });
        }
        return oldState;
      },
    },
  });
}
