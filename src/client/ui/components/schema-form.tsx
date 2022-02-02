import Form_, {FieldProps, FormProps, UiSchema} from '@rjsf/core';
import {h} from 'preact';
import {createPortal} from 'preact/compat';
import {useEffect, useMemo, useState} from 'preact/hooks';

// The simplest way to customize widgets for particular fields in complex objects
// (ex: CreatureDescriptor.type) is to put the `ui:` schema right next to the associated
// json schema definition. That's not supported directly by the library, but this simple
// HOC can augment the uiSchema used on a field-by-field basis.
// https://github.com/rjsf-team/react-jsonschema-form/issues/701#issuecomment-806625768
function useUiSchemaFromSchema(schema: any, uiSchema: UiSchema) {
  return useMemo(() => {
    const extracted: UiSchema = {};
    for (const key in schema) {
      if (key.startsWith('ui:')) {
        extracted[key] = schema[key];
      }
    }
    return {...extracted, ...uiSchema};
  }, [schema, uiSchema]);
}

export const withUiSchemaFromSchema = (WrappedComponent: any) => (props: FieldProps) => {
  const uiSchema = useUiSchemaFromSchema(props.schema, props.uiSchema);
  return <WrappedComponent {...props} uiSchema={uiSchema} />;
};

export const IFrame = (props: any) => {
  const [contentRef, setContentRef] = useState<HTMLIFrameElement | null>(null);
  const mountNode = contentRef?.contentWindow?.document?.body;

  useEffect(() => {
    //   if (!contentRef) return;

    //   const contentWindow = contentRef.contentWindow;
    //   const body = contentWindow?.document.body;
    //   if (!body || !contentWindow) return;

    //   const updateSize = () => {
    //     if (contentRef)contentRef.height = body.scrollHeight + 'px';
    //   };
    //   const observer = new MutationObserver(updateSize);
    //   observer.observe(body, {attributes: true, childList: true, subtree: true});
    //   updateSize();
    //   // contentWindow.document.addEventListener('load', updateSize);
    //   // contentWindow.document.addEventListener('DOMContentLoaded', updateSize);

    //   return () => observer.disconnect();
  }, [contentRef]);

  return (
    <iframe {...props} ref={setContentRef} width="100%" height="400px">
      {mountNode && createPortal(props.children, mountNode)}
    </iframe>
  );
};

export const Form = <T,>(props: FormProps<T>) => {
  // Render in an iframe to keep the stylesheets used isolated from the rest of the page.
  return <IFrame>
    <link
      rel="stylesheet"
      id="theme"
      href={'//cdnjs.cloudflare.com/ajax/libs/bootswatch/3.3.6/journal/bootstrap.min.css'}
    />
    <Form_<T>{...props}></Form_>
  </IFrame>;
};
