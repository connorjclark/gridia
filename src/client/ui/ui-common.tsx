import { h, render, Component } from 'preact';
import { GFX_SIZE } from '../../constants';
import * as Utils from '../../utils';
import * as Helper from '../helper';

interface GraphicProps {
  type: 'floors' | 'items' | 'creatures' | 'arms' | 'chest' | 'head' | 'legs' | 'shield' | 'weapon';
  index: number;
  quantity?: number;
  scale?: number;
}
export const Graphic = (props: GraphicProps) => {
  const spritesheetIndex = Math.floor(props.index / 100);
  const x = props.index % 10;
  const y = Math.floor(props.index / 10) % 100;

  let key;
  if (props.type === 'creatures') {
    // TODO
    key = 'player';
  } else {
    key = props.type;
  }
  const backgroundImage = `url(world/${key}/${key}${spritesheetIndex}.png)`;

  const label = props.quantity !== undefined && props.quantity !== 1 ? Utils.formatQuantity(props.quantity) : '';

  let style: { [key: string]: string | number } = {
    backgroundImage,
    backgroundPosition: `-${x * 32}px -${y * 32}px`,
    width: '32px',
    maxWidth: '32px',
    height: '32px',
  };
  if (props.scale) {
    style = {
      ...style,
      transform: `scale(${props.scale})`,
      marginLeft: (props.scale - 1) * GFX_SIZE + 'px',
      marginRight: (props.scale - 1) * GFX_SIZE + 'px',
    };
  }

  return <div style={style}>{label}</div>;
};

interface CustomCreatureGraphicProps {
  arms: number;
  head: number;
  chest: number;
  legs: number;
  shield?: number;
  weapon?: number;
  scale?: number;
}
export function CustomCreatureGraphic(props: CustomCreatureGraphicProps) {
  const size = (props.scale || 1) * GFX_SIZE;
  return <div style={{ width: size + 'px', height: size + 'px', marginRight: size + 'px' }}>
    {Object.entries(props).map(([key, value]) => {
      if (key === 'scale' || value === undefined) return;
      return <div style={{ position: 'absolute' }}>
        <Graphic type={key as any} index={value} scale={props.scale}></Graphic>
      </div>;
    })}
  </div>;
}

export function makeGraphicComponent() {
  interface GraphicComponentState {
    graphic?: GraphicProps;
  }

  let setState = (_: Partial<GraphicComponentState>) => {
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
    setState: (s: Partial<GraphicComponentState>) => setState(s),
  };
}
