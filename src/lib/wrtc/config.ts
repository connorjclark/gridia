export const WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: [
        'stun:hoten.cc:3478',
        'turn:hoten.cc:3478',
      ],
      username: 'hoten',
      credentialType: 'password',
      credential: 'popgoestheweasel',
    },
  ],
};
