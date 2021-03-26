/* eslint-disable max-len */

// https://blog.brkho.com/2017/03/15/dive-into-client-server-web-games-webrtc/
// https://www.youtube.com/watch?v=FExZvpVvYxA&ab_channel=HusseinNasser
// https://medium.com/av-transcode/what-is-webrtc-and-how-to-setup-stun-turn-server-for-webrtc-communication-63314728b9d0
// https://tools.ietf.org/id/draft-nandakumar-rtcweb-sdp-01.html#rfc.section.2
// https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/
// https://stackoverflow.com/a/43788873/2788187

/* eslint-enable max-len */

import * as http from 'http';
// @ts-expect-error
import { RTCPeerConnection as RTCPeerConnection_ } from 'wrtc';
import { WEBRTC_CONFIG } from './config';

const RTCPeerConnection: typeof globalThis.RTCPeerConnection = RTCPeerConnection_;

function createConnection() {
  const peerConnection = new RTCPeerConnection(WEBRTC_CONFIG);

  const dataChannel1 = peerConnection.createDataChannel('guarenteed', { ordered: true });
  const dataChannel2 = peerConnection.createDataChannel('best-effort', { ordered: false, maxRetransmits: 0 });
  // @ts-expect-error
  peerConnection.channels = [dataChannel1, dataChannel2];

  return peerConnection;
}

export class WebRTCSignalServer {
  protected nextConnectionId = 1;
  protected idToConnection = new Map<number, RTCPeerConnection>();

  constructor(public onConnectionEstablished?: (peerConnection: RTCPeerConnection) => void) { }

  async requestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
    if (req.url === '/webrtc') {
      const id = this.nextConnectionId++;
      const peerConnection = createConnection();
      this.idToConnection.set(id, peerConnection);
      const offer = await peerConnection.createOffer();
      peerConnection.setLocalDescription(offer);
      res.writeHead(200);
      res.end(JSON.stringify({ id, offer: peerConnection.localDescription }, null, 2));
      return true;
    } else if (req.method === 'POST' && req.url === '/webrtc/answer') {
      const data = await new Promise<any>((resolve) => {
        const body: Buffer[] = [];
        req.on('data', (chunk) => {
          body.push(chunk);
        }).on('end', () => {
          const json = Buffer.concat(body).toString();
          resolve(JSON.parse(json));
        });
      });

      const peerConnection = this.idToConnection.get(data.id);
      if (!peerConnection) return;

      await peerConnection.setRemoteDescription(data.answer);
      this.idToConnection.delete(data.id);
      if (this.onConnectionEstablished) this.onConnectionEstablished(peerConnection);

      res.writeHead(200);
      res.end();
      return true;
    }
  }
}
