import {h} from 'preact';

export const Bar = (props: { label: string; color: string; current: number; max: number }) => {
  const percent = 100 * props.current / props.max;
  return <div class="bar">
    <div class="bar__label">
      <span>{props.label}</span>
      <span>{props.current}&nbsp;/&nbsp;{props.max}</span>
    </div>
    <div class="bar__bg" style={{width: `${percent}%`, backgroundColor: props.color}}>&nbsp;</div>
  </div>;
};
