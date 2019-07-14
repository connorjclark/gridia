import { Container } from 'pixi.js';

class GridContainer extends Container {
  constructor(public maxWidth: number, public padding: number = 0) {
    super();
  }

  public layout() {
    let nextX = 0;
    let nextY = 0;
    let maxHeightOfRow = 0;
    for (const child of this.children) {
      const {width: childWidth, height: childHeight} = child.getLocalBounds();
      if (nextX + childWidth <= this.maxWidth) {
        maxHeightOfRow = Math.max(maxHeightOfRow, childHeight);
      } else {
        nextX = 0;
        nextY += maxHeightOfRow;
      }

      child.x = nextX;
      child.y = nextY;
      nextX += childWidth + this.padding;
    }
  }
}

export default GridContainer;
