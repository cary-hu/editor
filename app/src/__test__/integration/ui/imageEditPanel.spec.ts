import { fireEvent } from '@testing-library/dom';

import { Editor } from '@/index';
import { cls } from '@/utils/dom';
import '@/i18n/en-us';

const IMAGE_URL = 'https://example.com/image.png';

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON() {
      return {};
    },
  } as DOMRect;
}

function waitForAnimationFrame() {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

function getImage(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLImageElement>(`.${cls('ww-container')} img`),
  ).find((image) => image.getAttribute('src')?.startsWith(IMAGE_URL))!;
}

function getDialog(container: HTMLElement) {
  return container.querySelector<HTMLElement>(`.${cls('image-edit-dialog')}`)!;
}

describe('image edit panel', () => {
  let el: HTMLDivElement;
  let editor: Editor;
  let rectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    rectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function mockElementRect(this: HTMLElement) {
        if (this.classList.contains('toastui-edit-panel-container')) {
          return createRect(0, 0, 1000, 800);
        }
        if (this.classList.contains(cls('toolbar'))) {
          return createRect(0, 0, 1000, 40);
        }
        if (this.classList.contains(cls('mode-switch'))) {
          return createRect(0, 760, 1000, 40);
        }
        if (this.classList.contains(cls('contents'))) {
          return createRect(0, 80, 1000, 620);
        }
        if (this.matches('img')) {
          return createRect(250, 120, 50, 100);
        }

        return createRect(0, 0, 0, 0);
      });

    el = document.createElement('div');
    document.body.appendChild(el);
    editor = new Editor({
      el,
      height: '400px',
      initialEditType: 'wysiwyg',
      initialValue: `![image](${IMAGE_URL})`,
    });
  });

  afterEach(() => {
    editor.destroy();
    document.body.removeChild(el);
    rectSpy.mockRestore();
  });

  it('keeps the panel anchored after saving image width with Enter', async () => {
    const image = getImage(el);

    fireEvent.click(image);
    await waitForAnimationFrame();

    const dialog = getDialog(el);

    expect(dialog.style.left).toBe('310px');
    expect(dialog.style.top).toBe('120px');

    const widthInput = dialog.querySelector<HTMLInputElement>('#width-input')!;

    widthInput.value = '320';
    fireEvent.input(widthInput);
    fireEvent.keyPress(widthInput, { key: 'Enter', charCode: 13 });

    const updatedImage = getImage(el);

    expect(updatedImage).not.toBe(image);
    expect(updatedImage.style.width).toBe('320px');
    expect(dialog.style.left).toBe('310px');
    expect(dialog.style.top).toBe('120px');
  });
});
