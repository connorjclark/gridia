export class Scene {
  constructor(public element: HTMLElement) {
  }

  onShow() {
    this.element.classList.remove('hidden');
  }

  onHide() {
    this.element.classList.add('hidden');
  }

  onDestroy() {
    // Empty.
  }
}
