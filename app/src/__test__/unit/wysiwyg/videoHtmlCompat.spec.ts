import { DOMParser } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';

import WysiwygEditor from '@/wysiwyg/wwEditor';
import EventEmitter from '@/event/eventEmitter';
import { WwToDOMAdaptor } from '@/wysiwyg/adaptor/wwToDOMAdaptor';
import { createHTMLSchemaMap } from '@/wysiwyg/nodes/html';
import { sanitizeHTML } from '@/sanitizer/htmlSanitizer';
import { ensureEmptyHtmlInlineMediaPlaceholders } from '@/utils/htmlInlineMedia';
import { createHTMLrenderer } from '../markdown/util';

describe('video html compatibility', () => {
  let wwe: WysiwygEditor;
  let el: HTMLElement;

  type VideoRange = { from: number; to: number };
  type TextblockRange = { start: number; end: number };

  function requireVideoRange(): VideoRange {
    const range = findVideoRange();

    if (!range) {
      throw new Error('Expected to find a video mark range');
    }

    return range;
  }

  function setContent(content: string) {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = content;
    ensureEmptyHtmlInlineMediaPlaceholders(wrapper);

    const nodes = DOMParser.fromSchema(wwe.schema).parse(wrapper);

    wwe.setModel(nodes);
  }

  function findVideoRange(): VideoRange | null {
    let range: VideoRange | null = null;

    wwe.view.state.doc.nodesBetween(0, wwe.view.state.doc.content.size, (node, pos) => {
      if (range || !node.isText) {
        return;
      }

      const hasVideoMark = node.marks.some((mark) => mark.type.name === 'video');

      if (hasVideoMark) {
        range = {
          from: pos,
          to: pos + node.nodeSize,
        };
      }
    });

    return range;
  }

  function requireTextblockRange(text: string): TextblockRange {
    let range: TextblockRange | null = null;

    wwe.view.state.doc.descendants((node, pos) => {
      if (range || !node.isTextblock || node.textContent !== text) {
        return;
      }

      range = {
        start: pos + 1,
        end: pos + node.nodeSize - 1,
      };
    });

    if (!range) {
      throw new Error(`Expected to find textblock: ${text}`);
    }

    return range;
  }

  function flushSelectionUpdate() {
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  beforeEach(() => {
    const htmlRenderer = createHTMLrenderer();
    const toDOMAdaptor = new WwToDOMAdaptor({}, htmlRenderer);
    const htmlSchemaMap = createHTMLSchemaMap(htmlRenderer, sanitizeHTML, toDOMAdaptor);

    wwe = new WysiwygEditor(new EventEmitter(), {
      toDOMAdaptor,
      htmlSchemaMap,
      editPanel: {
        useImageEditPanel: false,
        useLinkEditPanel: false,
        useTableEditPanel: false,
      },
    });
    el = wwe.el;
    document.body.appendChild(el);
  });

  afterEach(() => {
    if (wwe) {
      wwe.destroy();
    }
    if (el?.parentNode === document.body) {
      document.body.removeChild(el);
    }
  });

  it('keeps video in htmlInline marks so fallback text round-trips', () => {
    setContent('<video src="movie.mp4">Your browser does not support the video tag.</video>');

    expect(wwe.schema.marks.video).toBeDefined();
    expect(wwe.schema.nodes.video).toBeUndefined();
    expect(wwe.getHTML()).toContain(
      '<p><video src="movie.mp4">Your browser does not support the video tag.</video></p>',
    );
  });

  it('renders empty video tags by keeping an internal placeholder', () => {
    setContent('<video src="movie.mp4"></video>');

    expect(wwe.view.dom.querySelector('video')).not.toBeNull();
    expect(wwe.getHTML()).toContain('<p><video src="movie.mp4"></video></p>');
  });

  it('selects and highlights empty video marks on click', async () => {
    setContent('<video src="movie.mp4"></video>');

    const video = wwe.view.dom.querySelector('video') as HTMLVideoElement;

    expect(video).not.toBeNull();

    video.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushSelectionUpdate();

    expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(true);
  });

  it('keeps empty video tags after moving the caret to the start', () => {
    setContent('<video src="movie.mp4"></video>');

    wwe.moveCursorToStart(false);

    expect(wwe.view.dom.querySelector('video')).not.toBeNull();
    expect(wwe.getHTML()).toContain('<p><video src="movie.mp4"></video></p>');
  });

  it('selects and highlights video marks on click', async () => {
    setContent('<video src="movie.mp4">Your browser does not support the video tag.</video>');

    const video = wwe.view.dom.querySelector('video') as HTMLVideoElement;

    expect(video).not.toBeNull();

    video.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await flushSelectionUpdate();

    expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(true);
  });

  it('navigates into and out of video marks with arrow keys', async () => {
    setContent(
      [
        '<p>before</p>',
        '<video src="movie.mp4">Your browser does not support the video tag.</video>',
        '<p>after</p>',
      ].join(''),
    );

    const before = requireTextblockRange('before');
    const after = requireTextblockRange('after');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      wwe.view.dispatch(
        wwe.view.state.tr.setSelection(
          TextSelection.create(wwe.view.state.doc, before.end, before.end),
        ),
      );
      wwe.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(before.end);
      expect(wwe.view.state.selection.to).toBe(before.end);
      expect(
        (wwe.view.dom.querySelector('video') as HTMLVideoElement).classList.contains(
          'toastui-editor-html-inline-media-selected',
        ),
      ).toBe(true);

      wwe.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(after.start);
      expect(wwe.view.state.selection.to).toBe(after.start);
      expect(
        (wwe.view.dom.querySelector('video') as HTMLVideoElement).classList.contains(
          'toastui-editor-html-inline-media-selected',
        ),
      ).toBe(false);

      wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(after.start);
      expect(wwe.view.state.selection.to).toBe(after.start);
      expect(
        (wwe.view.dom.querySelector('video') as HTMLVideoElement).classList.contains(
          'toastui-editor-html-inline-media-selected',
        ),
      ).toBe(true);

      wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(before.end);
      expect(wwe.view.state.selection.to).toBe(before.end);
      expect(
        (wwe.view.dom.querySelector('video') as HTMLVideoElement).classList.contains(
          'toastui-editor-html-inline-media-selected',
        ),
      ).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('selects video when navigating across neighboring textblocks', async () => {
    setContent(
      [
        '<h2>Features</h2>',
        '<video src="movie.mp4">Your browser does not support the video tag.</video>',
        '<ul><li><p>CommonMark + GFM Specifications</p></li></ul>',
      ].join(''),
    );

    const features = requireTextblockRange('Features');
    const commonMark = requireTextblockRange('CommonMark + GFM Specifications');
    const video = wwe.view.dom.querySelector('video') as HTMLVideoElement;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      wwe.view.dispatch(
        wwe.view.state.tr.setSelection(
          TextSelection.create(wwe.view.state.doc, features.end, features.end),
        ),
      );
      wwe.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(features.end);
      expect(wwe.view.state.selection.to).toBe(features.end);
      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(true);

      wwe.view.dispatch(
        wwe.view.state.tr.setSelection(
          TextSelection.create(wwe.view.state.doc, commonMark.start, commonMark.start),
        ),
      );
      wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(commonMark.start);
      expect(wwe.view.state.selection.to).toBe(commonMark.start);
      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(true);

      wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(features.end);
      expect(wwe.view.state.selection.to).toBe(features.end);
      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('selects empty video when navigating across neighboring textblocks', async () => {
    setContent(
      [
        '<h2>Features</h2>',
        '<video src="movie.mp4"></video>',
        '<ul><li><p>CommonMark + GFM Specifications</p></li></ul>',
      ].join(''),
    );

    const features = requireTextblockRange('Features');
    const commonMark = requireTextblockRange('CommonMark + GFM Specifications');
    const video = wwe.view.dom.querySelector('video') as HTMLVideoElement;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      wwe.view.dispatch(
        wwe.view.state.tr.setSelection(
          TextSelection.create(wwe.view.state.doc, features.end, features.end),
        ),
      );
      wwe.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(features.end);
      expect(wwe.view.state.selection.to).toBe(features.end);
      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(true);

      wwe.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(commonMark.start);
      expect(wwe.view.state.selection.to).toBe(commonMark.start);
      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(false);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('moves the caret to the visible paragraph edge when video is the last block', async () => {
    setContent(
      [
        '<h2>Features</h2>',
        '<video src="movie.mp4">Your browser does not support the video tag.</video>',
      ].join(''),
    );

    const range = requireVideoRange();
    const features = requireTextblockRange('Features');
    const video = wwe.view.dom.querySelector('video') as HTMLVideoElement;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      wwe.view.dispatch(
        wwe.view.state.tr.setSelection(
          TextSelection.create(wwe.view.state.doc, features.end, features.end),
        ),
      );
      wwe.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      await flushSelectionUpdate();

      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(true);

      wwe.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(range.to);
      expect(wwe.view.state.selection.to).toBe(range.to);
      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(false);

      wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(range.to);
      expect(wwe.view.state.selection.to).toBe(range.to);
      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('moves the caret to the visible paragraph edge when video is the first block', async () => {
    setContent(
      [
        '<video src="movie.mp4">Your browser does not support the video tag.</video>',
        '<p>after</p>',
      ].join(''),
    );

    const range = requireVideoRange();
    const after = requireTextblockRange('after');
    const video = wwe.view.dom.querySelector('video') as HTMLVideoElement;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      wwe.view.dispatch(
        wwe.view.state.tr.setSelection(
          TextSelection.create(wwe.view.state.doc, after.start, after.start),
        ),
      );
      wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await flushSelectionUpdate();

      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(true);

      wwe.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(range.from);
      expect(wwe.view.state.selection.to).toBe(range.from);
      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(false);

      wwe.view.dom.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
      await flushSelectionUpdate();

      expect(wwe.view.state.selection.from).toBe(range.from);
      expect(wwe.view.state.selection.to).toBe(range.from);
      expect(video.classList.contains('toastui-editor-html-inline-media-selected')).toBe(true);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('inserts text outside video boundaries when video is the only content', () => {
    setContent('<video src="movie.mp4">Your browser does not support the video tag.</video>');

    const initialRange = requireVideoRange();

    wwe.view.dispatch(
      wwe.view.state.tr.setSelection(
        TextSelection.create(wwe.view.state.doc, initialRange.from, initialRange.from),
      ),
    );
    wwe.view.dispatch(wwe.view.state.tr.insertText('before '));

    expect(wwe.getHTML()).toContain(
      '<p>before <video src="movie.mp4">Your browser does not support the video tag.</video></p>',
    );

    const rangeAfterBeforeText = requireVideoRange();

    wwe.view.dispatch(
      wwe.view.state.tr.setSelection(
        TextSelection.create(wwe.view.state.doc, rangeAfterBeforeText.to, rangeAfterBeforeText.to),
      ),
    );
    wwe.view.dispatch(wwe.view.state.tr.insertText(' after'));

    expect(wwe.getHTML()).toContain(
      '<p>before <video src="movie.mp4">Your browser does not support the video tag.</video> after</p>',
    );
  });
});
