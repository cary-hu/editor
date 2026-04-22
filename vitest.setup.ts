import { expect, vi } from 'vitest';

type StyleExpectation = Record<string, string | number>;

function isHTMLElement(value: unknown): value is HTMLElement {
  return value instanceof HTMLElement;
}

function toKebabCase(property: string) {
  return property.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
}

function formatElement(element: Element | null) {
  if (!element) {
    return 'null';
  }

  return element.outerHTML;
}

function normalizeStyleValue(property: string, value: string | number) {
  const element = document.createElement('div');

  element.style.setProperty(property, String(value));
  document.body.appendChild(element);

  const normalized = window.getComputedStyle(element).getPropertyValue(property).trim();

  document.body.removeChild(element);

  return normalized;
}

expect.extend({
  toHaveClass(received: unknown, expected: string) {
    const pass = isHTMLElement(received) && received.classList.contains(expected);

    return {
      pass,
      message: () =>
        `expected ${formatElement(isHTMLElement(received) ? received : null)} ${
          pass ? 'not ' : ''
        }to have class "${expected}"`,
    };
  },
  toContainElement(received: unknown, expected: Element | null) {
    const pass = received instanceof Element && !!expected && received.contains(expected);

    return {
      pass,
      message: () =>
        `expected ${formatElement(received instanceof Element ? received : null)} ${
          pass ? 'not ' : ''
        }to contain ${formatElement(expected)}`,
    };
  },
  toContainHTML(received: unknown, expected: string) {
    const wrapper = document.createElement('div');

    wrapper.innerHTML = expected;

    const actual = received instanceof Element ? received.innerHTML : '';
    const normalized = wrapper.innerHTML;
    const pass = actual.includes(normalized);

    return {
      pass,
      message: () =>
        `expected ${formatElement(received instanceof Element ? received : null)} ${
          pass ? 'not ' : ''
        }to contain HTML ${normalized}`,
    };
  },
  toHaveStyle(received: unknown, expected: StyleExpectation) {
    if (!isHTMLElement(received)) {
      return {
        pass: false,
        message: () => 'expected an HTMLElement',
      };
    }

    const computedStyle = window.getComputedStyle(received);
    const failingEntry = Object.entries(expected).find(([property, value]) => {
      const cssProperty = toKebabCase(property);
      const actual = computedStyle.getPropertyValue(cssProperty).trim();
      const normalized = normalizeStyleValue(cssProperty, value);

      return actual !== normalized;
    });

    return {
      pass: !failingEntry,
      message: () =>
        failingEntry
          ? `expected ${formatElement(received)} to have style ${failingEntry[0]}: ${String(
              failingEntry[1],
            )}`
          : `expected ${formatElement(received)} not to match the provided styles`,
    };
  },
  toHaveTextContent(received: unknown, expected: string) {
    const actual = received instanceof Node ? (received.textContent ?? '') : '';
    const pass = actual.includes(expected);

    return {
      pass,
      message: () => `expected "${actual}" ${pass ? 'not ' : ''}to contain text "${expected}"`,
    };
  },
  toBeDisabled(received: unknown) {
    const pass =
      received instanceof HTMLElement &&
      ('disabled' in received ? Boolean((received as HTMLButtonElement).disabled) : false);

    return {
      pass,
      message: () =>
        `expected ${formatElement(received instanceof Element ? received : null)} ${
          pass ? 'not ' : ''
        }to be disabled`,
    };
  },
  toBeInTheDocument(received: unknown) {
    const pass = received instanceof Node && document.body.contains(received);

    return {
      pass,
      message: () =>
        `expected ${formatElement(received instanceof Element ? received : null)} ${
          pass ? 'not ' : ''
        }to be in the document`,
    };
  },
  toHaveValue(received: unknown, expected: string | number | string[]) {
    const actual =
      received instanceof HTMLInputElement ||
      received instanceof HTMLTextAreaElement ||
      received instanceof HTMLSelectElement
        ? received.value
        : null;
    const pass = Array.isArray(expected)
      ? Array.isArray(actual) && actual.length === expected.length
      : actual === String(expected);

    return {
      pass,
      message: () => `expected value ${String(actual)} ${pass ? 'not ' : ''}to be ${expected}`,
    };
  },
});

if (globalThis.Range) {
  globalThis.Range.prototype.getClientRects = vi.fn().mockReturnValue({ length: 0 });
  globalThis.Range.prototype.getBoundingClientRect = vi.fn().mockReturnValue({});
}
