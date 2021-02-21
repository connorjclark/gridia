import { h } from 'preact';

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
