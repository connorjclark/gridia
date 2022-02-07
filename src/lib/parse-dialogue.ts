function parseAnnotationsInnerText(text: string) {
  const annotations: Record<string, string> = {};
  for (const entry of text.split(/,\s*/)) {
    const [key, value] = entry.split('=', 2);
    if (value in annotations) throw new Error(`duplicate annotation: ${text}`);
    annotations[key] = value || '';
  }
  return annotations;
}

export function parseDialogueText(dialogueText: string) {
  const dialogueParts: Dialogue['parts'] = [];
  const labelToPartIndex = new Map<string, number>();
  let currentDialoguePart: Dialogue['parts'][number] | null = null;

  for (const line of dialogueText.trim().split('\n').map((l) => l.trim())) {
    if (!line) continue;

    const [, labelAnnotation] = line.match(/^\[(.*)\]/) || [];
    if (labelAnnotation) {
      if (labelAnnotation.includes(',')) throw new Error(`invalid label ${labelAnnotation}`);

      if (labelAnnotation.match(/return=?/)) {
        if (!currentDialoguePart) throw new Error();

        currentDialoguePart.annotations = parseAnnotationsInnerText(labelAnnotation);
      } else {
        if (labelToPartIndex.has(labelAnnotation)) throw new Error(`already used label ${labelAnnotation}`);

        labelToPartIndex.set(labelAnnotation, dialogueParts.length);
      }

      continue;
    }

    if (line.startsWith('-')) {
      const [, annotation, text] = line.match(/\[(.*)\] (.*)/) || [];
      if (!annotation || !text) throw new Error(`bad line, must include annotations: ${line}`);
      if (!currentDialoguePart) throw new Error();

      currentDialoguePart.choices = currentDialoguePart.choices || [];
      currentDialoguePart.choices.push({
        annotations: parseAnnotationsInnerText(annotation),
        text,
      });
      continue;
    }

    const [, speakerIndex, rest1] = line.match(/(\d+) (.*)/) || [];
    if (speakerIndex !== undefined) {
      currentDialoguePart = {speaker: Number(speakerIndex), text: rest1};
      dialogueParts.push(currentDialoguePart);
    } else if (currentDialoguePart) {
      currentDialoguePart.text += ` ${line}`;
    } else {
      throw new Error(`bad line: ${line}`);
    }
  }

  const processAnnotations = (annotations: Record<string, string>) => {
    if (annotations.goto) {
      const gotoIndex = labelToPartIndex.get(annotations.goto);
      if (gotoIndex === undefined) throw new Error(`did not find label: ${gotoIndex}`);

      annotations.goto = String(gotoIndex);
    }
  };
  for (const part of dialogueParts) {
    if (part.annotations) {
      processAnnotations(part.annotations);
      if (part.annotations.goto) throw new Error('can only use goto annotation in a choice');
    }

    for (const choice of part.choices || []) {
      processAnnotations(choice.annotations);
      if (!choice.annotations.goto) throw new Error(`missing goto annotation for choice: ${choice.text}`);
      if ('return' in choice.annotations) throw new Error('return annotation not supported for choices');
    }

    if (part.choices && part.annotations && 'return' in part.annotations) {
      throw new Error('return annotation not supported for parts with choices');
    }
  }

  return dialogueParts;
}
