import { ToastMark } from '@toast-ui/toastmark';
import forEachOwnProperties from 'tui-code-snippet/collection/forEachOwnProperties';
import extend from 'tui-code-snippet/object/extend';
import on from 'tui-code-snippet/domEvent/on';
import off from 'tui-code-snippet/domEvent/off';

import { CustomHTMLRenderer, ViewerOptions } from '@t/editor';
import { Emitter, EventTypes, Handler } from '@t/event';
import MarkdownPreview from './markdown/mdPreview';
import { getPluginInfo } from './helper/plugin';
import { last, sanitizeLinkAttribute } from './utils/common';
import EventEmitter from './event/eventEmitter';
import { cls, isPositionInBox, toggleClass } from './utils/dom';
import { registerTagWhitelistIfPossible, sanitizeHTML } from './sanitizer/htmlSanitizer';
import { tableMarkdownParsers } from './plugins/table/markdown-parser';
import addClass from 'tui-code-snippet/domUtil/addClass';
import css from 'tui-code-snippet/domUtil/css';
import removeClass from 'tui-code-snippet/domUtil/removeClass';
import isString from 'tui-code-snippet/type/isString';

const TASK_ATTR_NAME = 'data-task';
const DISABLED_TASK_ATTR_NAME = 'data-task-disabled';
const TASK_CHECKED_CLASS_NAME = 'checked';

function registerHTMLTagToWhitelist(convertorMap: CustomHTMLRenderer) {
  ['htmlBlock', 'htmlInline'].forEach((htmlType) => {
    if (convertorMap[htmlType]) {
      // register tag white list for preventing to remove the html in sanitizer
      Object.keys(convertorMap[htmlType]!).forEach((type) => registerTagWhitelistIfPossible(type));
    }
  });
}

/**
 * Class ToastUIEditorViewer
 * @param {object} options Option object
 *     @param {HTMLElement} options.el - container element
 *     @param {string} [options.initialValue] Editor's initial value
 *     @param {Object} [options.events] - Events
 *         @param {function} [options.events.load] - It would be emitted when editor fully load
 *         @param {function} [options.events.change] - It would be emitted when content changed
 *         @param {function} [options.events.caretChange] - It would be emitted when format change by cursor position
 *         @param {function} [options.events.focus] - It would be emitted when editor get focus
 *         @param {function} [options.events.blur] - It would be emitted when editor loose focus
 *     @param {Array.<function|Array>} [options.plugins] - Array of plugins. A plugin can be either a function or an array in the form of [function, options].
 *     @param {Object} [options.extendedAutolinks] - Using extended Autolinks specified in GFM spec
 *     @param {Object} [options.linkAttributes] - Attributes of anchor element that should be rel, target, hreflang, type
 *     @param {Object} [options.customHTMLRenderer=null] - Object containing custom renderer functions correspond to change markdown node to preview HTML or wysiwyg node
 *     @param {boolean} [options.referenceDefinition=false] - whether use the specification of link reference definition
 *     @param {function} [options.customHTMLSanitizer=null] - custom HTML sanitizer
 *     @param {boolean} [options.frontMatter=false] - whether use the front matter
 *     @param {string} [options.theme] - The theme to style the viewer with. The default is included in toastui-editor.css.
 */
class ToastUIEditorViewer {
  private options: Required<ViewerOptions>;

  private toastMark: ToastMark;

  private eventEmitter: Emitter;

  private preview: MarkdownPreview;
  private themeObserver!: MutationObserver;
  private height!: string;

  private minHeight!: string;

  constructor(options: ViewerOptions) {
    this.options = extend(
      {
        linkAttributes: null,
        extendedAutolinks: false,
        customHTMLRenderer: null,
        referenceDefinition: false,
        customHTMLSanitizer: null,
        frontMatter: false,
        usageStatistics: true,
        theme: 'light',
        height: '300px',
        minHeight: '200px',
      },
      options
    );
    this.eventEmitter = new EventEmitter();

    const linkAttributes = sanitizeLinkAttribute(this.options.linkAttributes);
    const { toHTMLRenderers, markdownParsers } =
      getPluginInfo({
        plugins: this.options.plugins,
        eventEmitter: this.eventEmitter,
        usageStatistics: this.options.usageStatistics,
        instance: this,
      }) || {};
    const {
      customHTMLRenderer,
      extendedAutolinks,
      referenceDefinition,
      frontMatter,
      customHTMLSanitizer,
    } = this.options;

    const rendererOptions = {
      linkAttributes,
      customHTMLRenderer: { ...toHTMLRenderers, ...customHTMLRenderer },
      extendedAutolinks,
      referenceDefinition,
      frontMatter,
      sanitizer: customHTMLSanitizer || sanitizeHTML,
    };

    registerHTMLTagToWhitelist(rendererOptions.customHTMLRenderer);

    if (this.options.events) {
      forEachOwnProperties(this.options.events, (fn, key) => {
        this.on(key, fn);
      });
    }

    const { el, initialValue, theme } = this.options;
    const existingHTML = el.innerHTML;
    el.classList.add(cls('container'));
    el.classList.add(cls('viewer-container'));
    this.setHeight(this.options.height);

    if (theme !== 'light') {
      el.classList.add(cls(theme));
    }
    this.eventEmitter.listen('changeTheme', (newTheme: string) => {
      if (this.options.theme !== newTheme) {
        el.classList.remove(cls(this.options.theme));
        el.classList.add(cls(newTheme));
        this.options.theme = newTheme;
      }
    });
    el.innerHTML = '';

    this.toastMark = new ToastMark('', {
      disallowedHtmlBlockTags: ['br', 'img'],
      extendedAutolinks,
      referenceDefinition,
      frontMatter,
      customParser: extend(tableMarkdownParsers, markdownParsers),
    });
    this.preview = new MarkdownPreview(this.eventEmitter, {
      ...rendererOptions,
      isViewer: true,
    });

    on(this.preview.previewContent!, 'mousedown', this.toggleTask.bind(this));

    if (initialValue) {
      this.setMarkdown(initialValue);
    } else if (existingHTML) {
      this.preview.setHTML(existingHTML);
    }

    el.appendChild(this.preview.previewContent);
    this.initThemeObserver();
    this.eventEmitter.emit('load', this);
  }

  /**
   * Toggle task by detecting mousedown event.
   * @param {MouseEvent} ev - event
   * @private
   */
  private toggleTask(ev: MouseEvent) {
    const element = ev.target as HTMLElement;
    const style = getComputedStyle(element, ':before');

    if (
      !element.hasAttribute(DISABLED_TASK_ATTR_NAME) &&
      element.hasAttribute(TASK_ATTR_NAME) &&
      isPositionInBox(style, ev.offsetX, ev.offsetY)
    ) {
      toggleClass(element, TASK_CHECKED_CLASS_NAME);
      this.eventEmitter.emit('change', {
        source: 'viewer',
        date: ev,
      });
    }
  }

  /**
   * Set content for preview
   * @param {string} markdown Markdown text
   */
  setMarkdown(markdown: string) {
    const lineTexts: string[] = this.toastMark.getLineTexts();
    const { length } = lineTexts;
    const lastLine = last(lineTexts);
    const endSourcepos: [number, number] = [length, lastLine.length + 1];
    const editResult = this.toastMark.editMarkdown([1, 1], endSourcepos, markdown || '');

    this.eventEmitter.emit('updatePreview', editResult);
  }

  /**
   * Set theme
   * @param theme - theme name, can be 'light', 'dark', or custom theme name, will add class name toastui-editor-{theme}
   */
  setTheme(theme: string) {
    if (this.options.theme !== theme) {
      this.eventEmitter.emit('changeTheme', theme);
    }
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
   * Bind eventHandler to event type
   * @param {EventTypes} type Event type
   * @param {function} handler Event handler
   */
  on(type: EventTypes, handler: Handler) {
    this.eventEmitter.listen(type, handler);
  }

  /**
   * Unbind eventHandler from event type
   * @param {string} type Event type
   */
  off(type: string) {
    this.eventEmitter.removeEventHandler(type);
  }

  /**
   * Add hook to TUIEditor event
   * @param {EventTypes} type Event type
   * @param {function} handler Event handler
   */
  addHook(type: EventTypes, handler: Handler) {
    this.eventEmitter.removeEventHandler(type);
    this.eventEmitter.listen(type, handler);
  }

  /**
   * Remove Viewer preview from document
   */
  destroy() {
    off(this.preview.el!, 'mousedown', this.toggleTask.bind(this));
    this.preview.destroy();
    this.removeThemeObserver();
    this.eventEmitter.emit('destroy');
  }

  /**
   * Return true
   * @returns {boolean}
   */
  isViewer() {
    return true;
  }

  /**
   * Return false
   * @returns {boolean}
   */
  isMarkdownMode() {
    return false;
  }

  /**
   * Return false
   * @returns {boolean}
   */
  isWysiwygMode() {
    return false;
  }

  /**
   * Set editor height
   * @param {string} height - editor height in pixel
   */
  setHeight(height: string) {
    const { el } = this.options;

    if (isString(height)) {
      if (height === 'auto') {
        addClass(el, 'auto-height');
      } else {
        removeClass(el, 'auto-height');
      }
      this.setMinHeight(this.getMinHeight());
    }

    css(el, { height });
    this.height = height;
  }
  /**
   * Set minimum height to editor content
   * @param {string} minHeight - min content height in pixel
   */
  setMinHeight(minHeight: string) {
    if (minHeight !== this.minHeight) {
      const height = this.height || this.options.height;

      if (height !== 'auto' && this.options.el.querySelector(`.${cls('main')}`)) {
        // 75px equals default editor ui height - the editing area height
        minHeight = `${Math.min(parseInt(minHeight, 10), parseInt(height, 10) - 75)}px`;
      }

      const minHeightNum = parseInt(minHeight, 10);

      this.minHeight = minHeight;

      this.preview.setMinHeight(minHeightNum);
    }
  }
  /**
   * Get minimum height of editor content
   * @returns {string} min height in pixel
   */
  getMinHeight() {
    return this.minHeight;
  }
}

export default ToastUIEditorViewer;
