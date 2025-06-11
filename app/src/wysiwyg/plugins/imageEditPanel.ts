import { Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { Emitter } from '@t/event';

interface ImageEditPanelState {
  isVisible: boolean;
  imageElement: HTMLElement | null;
  dialog: HTMLElement | null;
  imageNode: any | null;
  imagePos: number | null;
  tempChanges: {
    width?: string | null;
    verticalAlign?: string | null;
    altText?: string;
    caption?: string;
  };
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
      tempChanges: {},
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
    // 重置临时更改状态
    this.state.tempChanges = {};
    this.lastShowTime = Date.now();
    this.createImageDialog();
    this.state.isVisible = true;
  }

  private hidePanel() {
    console.trace('Hiding image edit panel');
    if (this.state.dialog) {
      this.state.dialog.remove();
      this.state.dialog = null;
    }
    this.state.isVisible = false;
    this.state.imageElement = null;
    this.state.imageNode = null;
    this.state.imagePos = null;
    // 清空临时更改
    this.state.tempChanges = {};
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

    const {
      imageUrl = '',
      altText = '',
      width = '',
      verticalAlign = '',
      caption = '',
    } = this.state.imageNode.attrs;

    // 获取当前值（临时更改优先）
    const currentWidth = this.state.tempChanges.width ?? width;
    const currentVerticalAlign = this.state.tempChanges.verticalAlign ?? verticalAlign;
    const currentAltText = this.state.tempChanges.altText ?? altText;
    const currentCaption = this.state.tempChanges.caption ?? caption;

    dialog.innerHTML = `
      <div class="dialog-section">
        <label class="dialog-label">图片大小</label>
        <div class="current-value">当前值: ${currentWidth || '未设置'}</div>
        <div class="size-controls">
          <input type="number" class="size-input" id="width-input" value="${currentWidth}" placeholder="输入宽度" min="1">
          <span class="size-unit">px</span>
          <button type="button" class="clear-btn" id="clear-width" title="清空宽度">清空</button>
        </div>
        <div class="preset-sizes">
          <button type="button" class="preset-btn" data-size="150">150px</button>
          <button type="button" class="preset-btn" data-size="250">250px</button>
          <button type="button" class="preset-btn" data-size="400">400px</button>
        </div>
      </div>
      <div class="dialog-section">
        <label class="dialog-label">垂直对齐</label>
        <div class="current-value">当前值: ${this.getVerticalAlignDisplayName(
          currentVerticalAlign
        )}</div>
        <div class="vertical-align-controls">
          <button type="button" class="align-btn ${
            currentVerticalAlign === 'top' ? 'active' : ''
          }" data-align="top" title="顶部对齐">Top</button>
          <button type="button" class="align-btn ${
            currentVerticalAlign === 'middle' ? 'active' : ''
          }" data-align="middle" title="居中对齐">Middle</button>
          <button type="button" class="align-btn ${
            currentVerticalAlign === 'bottom' ? 'active' : ''
          }" data-align="bottom" title="底部对齐">Bottom</button>
          <button type="button" class="align-btn ${
            currentVerticalAlign === 'baseline' ? 'active' : ''
          }" data-align="baseline" title="基线对齐">Baseline</button>
          <button type="button" class="clear-btn" id="clear-align" title="清空对齐">清空</button>
        </div>
      </div>
      <div class="dialog-section">
        <label class="dialog-label">Alt Text (替代文本)</label>
        <div class="current-value">当前值: ${currentAltText || '未设置'}</div>
        <input type="text" class="alt-input" id="alt-input" value="${currentAltText}" placeholder="描述这张图片...">
      </div>

      <div class="dialog-section">
        <label class="dialog-label">Caption (图片说明)</label>
        <div class="current-value">当前值: ${currentCaption || '未设置'}</div>
        <input type="text" class="caption-input" id="caption-input" value="${currentCaption}" placeholder="图片说明文字...">
      </div>

      <div class="dialog-actions">
        <button type="button" class="save-btn" id="save-changes">保存</button>
        <button type="button" class="reset-btn" id="reset-changes">重置</button>
        <button type="button" class="delete-btn" id="delete-image" title="删除图片">删除图片</button>
      </div>
    `;

    this.bindDialogEvents(dialog);
  }

  private getVerticalAlignDisplayName(align: string): string {
    const alignNames: Record<string, string> = {
      top: '顶部对齐',
      middle: '居中对齐',
      bottom: '底部对齐',
      baseline: '基线对齐',
    };

    return alignNames[align] || '未设置';
  }

  private bindDialogEvents(dialog: HTMLElement) {
    const widthInput = dialog.querySelector('#width-input') as HTMLInputElement;
    const clearWidthBtn = dialog.querySelector('#clear-width') as HTMLButtonElement;
    const presetBtns = dialog.querySelectorAll('.preset-btn') as NodeListOf<HTMLButtonElement>;
    const altInput = dialog.querySelector('#alt-input') as HTMLInputElement;
    const captionInput = dialog.querySelector('#caption-input') as HTMLInputElement;
    const alignBtns = dialog.querySelectorAll('.align-btn') as NodeListOf<HTMLButtonElement>;
    const clearAlignBtn = dialog.querySelector('#clear-align') as HTMLButtonElement;
    const saveBtn = dialog.querySelector('#save-changes') as HTMLButtonElement;
    const resetBtn = dialog.querySelector('#reset-changes') as HTMLButtonElement;
    const deleteBtn = dialog.querySelector('#delete-image') as HTMLButtonElement;

    // 宽度输入事件
    widthInput.addEventListener('input', () => {
      this.state.tempChanges.width = widthInput.value || null;
    });

    // 清空宽度按钮
    clearWidthBtn.addEventListener('click', () => {
      widthInput.value = '';
      this.state.tempChanges.width = null;
    });

    // 预设大小按钮事件
    presetBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const { size } = btn.dataset;

        if (size) {
          widthInput.value = size;
          this.state.tempChanges.width = size;
        }
      });
    });

    // Alt Text 输入事件
    altInput.addEventListener('input', () => {
      this.state.tempChanges.altText = altInput.value;
    });

    // Caption 输入事件
    captionInput.addEventListener('input', () => {
      this.state.tempChanges.caption = captionInput.value;
    });

    // 垂直对齐按钮事件
    alignBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        alignBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const alignment = btn.dataset.align;

        this.state.tempChanges.verticalAlign = alignment || null;
      });
    });

    // 清空垂直对齐按钮事件
    clearAlignBtn.addEventListener('click', () => {
      alignBtns.forEach((btn) => btn.classList.remove('active'));
      this.state.tempChanges.verticalAlign = null;
    });

    // 保存按钮事件
    saveBtn.addEventListener('click', () => {
      this.saveChanges();
    });

    // 重置按钮事件
    resetBtn.addEventListener('click', () => {
      this.resetChanges();
      this.resetFormInputs(dialog);
    });

    // 删除按钮事件
    deleteBtn.addEventListener('click', () => {
      this.deleteImage();
    });

    // 回车键保存
    [widthInput, altInput, captionInput].forEach((input) => {
      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.saveChanges();
        }
      });
    });
  }

  private saveChanges() {
    if (this.state.imagePos === null) return;

    const { tr } = this.view.state;
    const node = tr.doc.nodeAt(this.state.imagePos);

    if (node && node.type.name === 'image' && node.attrs) {
      const newAttrs = { ...node.attrs };

      // 更新URL查询参数
      const currentImageUrl = newAttrs.imageUrl || '';
      const newImageUrl = this.updateImageUrlQueryParams(currentImageUrl);

      if (newImageUrl !== currentImageUrl) {
        newAttrs.imageUrl = newImageUrl;
      }

      // 同时更新节点属性（确保图片立即应用新样式）
      if ('width' in this.state.tempChanges) {
        newAttrs.width = this.state.tempChanges.width;
      }
      if ('verticalAlign' in this.state.tempChanges) {
        newAttrs.verticalAlign = this.state.tempChanges.verticalAlign;
      }
      if ('caption' in this.state.tempChanges) {
        newAttrs.caption = this.state.tempChanges.caption;
      }
      if ('altText' in this.state.tempChanges) {
        newAttrs.altText = this.state.tempChanges.altText;
      }

      tr.setNodeMarkup(this.state.imagePos, null, newAttrs);
      this.view.dispatch(tr);

      // 清空临时更改
      this.state.tempChanges = {};

      // 更新节点引用
      const updatedNode = this.view.state.doc.nodeAt(this.state.imagePos);

      if (updatedNode) {
        this.state.imageNode = updatedNode;
      }

      // 刷新对话框以显示保存后的状态
      this.refreshDialog();
    }
  }

  private updateImageUrlQueryParams(originalUrl: string): string {
    try {
      // 分离基础URL和查询参数
      const [baseUrl, queryString] = originalUrl.split('?');

      // 解析现有的查询参数
      const queryParams = new Map<string, string>();

      if (queryString) {
        queryString.split('&').forEach((pair) => {
          const [key, value] = pair.split('=');

          if (key) {
            queryParams.set(key, decodeURIComponent(value || ''));
          }
        });
      }

      // 应用临时更改
      if ('width' in this.state.tempChanges) {
        if (this.state.tempChanges.width) {
          queryParams.set('width', this.state.tempChanges.width);
        } else {
          queryParams.delete('width');
        }
      }

      if ('verticalAlign' in this.state.tempChanges) {
        if (this.state.tempChanges.verticalAlign) {
          queryParams.set('verticalAlign', this.state.tempChanges.verticalAlign);
        } else {
          queryParams.delete('verticalAlign');
        }
      }

      if ('caption' in this.state.tempChanges) {
        if (this.state.tempChanges.caption) {
          queryParams.set('caption', this.state.tempChanges.caption);
        } else {
          queryParams.delete('caption');
        }
      }

      // 重建URL
      if (queryParams.size === 0) {
        return baseUrl;
      }

      const newQueryString = Array.from(queryParams.entries())
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');

      return `${baseUrl}?${newQueryString}`;
    } catch (error) {
      console.error('Error updating image URL query params:', error);
      return originalUrl;
    }
  }

  private resetChanges() {
    this.state.tempChanges = {};
  }

  private resetFormInputs(dialog: HTMLElement) {
    if (!this.state.imageNode) return;

    const {
      width = '',
      verticalAlign = '',
      altText = '',
      caption = '',
    } = this.state.imageNode.attrs;

    // 重置输入框的值为原始值
    const widthInput = dialog.querySelector('#width-input') as HTMLInputElement;
    const altInput = dialog.querySelector('#alt-input') as HTMLInputElement;
    const captionInput = dialog.querySelector('#caption-input') as HTMLInputElement;
    const alignBtns = dialog.querySelectorAll('.align-btn') as NodeListOf<HTMLButtonElement>;

    if (widthInput) {
      widthInput.value = width;
    }
    if (altInput) {
      altInput.value = altText;
    }
    if (captionInput) {
      captionInput.value = caption;
    }

    // 重置垂直对齐按钮状态
    alignBtns.forEach((btn) => {
      btn.classList.remove('active');
      if (btn.dataset.align === verticalAlign) {
        btn.classList.add('active');
      }
    });
  }

  private refreshDialog() {
    if (!this.state.dialog) return;

    this.createDialogContent(this.state.dialog);
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
