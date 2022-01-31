import {h} from 'preact';
import {useEffect, useMemo, useState} from 'preact/hooks';

type TypeToDefault = Record<string, () => any>;
type TypeToFieldComponent = Record<string, preact.ComponentType<TypeProps<any>>>;

type SchemaType = string | { array: SchemaType } | { object: Record<string, SchemaType> };
export type Schema = Record<string, SchemaType>;

interface Props<T> {
  initialValue: T;
  schema: Schema;
  typeToDefaultExtras?: TypeToDefault;
  typeToFieldComponentExtras?: TypeToFieldComponent;
  onValueUpdated: (value: T, key: string) => void;
}

export interface TypeProps<T> {
  onValueUpdated: (value: T) => void;
  initialValue: T;
  key: string;
}

const typeToDefaultBase: TypeToDefault = {
  number: () => 0,
  string: () => '',
};

const typeToFieldComponentBase: TypeToFieldComponent = {
  number: (props: TypeProps<number>) => {
    const [value, setValue] = useState(props.initialValue);
    const update = (newValue: number) => {
      setValue(newValue);
      props.onValueUpdated(newValue);
    };

    return <input
      name={props.key}
      type="number"
      value={value}
      onChange={(e: any) => update(e.target.valueAsNumber)}>
    </input>;
  },
  string: (props: TypeProps<string>) => {
    const [value, setValue] = useState(props.initialValue);
    const update = (newValue: string) => {
      setValue(newValue);
      props.onValueUpdated(newValue);
    };

    return <input
      name={props.key}
      type="string"
      value={value}
      onChange={(e: any) => update(e.target.value)}>
    </input>;
  },
};

function get(object: any, key: string) {
  let val = object;
  for (const keyPart of key.split('.')) {
    val = val[keyPart];
  }
  return val;
}

function tryGet(object: any, key: string) {
  try {
    return get(object, key);
  } catch {
    return;
  }
}

function set(object: any, key: string, value: any) {
  let val = object;
  const keySplit = key.split('.');
  for (const keyPart of keySplit.slice(0, -1)) {
    val = val[keyPart];
  }
  val[keySplit[keySplit.length - 1]] = value;
}

export const SchemaForm = <T,>(props: Props<T>) => {
  const [value, setValue] = useState({...props.initialValue});

  useEffect(() => {
    setValue({...props.initialValue});
  }, [props.initialValue]);

  const typeToDefault = useMemo(() => {
    return {...typeToDefaultBase, ...props.typeToDefaultExtras};
  }, [props.typeToDefaultExtras]);
  const typeToFieldComponent = useMemo(() => {
    return {...typeToFieldComponentBase, ...props.typeToFieldComponentExtras};
  }, [props.typeToFieldComponentExtras]);

  const fields: h.JSX.Element[] = [];
  const renderFieldRaw = (schemaKey: string, schemaTypeString: string) => {
    let initialValue = tryGet(props.initialValue, schemaKey);
    if (initialValue === undefined) {
      initialValue = typeToDefault[schemaTypeString]();
      if (tryGet(value, schemaKey) === undefined) {
        set(value, schemaKey, initialValue);
      }
    }

    const Field = typeToFieldComponent[schemaTypeString];
    if (!Field) throw new Error(`no field component found for type: ${schemaTypeString}`);

    fields.push(<div key={schemaKey}>
      <label>{schemaKey}</label>
      <Field initialValue={initialValue} key={schemaKey} onValueUpdated={(fieldValue: any) => {
        set(value, schemaKey, fieldValue);
        setValue({...value});
        props.onValueUpdated(value, schemaKey);
      }}></Field>
    </div>);
  };

  const renderField = (schemaKey: string, schemaType: SchemaType) => {
    if (typeof schemaType === 'string') {
      renderFieldRaw(schemaKey, schemaType);
    } else if ('array' in schemaType) {
      let currentArray = get(value, schemaKey);
      if (!currentArray) set(value, schemaKey, currentArray = []);
      if (!Array.isArray(currentArray) || !schemaType.array) throw new Error();

      for (let i = 0; i < currentArray.length; i++) {
        renderField(`${schemaKey}.${i}`, schemaType.array);
      }

      // TODO add more, delete items.
    } else if ('object' in schemaType) {
      let currentObject = get(value, schemaKey);
      if (!currentObject) set(value, schemaKey, currentObject = {});
      if (Array.isArray(currentObject) || !schemaType.object) throw new Error();

      for (const [k, v] of Object.entries(schemaType.object)) {
        renderField(`${schemaKey}.${k}`, v);
      }
    } else {
      throw Error();
    }
  };

  for (const [schemaKey, schemaType] of Object.entries(props.schema)) {
    renderField(schemaKey, schemaType);
  }

  return <div class="schema-form">{fields}</div>;
};
