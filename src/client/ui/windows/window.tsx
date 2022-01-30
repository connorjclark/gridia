import {ComponentChildren, h} from 'preact';

interface Props {
  name?: string;
  children: ComponentChildren;
}

export const Window = (props: Props) => {
  // TODO: combine this with '.window'.
  return <div class="preact-window">
    <div class="preact-window__title">
      {props.name}
    </div>

    <div class="preact-window__contents">
      {props.children}
    </div>
  </div>;
};
