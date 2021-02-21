import { h, render, Component } from 'preact';
import * as Helper from '../helper';

interface GraphicProps {
  type: 'floor' | 'item';
  index: number;
  quantity?: number;
}
export const Graphic = (props: GraphicProps) => {
  const spritesheetIndex = Math.floor(props.index / 100);
  const x = props.index % 10;
  const y = Math.floor(props.index / 10) % 100;

  let backgroundImage;
  if (props.type === 'floor') {
    backgroundImage = `url(world/floors/floors${spritesheetIndex}.png)`;
  } else if (props.type === 'item') {
    backgroundImage = `url(world/items/items${spritesheetIndex}.png)`;
  } else {
    throw new Error();
  }

  const label = props.quantity !== undefined && props.quantity !== 1 ? props.quantity : '';

  return <div
    style={{
      backgroundImage,
      backgroundPosition: `-${x * 32}px -${y * 32}px`,
      width: '32px',
      maxWidth: '32px',
      height: '32px',
    }}
  >{label}</div>;
};

export function makeGraphicComponent() {
  interface GraphicComponentState {
    graphic?: GraphicProps;
  }

  let setState = (_: GraphicComponentState) => {
    // Do nothing.
  };

  class GraphicComponent extends Component {
    state: GraphicComponentState = {};

    componentDidMount() {
      setState = this.setState.bind(this);
    }

    render() {
      let graphic;
      if (this.state.graphic) graphic = <Graphic {...this.state.graphic} />;
      return <div class="graphic">{graphic}</div>;
    }
  }

  const el = Helper.createChildOf(Helper.find('.ui'), 'graphic');
  render(<GraphicComponent />, el);
  return {
    el,
    setState: (s: GraphicComponentState) => setState(s),
  };
}
