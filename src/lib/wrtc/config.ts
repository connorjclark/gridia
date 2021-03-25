export const WEBRTC_CONFIG: RTCConfiguration = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302',
      username: 'hoten',
      credentialType: 'password',
      credential: 'popgoestheweasel',
    },
  ],
};
