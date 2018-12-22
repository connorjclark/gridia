import * as protocol from './protocol'
import { ServerProtocolContext, ClientProtocolContext, ClientWorldContext, ServerWorldContext } from "./context";

const context = new ServerProtocolContext()
context.reply = function (type, args) {
  outboundMessages.push({
    to: this.currentClient,
    type,
    args,
  })
}
context.world = new ServerWorldContext()
let outboundMessages = [];
const clients = []

function tick() {
  for (const client of clients) {
    // only read one message from a client at a time
    const message = client.getMessage()
    if (message) {
      console.log('from client', message.type, message.args)
      protocol[message.type].apply(context, message.args)
    }
  }

  for (const message of outboundMessages) {
    if (message.to) {
      message.to.send(message.type, message.args)
    } else {
      for (const client of clients) {
        client.send(message.type, message.args)
      }
    }
  }
  outboundMessages = []
}

export function openAndConnectToServerInMemory(context: ClientProtocolContext) {
  function makeWire(context, messageQueue): Wire {
    return {
      send(type, args) {
        const p = protocol[type]
        // @ts-ignore
        if (p.check && p.check(context, args)) {
          // dummy delay
          setTimeout(() => {
            messageQueue.push({
              type,
              args,
            })
          }, 20)
        }
      },
      receive(type, args) {
        console.log('from server', type, args)
        const p = protocol[type]
        // @ts-ignore
        p.apply(context, args)
      },
    }
  }

  const messageQueue = []
  const wire = makeWire(context, messageQueue)
  context.world = new ClientWorldContext(wire)

  const client = {
    getMessage() {
      if (messageQueue.length) {
        return messageQueue.shift()
      }
    },
    send(type, args) {
      // dummy delay
      setTimeout(() => {
        wire.receive(type, args)
      }, 20)
    },
  }
  clients.push(client)

  setInterval(tick, 50)

  return wire
}