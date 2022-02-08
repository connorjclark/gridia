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
  let pendingAnnotation: object | null = null;

  for (const line of dialogueText.trim().split('\n').map((l) => l.trim())) {
    if (!line) continue;

    const [, justLabelAnnotation] = line.match(/^\[(.*)\]$/) || [];
    if (justLabelAnnotation) {
      pendingAnnotation = parseAnnotationsInnerText(justLabelAnnotation);
      continue;
    }

    const [, isChoice, labelAnnotation, speakerIndex, rest1] = line.match(/^(-? ?)(?:\[(.*)\])? ?(\d+)? (.*)/) || [];
    let annotations = labelAnnotation ? parseAnnotationsInnerText(labelAnnotation) : undefined;
    if (pendingAnnotation) {
      annotations = {...pendingAnnotation, ...annotations};
      pendingAnnotation = null;
    }

    if (annotations?.label) {
      if (labelToPartIndex.has(annotations.label)) throw new Error(`already used label ${annotations.label}`);

      labelToPartIndex.set(annotations.label, dialogueParts.length);
      delete annotations.label;
    }

    if (isChoice) {
      if (!annotations) throw new Error(`bad line, must include annotations: ${line}`);
      if (!currentDialoguePart) throw new Error();

      currentDialoguePart.choices = currentDialoguePart.choices || [];
      currentDialoguePart.choices.push({
        annotations,
        text: rest1,
      });
    } else if (speakerIndex !== undefined) {
      currentDialoguePart = {speaker: Number(speakerIndex), text: rest1};
      if (annotations && Object.keys(annotations).length > 0) currentDialoguePart.annotations = annotations;
      dialogueParts.push(currentDialoguePart);
    } else if (currentDialoguePart) {
      currentDialoguePart.text += ` ${line}`;
    } else {
      throw new Error(`bad line: ${line}`);
    }
  }

  if (pendingAnnotation) throw new Error('pending annotation!');

  const processAnnotations = (annotations: Record<string, string>) => {
    if (annotations.goto) {
      const gotoIndex = labelToPartIndex.get(annotations.goto);
      if (gotoIndex === undefined) throw new Error(`did not find label: ${gotoIndex}`);

      annotations.goto = String(gotoIndex);
    }
    if ('return' in annotations && annotations.return) {
      throw new Error('return annotation cannot have a value');
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
