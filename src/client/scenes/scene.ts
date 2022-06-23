export class Scene {
  constructor(public element: HTMLElement) {
  }

  show() {
    this.element.classList.remove('hidden');
    this.onShow();
  }

  hide() {
    this.element.classList.add('hidden');
    this.onHide();
  }

  dispose() {
    this.onDispose();
  }

  protected onShow() {
    // Can be overridden.
  }

  protected onHide() {
    // Can be overridden.
  }

  protected onDispose() {
    // Can be overridden.
  }
}
