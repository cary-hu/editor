/// <reference types="vitest/globals" />

type StyleExpectation = Record<string, string | number>;

declare module 'vitest' {
  interface Assertion<T = any> {
    toHaveClass(expected: string): T;
    toContainElement(expected: Element | null): T;
    toContainHTML(expected: string): T;
    toHaveStyle(expected: StyleExpectation): T;
    toHaveTextContent(expected: string): T;
    toBeDisabled(): T;
    toBeInTheDocument(): T;
    toHaveValue(expected: string | number | string[]): T;
  }

  interface AsymmetricMatchersContaining {
    toHaveClass(expected: string): void;
    toContainElement(expected: Element | null): void;
    toContainHTML(expected: string): void;
    toHaveStyle(expected: StyleExpectation): void;
    toHaveTextContent(expected: string): void;
    toBeDisabled(): void;
    toBeInTheDocument(): void;
    toHaveValue(expected: string | number | string[]): void;
  }
}

export {};
