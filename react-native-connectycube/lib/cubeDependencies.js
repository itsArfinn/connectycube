import XMPPClient from '@xmpp/client/react-native';

let ReactNativeWebRTC = {};

try {
  ReactNativeWebRTC = require('react-native-webrtc')
} catch(e) {
  ReactNativeWebRTC = {};
}

global.encodeToBase64 = (input = '') => {
  return require('js-base64').Base64.encode(input)
};

global.decodeFromBase64 = (input = '') => {
  return require('js-base64').Base64.decode(input)
}

const {
  mediaDevices,
  MediaStream,
  MediaStreamTrack,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCRtpReceiver,
  RTCRtpSender,
  RTCSessionDescription,
  RTCView,
} = ReactNativeWebRTC;

module.exports = {
  fetchImpl: fetch,
  formDataImpl: FormData,
  XMPPClient: XMPPClient,
  // WebRTC
  adapter: {
    browserDetails: {
      browser: 'react-native',
      version: 0
    }
  },
  mediaDevices: mediaDevices,
  MediaStream: MediaStream,
  MediaStreamTrack: MediaStreamTrack,
  RTCIceCandidate: RTCIceCandidate,
  RTCPeerConnection: RTCPeerConnection,
  RTCRtpReceiver: RTCRtpReceiver,
  RTCRtpSender: RTCRtpSender,
  RTCSessionDescription: RTCSessionDescription,
  RTCView: RTCView,
  navigator: {
    mediaDevices: {
      enumerateDevices: mediaDevices?.enumerateDevices.bind(mediaDevices),
      getUserMedia: mediaDevices?.getUserMedia.bind(mediaDevices)
    }
  },
}
