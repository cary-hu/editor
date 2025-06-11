import { Plugin, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Emitter } from '@t/event';

interface ImageEditPanelState {
  isVisible: boolean;
  imageElement: HTMLElement | null;
  dialog: HTMLElement | null;
  imageNode: any | null;
  imagePos: number | null;
}

class ImageEditPanelView {
  private eventEmitter: Emitter;

  private view: EditorView;

  private state: ImageEditPanelState;

  private lastShowTime = 0;

  private updateTimer: number | null = null;

  private currentMousePosition: { x: number; y: number } | null = null;

  constructor(view: EditorView, eventEmitter: Emitter) {
    this.view = view;
    this.eventEmitter = eventEmitter;
    this.state = {
      isVisible: false,
      imageElement: null,
      dialog: null,
      imageNode: null,
      imagePos: null,
    };
    this.handleDocumentClick = this.handleDocumentClick.bind(this);
    this.handleImageHover = this.handleImageHover.bind(this);
    this.handleImageLeave = this.handleImageLeave.bind(this);
    this.init();
  }

  private init() {
    // Listen for clicks on the document
    document.addEventListener('click', this.handleDocumentClick);

    // Track mouse position globally
    document.addEventListener('mousemove', (event) => {
      this.currentMousePosition = { x: event.clientX, y: event.clientY };
    });

    // Listen for image hover events
    this.view.dom.addEventListener('mouseenter', this.handleImageHover, true);
    this.view.dom.addEventListener('mouseleave', this.handleImageLeave, true);

    // Listen for scroll events to update panel position with sticky behavior
    window.addEventListener('scroll', this.handleScroll.bind(this), true);
    this.view.dom.addEventListener('scroll', this.handleScroll.bind(this), true);
    window.addEventListener('resize', this.handleResize.bind(this));

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

    // If clicking outside image or panel, hide the panel
    if (!this.isImageOrPanelElement(target)) {
      this.hidePanel();
    }
  }

  private handleImageHover(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const imageElement = target.closest('img');

    if (imageElement) {
      // If we're hovering over a different image than the one currently being edited
      if (this.state.imageElement !== imageElement) {
        // Find the image node in the ProseMirror document
        const pos = this.view.posAtDOM(imageElement, 0);

        if (pos !== null) {
          const node = this.view.state.doc.nodeAt(pos);

          // Make sure we have a valid image node with attrs
          if (node && node.type.name === 'image' && node.attrs) {
            this.showPanel(imageElement, node, pos);
          }
        }
      }
    }
  }

  private handleImageLeave(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const relatedTarget = event.relatedTarget as HTMLElement;

    // Don't hide if moving to panel or its elements
    if (relatedTarget && this.isImageOrPanelElement(relatedTarget)) {
      return;
    }

    // Check if we're actually leaving the image area
    const imageElement = target.closest('img');

    if (imageElement && this.state.imageElement === imageElement) {
      // Add a delay to prevent flickering when moving between elements
      setTimeout(() => {
        // Check if we're still working with the same image
        if (this.state.imageElement !== imageElement) {
          // We've moved to a different image, don't hide the panel
          return;
        }

        // Check the current mouse position to see if we're over a valid element
        const currentMousePosition = this.getCurrentMousePosition();

        if (currentMousePosition) {
          const hoveredElement = document.elementFromPoint(
            currentMousePosition.x,
            currentMousePosition.y
          ) as HTMLElement;

          if (hoveredElement && !this.isImageOrPanelElement(hoveredElement)) {
            this.hidePanel();
          }
        } else {
          // If we can't get mouse position, hide the panel
          this.hidePanel();
        }
      }, 100); // 100ms delay to allow for mouse movement to dialog
    }
  }

  private isImageOrPanelElement(element: HTMLElement): boolean {
    return !!(
      element.closest('img') ||
      element.closest('.toastui-editor-image-edit-dialog') ||
      element.classList.contains('toastui-editor-image-edit-dialog') ||
      element.classList.contains('dialog-section') ||
      element.classList.contains('dialog-label') ||
      element.classList.contains('size-controls') ||
      element.classList.contains('size-input') ||
      element.classList.contains('size-unit') ||
      element.classList.contains('size-lock') ||
      element.classList.contains('vertical-align-controls') ||
      element.classList.contains('align-btn') ||
      element.classList.contains('caption-input') ||
      element.classList.contains('danger-zone') ||
      element.classList.contains('delete-btn') ||
      element.classList.contains('toastui-editor-edit-image-btn') ||
      element.classList.contains('toastui-editor-delete-image-btn') ||
      element.classList.contains('toastui-editor-resize-handle')
    );
  }

  private showPanel(imageElement: HTMLElement, imageNode: any, imagePos: number) {
    // Hide existing dialog if any
    this.hidePanel();

    this.state.imageElement = imageElement;
    this.state.imageNode = imageNode;
    this.state.imagePos = imagePos;
    this.lastShowTime = Date.now();
    this.createImageDialog();
    this.state.isVisible = true;
  }

  private hidePanel() {
    if (this.state.dialog) {
      this.state.dialog.remove();
      this.state.dialog = null;
    }
    this.state.isVisible = false;
    this.state.imageElement = null;
    this.state.imageNode = null;
    this.state.imagePos = null;
  }

  private updatePanelPosition() {
    if (!this.state.dialog || !this.state.imageElement) return;

    const imageRect = this.state.imageElement.getBoundingClientRect();
    const editorRect = this.view.dom.getBoundingClientRect();

    // Find the dedicated panel container for positioning reference
    const editorContainer = this.view.dom.closest('.toastui-editor-container') as HTMLElement;
    let panelContainer: HTMLElement | null = null;

    if (editorContainer) {
      panelContainer = editorContainer.querySelector('.toastui-edit-panel-container');
    }

    if (!panelContainer) {
      console.warn('Panel container not found, positioning may be incorrect');
      return;
    }

    const containerRect = panelContainer.getBoundingClientRect();
    let topBoundary = 0; // Relative to panel container
    let bottomBoundary = containerRect.height; // Relative to panel container

    // Find toolbar boundary (relative to panel container)
    const toolbar = editorContainer?.querySelector('.toastui-editor-toolbar');

    if (toolbar) {
      const toolbarRect = toolbar.getBoundingClientRect();

      topBoundary = Math.max(0, toolbarRect.bottom - containerRect.top);
    }

    // Find status bar boundary (relative to panel container)
    const statusBar = editorContainer?.querySelector('.toastui-editor-mode-switch');

    if (statusBar) {
      const statusBarRect = statusBar.getBoundingClientRect();

      bottomBoundary = Math.min(containerRect.height, statusBarRect.top - containerRect.top);
    }

    // Calculate relative positions (relative to panel container)
    const imageRelativeTop = imageRect.top - containerRect.top;
    const imageRelativeRight = imageRect.right - containerRect.left;
    const imageRelativeLeft = imageRect.left - containerRect.left;

    // Position dialog horizontally
    const dialogWidth = 280;
    const containerWidth = containerRect.width;
    const spaceToRight = containerWidth - imageRelativeRight;
    const spaceToLeft = imageRelativeLeft;

    let left = imageRelativeRight + 10; // 10px gap

    if (spaceToRight < dialogWidth + 20 && spaceToLeft > dialogWidth + 20) {
      left = imageRelativeLeft - dialogWidth - 10;
    }

    // Ensure dialog doesn't go off container horizontally
    left = Math.max(10, Math.min(left, containerWidth - dialogWidth - 10));

    // Position dialog vertically with sticky behavior
    let top = imageRelativeTop;

    // Get actual dialog height instead of using fixed value
    const dialogHeight = this.state.dialog.offsetHeight || 350; // Fallback to 350 if not rendered yet

    const padding = 3;

    // Calculate the visible portion of the image relative to editor
    const editorRelativeTop = Math.max(0, editorRect.top - containerRect.top);
    const editorRelativeBottom = Math.min(
      containerRect.height,
      editorRect.bottom - containerRect.top
    );
    const visibleImageTop = Math.max(imageRelativeTop, editorRelativeTop);
    const visibleImageBottom = Math.min(imageRelativeTop + imageRect.height, editorRelativeBottom);
    const visibleImageHeight = visibleImageBottom - visibleImageTop;

    // Check if dialog would fit if positioned at image top
    const wouldFitAtImageTop = imageRelativeTop + dialogHeight <= bottomBoundary - padding;

    // Sticky behavior: position dialog optimally based on available space
    if (visibleImageHeight > 0) {
      if (imageRelativeTop >= editorRelativeTop) {
        // Image top is visible
        if (wouldFitAtImageTop) {
          // Position at image top if there's enough space
          top = imageRelativeTop;
        } else {
          // Not enough space below image - position dialog so its bottom edge aligns with status bar
          const minPadding = 2; // Minimal padding from status bar

          top = bottomBoundary - dialogHeight - minPadding;

          // Ensure dialog doesn't go above the toolbar
          if (top < topBoundary + minPadding) {
            top = topBoundary + minPadding;
          }
        }
      } else {
        // Image top is above viewport - stick to toolbar boundary
        top = topBoundary + padding;
      }
    }

    // Set dialog position relative to panel container
    this.state.dialog.style.position = 'absolute';
    this.state.dialog.style.left = `${left}px`;
    this.state.dialog.style.top = `${top}px`;
  }

  private createImageDialog() {
    if (!this.state.imageElement || !this.state.imageNode) return;

    const dialog = document.createElement('div');

    dialog.className = 'toastui-editor-image-edit-dialog';

    // Create dialog content first
    this.createDialogContent(dialog);

    // Add event listeners
    dialog.addEventListener('mouseenter', () => {
      // Keep dialog visible when hovering over it
    });

    dialog.addEventListener('mouseleave', (event) => {
      const relatedTarget = event.relatedTarget as HTMLElement;

      if (!relatedTarget || !this.isImageOrPanelElement(relatedTarget)) {
        this.hidePanel();
      }
    });

    // Add to dedicated edit panel container
    const editorContainer = this.view.dom.closest('.toastui-editor-container') as HTMLElement;
    let panelContainer: HTMLElement | null = null;

    if (editorContainer) {
      panelContainer = editorContainer.querySelector('.toastui-edit-panel-container');
    }

    if (panelContainer) {
      panelContainer.appendChild(dialog);
    } else {
      // Fallback to editor container if panel container not found
      console.warn('Edit panel container not found, falling back to editor container');
      if (editorContainer) {
        editorContainer.appendChild(dialog);
      } else {
        this.view.dom.appendChild(dialog);
      }
    }

    this.state.dialog = dialog;

    // Position the dialog after it's added to DOM and fully rendered
    requestAnimationFrame(() => {
      this.updatePanelPosition();
    });
  }

  private createDialogContent(dialog: HTMLElement) {
    if (!this.state.imageNode) return;

    const { imageUrl = '', altText = '', width = '' } = this.state.imageNode.attrs;

    dialog.innerHTML = `
      <div class="dialog-section">
        <label class="dialog-label">图片大小</label>
        <div class="size-controls">
          <input type="number" class="size-input" id="width-input" value="${width}" placeholder="原始大小" min="1">
          <span class="size-unit">px</span>
          <button type="button" class="apply-btn" id="apply-size">确认</button>
          <button type="button" class="clear-btn" id="clear-size">清空</button>
        </div>
        <div class="preset-sizes">
          <button type="button" class="preset-btn" data-size="150">150px</button>
          <button type="button" class="preset-btn" data-size="250">250px</button>
          <button type="button" class="preset-btn" data-size="400">400px</button>
        </div>
      </div>
      
      <div class="dialog-section">
        <label class="dialog-label">垂直对齐</label>
        <div class="vertical-align-controls">
          <button type="button" class="align-btn" data-align="top" title="顶部对齐">Top</button>
          <button type="button" class="align-btn" data-align="middle" title="居中对齐">Middle</button>
          <button type="button" class="align-btn" data-align="bottom" title="底部对齐">Bottom</button>
          <button type="button" class="align-btn" data-align="baseline" title="基线对齐">Baseline</button>
          <button type="button" class="clear-btn" id="clear-align" title="清空对齐">清空</button>
        </div>
      </div>
      
      <div class="dialog-section">
        <label class="dialog-label">Alt Text</label>
        <input type="text" class="caption-input" value="${altText}" placeholder="描述这张图片...">
        <div class="caption-actions">
          <button type="button" class="apply-btn" id="apply-caption">确认</button>
          <button type="button" class="clear-btn" id="clear-caption">清空</button>
        </div>
      </div>

       <div class="dialog-section">
        <label class="dialog-label">Caption</label>
        <input type="text" class="caption-input" value="${altText}" placeholder="描述这张图片...">
        <div class="caption-actions">
          <button type="button" class="apply-btn" id="apply-caption">确认</button>
          <button type="button" class="clear-btn" id="clear-caption">清空</button>
        </div>
      </div>

      <button>Save</button>
      <button>Reset</button>
      <button>Delete Image</button>
      <div class="dialog-section danger-zone">
        <button type="button" class="delete-btn" title="删除图片">🗑</button>
      </div>
    `;

    this.bindDialogEvents(dialog);
  }

  private bindDialogEvents(dialog: HTMLElement) {
    const widthInput = dialog.querySelector('#width-input') as HTMLInputElement;
    const applySizeBtn = dialog.querySelector('#apply-size') as HTMLButtonElement;
    const clearSizeBtn = dialog.querySelector('#clear-size') as HTMLButtonElement;
    const presetBtns = dialog.querySelectorAll('.preset-btn') as NodeListOf<HTMLButtonElement>;
    const captionInput = dialog.querySelector('.caption-input') as HTMLInputElement;
    const applyCaptionBtn = dialog.querySelector('#apply-caption') as HTMLButtonElement;
    const clearCaptionBtn = dialog.querySelector('#clear-caption') as HTMLButtonElement;
    const deleteBtn = dialog.querySelector('.delete-btn') as HTMLButtonElement;
    const alignBtns = dialog.querySelectorAll('.align-btn') as NodeListOf<HTMLButtonElement>;
    const clearAlignBtn = dialog.querySelector('#clear-align') as HTMLButtonElement;

    // 预设大小按钮事件
    presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const { size } = btn.dataset;

        if (size) {
          widthInput.value = size;
          this.updateImageSizeFromInput(size);
        }
      });
    });

    // 确认大小按钮事件
    applySizeBtn.addEventListener('click', () => {
      const width = widthInput.value;

      if (width) {
        this.updateImageSizeFromInput(width);
      }
    });

    // 清空大小按钮事件
    clearSizeBtn.addEventListener('click', () => {
      widthInput.value = '';
      this.updateImageAttributes({ width: null, height: null });
    });

    // 宽度输入框事件（回车确认）
    widthInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const width = widthInput.value;

        if (width) {
          this.updateImageSizeFromInput(width);
        }
      }
    });

    // 确认说明按钮事件
    applyCaptionBtn.addEventListener('click', () => {
      this.updateImageAttributes({ altText: captionInput.value });
    });

    // 清空说明按钮事件
    clearCaptionBtn.addEventListener('click', () => {
      captionInput.value = '';
      this.updateImageAttributes({ altText: '' });
    });

    // 说明输入框事件（回车确认）
    captionInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.updateImageAttributes({ altText: captionInput.value });
      }
    });

    // 垂直对齐按钮事件
    alignBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        alignBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const alignment = btn.dataset.align;

        // TODO: 实现垂直对齐功能
        console.log('垂直对齐设置为:', alignment);
      });
    });

    // 清空垂直对齐按钮事件
    clearAlignBtn.addEventListener('click', () => {
      alignBtns.forEach((btn) => btn.classList.remove('active'));
      // TODO: 实现清空垂直对齐功能
      console.log('垂直对齐已清空');
    });

    // 删除按钮事件
    deleteBtn.addEventListener('click', () => {
      this.deleteImage();
    });
  }

  private deleteImage() {
    if (this.state.imagePos === null) return;

    // Hide the panel first
    this.hidePanel();

    // Delete the image from the document
    const { tr } = this.view.state;

    tr.delete(this.state.imagePos, this.state.imagePos + 1);
    this.view.dispatch(tr);
  }

  private updateImageSizeFromInput(widthValue: string) {
    const width = widthValue ? parseInt(widthValue, 10) : null;
    // Get other attr and merge with width, then edit recreateImage with new attrs
  }

  private updateImageAttributes(attrs: Record<string, any>) {
    if (this.state.imagePos === null) return;

    const { tr } = this.view.state;
    const node = tr.doc.nodeAt(this.state.imagePos);

    if (node && node.type.name === 'image' && node.attrs) {
      const newAttrs = { ...node.attrs, ...attrs };

      tr.setNodeMarkup(this.state.imagePos, null, newAttrs);
      this.view.dispatch(tr);
    }
  }

  private handleInput() {
    // Clear existing timer
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }

    // Debounce updates to avoid excessive recalculation
    this.updateTimer = window.setTimeout(() => {
      if (this.state.isVisible && this.state.imageElement) {
        this.updatePanelPosition();
      }
      this.updateTimer = null;
    }, 50); // 50ms debounce
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
      if (this.state.isVisible && this.state.imageElement) {
        this.updatePanelPosition();
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
    this.view.dom.removeEventListener('mouseenter', this.handleImageHover, true);
    this.view.dom.removeEventListener('mouseleave', this.handleImageLeave, true);
    this.view.dom.removeEventListener('input', this.handleInput.bind(this));
    this.view.dom.removeEventListener('keyup', this.handleInput.bind(this));
    this.view.dom.removeEventListener('scroll', this.handleScroll.bind(this), true);
    window.removeEventListener('scroll', this.handleScroll.bind(this), true);
    window.removeEventListener('resize', this.handleResize.bind(this));

    // Clean up mouse position tracking
    this.currentMousePosition = null;

    this.hidePanel();
  }

  private getCurrentMousePosition(): { x: number; y: number } | null {
    return this.currentMousePosition;
  }

  private handleScroll() {
    if (!this.state.isVisible || !this.state.imageElement) return;

    // Check if image is still visible in the editor viewport
    if (!this.isImageVisible()) {
      this.hidePanel();
    } else {
      // Update panel position with sticky behavior during scroll
      this.updatePanelPosition();
    }
  }

  private handleResize() {
    if (!this.state.isVisible || !this.state.imageElement) return;

    // Check if image is still visible after resize
    if (!this.isImageVisible()) {
      this.hidePanel();
    } else {
      // Update position if image is still visible
      this.updatePanelPosition();
    }
  }

  private isImageVisible(): boolean {
    if (!this.state.imageElement) return false;

    const imageRect = this.state.imageElement.getBoundingClientRect();
    const editorRect = this.view.dom.getBoundingClientRect();

    // Check if image is within the editor's visible area
    return (
      imageRect.bottom > editorRect.top &&
      imageRect.top < editorRect.bottom &&
      imageRect.right > editorRect.left &&
      imageRect.left < editorRect.right
    );
  }
}

export function imageEditPanel(eventEmitter: Emitter) {
  let imageEditPanelView: ImageEditPanelView | null = null;

  return new Plugin({
    view(editorView) {
      imageEditPanelView = new ImageEditPanelView(editorView, eventEmitter);
      return imageEditPanelView;
    },
    state: {
      init() {
        return null;
      },
      apply(tr, oldState) {
        // When the document changes, update the panel if it's visible
        if (imageEditPanelView && imageEditPanelView.isVisible() && tr.docChanged) {
          // Use requestAnimationFrame to ensure DOM has updated
          requestAnimationFrame(() => {
            if (imageEditPanelView) {
              imageEditPanelView.handleDocumentChange();
            }
          });
        }
        return oldState;
      },
    },
  });
}
