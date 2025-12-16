import { EditorOptions, ViewerOptions } from '@t/editor';
import { DefaultUI, VNode, IndexList, ToolbarItemOptions } from '@t/ui';
import EditorCore from './editorCore';
import Viewer from './viewer';
import html from './ui/vdom/template';
import { Layout } from './ui/components/layout';
import { render } from './ui/vdom/renderer';

/**
 * ToastUI Editor
 * @extends ToastUIEditorCore
 */
class ToastUIEditor extends EditorCore {
  private defaultUI!: DefaultUI;
  private themeObserver!: MutationObserver;

  constructor(options: EditorOptions) {
    super(options);

    let layoutComp!: Layout;
    const destroy = render(
      this.options.el,
      html`
        <${Layout}
          ref=${(layout: Layout) => (layoutComp = layout)}
          eventEmitter=${this.eventEmitter}
          slots=${this.getEditorElements()}
          hideModeSwitch=${this.options.hideModeSwitch}
          toolbarItems=${this.options.toolbarItems}
          previewStyle=${this.options.previewStyle}
          editorType=${this.options.initialEditType || 'markdown'}
          theme=${this.options.theme}
        />
      ` as VNode
    );

    this.setMinHeight(this.options.minHeight);
    this.setHeight(this.options.height);
    this.defaultUI = {
      insertToolbarItem: layoutComp.insertToolbarItem.bind(layoutComp),
      removeToolbarItem: layoutComp.removeToolbarItem.bind(layoutComp),
      destroy: () => {
        this.removeThemeObserver();
        destroy();
      },
    };

    this.pluginInfo.toolbarItems?.forEach((toolbarItem) => {
      const { groupIndex, itemIndex, item } = toolbarItem;

      this.defaultUI.insertToolbarItem({ groupIndex, itemIndex }, item);
    });

    this.initThemeObserver();

    this.eventEmitter.emit('loadUI', this);
  }

  private initThemeObserver() {
    // Check if there's already a theme attribute on the document element
    const initialTheme = document.documentElement.getAttribute('data-toastui-editor-theme');
    if (initialTheme && initialTheme !== this.options.theme) {
      this.setTheme(initialTheme);
    }

    this.themeObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-toastui-editor-theme') {
          const target = mutation.target as HTMLElement;
          const newTheme = target.getAttribute('data-toastui-editor-theme');
          if (newTheme && newTheme !== this.options.theme) {
            this.setTheme(newTheme);
          }
        }
      }
    });

    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-toastui-editor-theme']
    });
  }

  private removeThemeObserver() {
    this.themeObserver?.disconnect();
  }

  /**
   * Factory method for Editor
   * @param {object} options Option for initialize TUIEditor
   * @returns {object} ToastUIEditor or ToastUIEditorViewer
   */
  static factory(options: (EditorOptions | ViewerOptions) & { viewer?: boolean }) {
    return options.viewer ? new Viewer(options) : new ToastUIEditor(options as EditorOptions);
  }

  /**
   * add toolbar item
   * @param {Object} indexInfo group index and item index of the toolbar item
   * @param {string|Object} item toolbar item
   */
  insertToolbarItem(indexInfo: IndexList, item: string | ToolbarItemOptions) {
    this.defaultUI.insertToolbarItem(indexInfo, item);
  }

  /**
   * Remove toolbar item
   * @param {string} itemName toolbar item name
   */
  removeToolbarItem(itemName: string) {
    this.defaultUI.removeToolbarItem(itemName);
  }

  /**
   * Destroy TUIEditor from document
   */
  destroy() {
    super.destroy();
    this.defaultUI.destroy();
  }
}

export default ToastUIEditor;
