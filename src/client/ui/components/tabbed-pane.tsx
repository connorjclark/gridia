import {h, Component} from 'preact';
import {useState} from 'preact/hooks';

export interface TabbedPaneProps {
  tabs: Record<string, { label: string; content: Component['constructor'] }>;
  childProps: any;
}
export const TabbedPane = (props: TabbedPaneProps) => {
  const [currentId, setCurrentId] = useState(Object.keys(props.tabs)[0]);

  const tab = props.tabs[currentId];
  if (!tab) {
    throw new Error('no tab');
  }

  return <div class='tabbed-pane'>
    <div role='tablist' class='tabbed-pane__tabs flex justify-around'>
      {Object.entries(props.tabs).map(([id, t]) => {
        return <button
          role='tab'
          aria-controls={id}
          aria-selected={id === currentId}
          className={'tabbed-pane__tab ' + (id === currentId ? 'selected' : '')}
          onClick={() => setCurrentId(id)}>{t.label}</button>;
      })}
    </div>
    <div role='tabpanel' aria-labelledby={currentId}>
      <tab.content {...props.childProps}></tab.content>
    </div>
  </div>;
};
