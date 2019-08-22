const fs = require("fs");
const path = require("path");

const clientToServerRawData = {
  adminSetFloor: {
    params: [
      {name: "loc", type: "TilePoint", spread: true},
      {name: "floor", type: "number"},
    ],
  },
  adminSetItem: {
    params: [
      {name: "loc", type: "TilePoint", spread: true},
      {name: "item", type: "Item", optional: true},
    ],
  },
  moveItem: {
    params: [
      {name: "from", type: "TilePoint"},
      {name: "fromSource", type: "number"},
      {name: "to", type: "TilePoint", optional: true},
      {name: "toSource", type: "number"},
    ],
  },
  move: {
    params: [
      {name: "loc", type: "TilePoint", spread: true},
    ],
  },
  register: {
    params: [
      {name: "name", type: "string"},
    ],
  },
  requestContainer: {
    params: [
      {name: "containerId", type: "number", optional: true},
      {name: "loc", type: "TilePoint", optional: true},
    ],
  },
  closeContainer: {
    params: [
      {name: "containerId", type: "number"},
    ],
  },
  requestCreature: {
    params: [
      {name: "id", type: "number"},
    ],
  },
  requestPartition: {
    params: [
      {name: "w", type: "number"},
    ],
  },
  requestSector: {
    params: [
      {name: "loc", type: "TilePoint", spread: true},
    ],
  },
  tame: {
    params: [
      {name: "creatureId", type: "number"},
    ],
  },
  use: {
    params: [
      {name: "toolIndex", type: "number"},
      {name: "loc", type: "TilePoint"},
      {name: "usageIndex", type: "number", optional: true},
    ],
  },
};

const serverToClientRawData = {
  initialize: {
    params: [
      {name: "isAdmin", type: "boolean"},
      {name: "creatureId", type: "number"},
      {name: "containerId", type: "number"},
      {name: "skills", type: "Array<[number, number]>"},
    ],
  },
  initializePartition: {
    params: [
      {name: "pos", type: "TilePoint", spread: true},
    ],
  },
  sector: {
    params: [
      {name: "pos", type: "TilePoint", spread: true},
      {name: "tiles", type: "Sector"},
    ],
  },
  container: {
    params: [
      {name: "container", type: "NoMethods<Container>", spread: true},
    ],
  },
  setFloor: {
    params: [
      {name: "loc", type: "TilePoint", spread: true},
      {name: "floor", type: "number"},
    ],
  },
  setItem: {
    params: [
      {name: "loc", type: "TilePoint", spread: true},
      {name: "item", type: "Item", optional: true},
      {name: "source", type: "number"},
    ],
  },
  setCreature: {
    params: [
      {name: "partial", type: "boolean"},
      {name: "partialCreature", type: "Partial<Creature>", spread: true},
    ],
  },
  removeCreature: {
    params: [
      {name: "id", type: "number"},
    ],
  },
  animation: {
    params: [
      {name: "loc", type: "TilePoint", spread: true},
      {name: "key", type: "string"},
    ],
  },
  log: {
    params: [
      {name: "msg", type: "string"},
    ],
  },
  xp: {
    params: [
      {name: "skill", type: "number"},
      {name: "xp", type: "number"},
    ],
  },
};

function getCodeGenData(methodName, data) {
  const paramsSortedBySpread = [...data.params].sort((a, b) => Boolean(a.spread) - Boolean(b.spread));

  return {
    methodName,
    paramsType: `${methodName[0].toUpperCase() + methodName.substr(1)}Params`,
    messageType: `${methodName[0].toUpperCase() + methodName.substr(1)}Message`,
    // using destructured parameter list helps with IDE info on hover.
    destructuredParams: "{" + paramsSortedBySpread.map(p => p.spread ? `...${p.name}` : p.name).join(", ") + "}",
    ...data,
  };
}

function compile({name, rawData, interfacePath, builderPath, interfaceFirstArgType, interfaceFirstArgModule}) {
  const datas = Object.entries(rawData)
    .map(([methodName, data]) => getCodeGenData(methodName, data))
    .sort((a, b) => a.methodName.localeCompare(b.methodName));

  const containerModuleRel = path.posix.relative(path.dirname(interfacePath), "./src/container");
  const interfaceFirstArgModuleRel = path.posix.relative(path.dirname(interfacePath), interfaceFirstArgModule);

  let interfaceCode = `import ${interfaceFirstArgType} from '${interfaceFirstArgModuleRel}';\n`;
  interfaceCode += `import Container from '${containerModuleRel}';\n\n`;
  for (const data of datas) {
    const spreadParamTypes = data.params.filter(p => p.spread).map(p => p.type);
    const extendsCode = spreadParamTypes.length ? " extends " + spreadParamTypes.join(", ") : "";
    let code = `export interface ${data.paramsType}${extendsCode} {`;
    for (const param of data.params) {
      if (param.spread) { continue; }
      code += `\n  ${param.name}${param.optional ? "?" : ""}: ${param.type};`;
    }
    code += "\n}\n\n";
    interfaceCode += code;
  }

  const interfaceFirstArgName = interfaceFirstArgType[0].toLowerCase() + interfaceFirstArgType.substr(1);
  interfaceCode += `export interface ${name} {`;
  for (const data of datas) {
    const params = `${data.destructuredParams}: ${data.paramsType}`;
    const onMethodName = data.methodName[0].toUpperCase() + data.methodName.substr(1);
    const code = `
  on${onMethodName}(${interfaceFirstArgName}: ${interfaceFirstArgType}, ${params}): void;`;
    interfaceCode += code;
  }
  interfaceCode += "\n}\n";

  let builderCode = `import * as Protocol from './${path.basename(interfacePath).replace(".ts", "")}';\n\n`;

  for (const data of datas) {
    let code = `type ${data.messageType} = `;
    code += `{type: ${JSON.stringify(data.methodName)}, args: Protocol.${data.paramsType}}\n`;
    builderCode += code;
  }

  builderCode += `\nexport type Message = ${datas.map(d => d.messageType).join("\n  | ")}\n`;

  for (const data of datas) {
    const code = `
export function ${data.methodName}(${data.destructuredParams}: Protocol.${data.paramsType}): ${data.messageType} {
  return {type: ${JSON.stringify(data.methodName)}, args: ${data.destructuredParams}};
}\n`;
    builderCode += code;
  }

  return {
    [interfacePath]: interfaceCode,
    [builderPath]: builderCode,
  };
}

const clientToServer = compile({
  name: "ClientToServerProtocol",
  rawData: clientToServerRawData,
  interfacePath: "./src/protocol/gen/client-to-server-protocol.ts",
  builderPath: "./src/protocol/gen/client-to-server-protocol-builder.ts",
  interfaceFirstArgType: "Server",
  interfaceFirstArgModule: "./src/server/server",
});

const serverToClient = compile({
  name: "ServerToClientProtocol",
  rawData: serverToClientRawData,
  interfacePath: "./src/protocol/gen/server-to-client-protocol.ts",
  builderPath: "./src/protocol/gen/server-to-client-protocol-builder.ts",
  interfaceFirstArgType: "Client",
  interfaceFirstArgModule: "./src/client/client",
});

for (const [file, code] of Object.entries({...clientToServer, ...serverToClient})) {
  fs.writeFileSync(file, `/* tslint:disable */\n` + code);
}
