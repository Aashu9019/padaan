// Minimal typings for page-flip (StPageFlip) 2.x, which ships without declarations.
declare module 'page-flip' {
  export interface FlipSettings {
    width: number;
    height: number;
    size?: 'fixed' | 'stretch';
    minWidth?: number;
    maxWidth?: number;
    minHeight?: number;
    maxHeight?: number;
    startPage?: number;
    drawShadow?: boolean;
    flippingTime?: number;
    usePortrait?: boolean;
    startZIndex?: number;
    autoSize?: boolean;
    maxShadowOpacity?: number;
    showCover?: boolean;
    mobileScrollSupport?: boolean;
    swipeDistance?: number;
    clickEventForward?: boolean;
    useMouseEvents?: boolean;
    showPageCorners?: boolean;
    disableFlipByClick?: boolean;
  }

  export interface FlipEvent<T> {
    data: T;
    object: PageFlip;
  }

  export type FlippingState = 'user_fold' | 'fold_corner' | 'flipping' | 'read';
  export type Orientation = 'portrait' | 'landscape';

  export class PageFlip {
    constructor(element: HTMLElement, settings: FlipSettings);
    loadFromHTML(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    updateFromHtml(items: NodeListOf<HTMLElement> | HTMLElement[]): void;
    destroy(): void;
    update(): void;
    turnToPage(page: number): void;
    turnToNextPage(): void;
    turnToPrevPage(): void;
    flip(page: number, corner?: 'top' | 'bottom'): void;
    flipNext(corner?: 'top' | 'bottom'): void;
    flipPrev(corner?: 'top' | 'bottom'): void;
    getCurrentPageIndex(): number;
    getPageCount(): number;
    getOrientation(): Orientation;
    getState(): FlippingState;
    on(event: 'flip', cb: (e: FlipEvent<number>) => void): this;
    on(event: 'changeState', cb: (e: FlipEvent<FlippingState>) => void): this;
    on(event: 'changeOrientation', cb: (e: FlipEvent<Orientation>) => void): this;
    on(event: 'init' | 'update', cb: (e: FlipEvent<unknown>) => void): this;
    off(event: string): void;
  }
}
