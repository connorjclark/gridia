import {h, Fragment} from 'preact';

export const Input = (props: any) => {
  return <Fragment>
    <label>{props.children || props.name}</label>
    <input {...props}></input>
    {props.type === 'range' && props.value}
  </Fragment>;
};
