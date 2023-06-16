const { EventEmitter } = require('fbemitter');
const { MediaStream } = require('../cubeDependencies');
const Janus = require('./janus');
const Utils = require('../cubeInternalUtils');
const coreConfig = require('../cubeConfig');
const { JANUS_EVENTS, JANUS_MEDIA_TRACKS_REASONS } = require('./cubeConferenceConstants');

class JanusVideoConferencingWrapper {
  constructor(configParams) {
    if (!Utils.getEnv().reactnative && !adapter) {
        throw 'Error: in order to use this library please connect adapter.js. More info https://github.com/webrtc/adapter'
    }
    
    this.token = configParams.token
    delete configParams.token

    this.configs = configParams
    if (!this.configs.server) {
        throw `'server' parameter is mandatory.`
    } else if (this.configs.server.includes('http')) {
        this.configs.server = this.configs.server + '/janus'
    }
    if (!this.configs.debug) {
        this.configs.debug = 'all'
    }

    this.engine = null
    this.videoRoomPlugin = null
    this.isOnlyAudio = false
    //
    this.currentRoomId = null
    this.remoteFeeds = {}
    this.remoteJseps = {}
    this.remoteFeedsAttachingInProgress = {}
    /*
     * Deprecated
    this.currentMediaDeviceId = null
     */
    this.bitrateTimers = {}
    //
    this.emitter = new EventEmitter()
  }

  createSession(callbacks) {
    Janus.init({
      debug: this.configs.debug,
      callback: () => {
        if (!Janus.isWebrtcSupported()) {
          Utils.safeCallbackCall(callbacks.error, `Your browser does not support WebRTC, so you can't use this functionality.`);
          return;
        }

        this.engine = new Janus({
          server: this.configs.server,
          iceServers: coreConfig.videochat.iceServers,
          token: this.token,

          success: () => {
            Utils.safeCallbackCall(callbacks.success);
          },
          error: (error) => {
            Utils.safeCallbackCall(callbacks.error, error)
          },
          destroyed: () => {
            Utils.safeCallbackCall(callbacks.destroyed)
          },
          timeoutSessionCallback: () => {
            Utils.safeCallbackCall(callbacks.timeoutSessionCallback)
          }
        });
      }
    });
  }

  getSessionId() {
    if (this.engine) {
      return this.engine.getSessionId()
    }
    return null
  }

  destroySession(callbacks) {
    this.engine.destroy({});

    Utils.safeCallbackCall(callbacks.success);
  }

  attachVideoConferencingPlugin(isRemote, userId, skipMedia, callbacks) {
    let remoteFeed = null;

    const localStream = callbacks.localStream;
    delete callbacks.localStream;

    const displayName = callbacks.displayName;
    delete callbacks.displayName;

    this.engine.attach({
      plugin: 'janus.plugin.videoroom',
      success: (pluginHandle) => {
        if (isRemote) {
          remoteFeed = pluginHandle
          remoteFeed.userId = userId
          this.remoteFeedsAttachingInProgress[userId] = remoteFeed

          const listen = {
            'request': 'join',
            'room': this.currentRoomId,
            'ptype': 'listener',
            'feed': userId,
            'display': displayName
          }

          remoteFeed.send({ 'message': listen })
        } else {
          this.videoRoomPlugin = pluginHandle
        }

        Utils.safeCallbackCall(callbacks.success)
      },
      error: (error) => {
        Utils.safeCallbackCall(callbacks.error, error)
      },
      consentDialog: (on) =>{
        Utils.safeCallbackCall(callbacks.consentDialog, on)
      },
      mediaState: (medium, on) => {
        Utils.safeCallbackCall(callbacks.mediaState, medium, on)
      },
      webrtcState: (on) => {
        Utils.safeCallbackCall(callbacks.webrtcState, on)
      },
      slowLink: (uplink, nacks) => {
        Utils.safeCallbackCall(callbacks.slowLink, uplink, nacks)
      },
      iceState: (iceConnectionState) => {
        Utils.safeCallbackCall(callbacks.iceState, iceConnectionState)
      },
      onmessage: (msg, jsep) => {
        const event = msg['videoroom']

        if (isRemote) {
          if (event) {
            // Remote feed attached
            if (event === 'attached') {
              const feedId = msg['id']
              this.remoteFeeds[feedId] = this.remoteFeedsAttachingInProgress[feedId]
              this.remoteFeedsAttachingInProgress[feedId] = null
            } else if (msg['error']) {
              Utils.safeCallbackCall(callbacks.error, msg['error'])
            }
          }

          if (jsep) {
            const feedId = msg['id']

            // ICE restart case
            if (!feedId) {
            }

            this.remoteJseps[feedId] = jsep

            this.createAnswer({
              remoteFeed: this.remoteFeeds[feedId],
              jsep,
            }, localStream, {
              success: () => {

              },
              error: (error) => {
                Utils.safeCallbackCall(callbacks.error, error)
              }
            })
          }

          // local feed
        } else {
          if (event) {
            // We JOINED
            if (event === 'joined') {
              const media = skipMedia ? { audio: false, video: false } : { audio: true, video: true }
              const existedStream = skipMedia ? null : localStream
              const offerParams = { media, stream: existedStream }
              this.createOffer(offerParams, {
                success: () => {
                  if (msg['publishers']) {
                    const publishers = msg['publishers']
                    for (const f in publishers) {
                      const userId = publishers[f]['id']
                      const userDisplayName = publishers[f]['display']
                      this.emitter.emit(JANUS_EVENTS.PARTICIPANT_JOINED, userId, userDisplayName, true)
                    }
                  }
                },
                error: (error) => {
                  Utils.safeCallbackCall(callbacks.error, error)
                }
              })

              // We JOINED and now receiving who is online
            } else if (event === 'event') {
              // Any new feed to attach to?
              if (msg['publishers']) {
                const publishers = msg['publishers']

                for (const f in publishers) {
                  const userId = publishers[f]['id']
                  const userDisplayName = publishers[f]['display']

                  this.emitter.emit(JANUS_EVENTS.PARTICIPANT_JOINED, userId, userDisplayName, false)
                }

                // Someone is LEAVING
              } else if (msg['leaving']) {
                // One of the publishers has gone away?
                const feedId = msg['leaving']
                const success = this.detachRemoteFeed(feedId)
                if (success) {
                  this.emitter.emit(JANUS_EVENTS.PARTICIPANT_LEFT, feedId, null)
                }

              } else if (msg['unpublished']) {

                // One of the publishers has gone away?
                const feedId = msg['unpublished']
                if (feedId != 'ok') {
                  const success = this.detachRemoteFeed(feedId)
                  if (success) {
                    this.emitter.emit(JANUS_EVENTS.PARTICIPANT_LEFT, feedId, null)
                  }
                }

              } else if (msg['error']) {
                Utils.DLog('[janus error message]', msg['error'])
                // #define VIDEOROOM_ERROR_ID_EXISTS			436
                // #define VIDEOROOM_ERROR_UNAUTHORIZED		433
                //
                this.emitter.emit(JANUS_EVENTS.ERROR, msg)
                Utils.safeCallbackCall(callbacks.error, msg['error'])
              }
            }
          }

          if (jsep) {
            this.videoRoomPlugin.handleRemoteJsep({ jsep: jsep })

            // TODO:
            // handle wrong or unsupported codecs here...
            // const video = msg['video_codec']
            // if(mystream && mystream.getVideoTracks() && mystream.getVideoTracks().length > 0 && !video) {
            // 		'Our video stream has been rejected, viewers won't see us'
            // }
          }
        }
      },
      onlocaltrack: (track, on) => {
        Utils.DLog('[onlocaltrack]', track, on)
        this.onLocalTrack(track, on)
      },
      onremotetrack: (track, mid, on, metadata) => {
        Utils.DLog('[onremotetrack]', track, mid, on, metadata)
        this.onRemoteTrack(remoteFeed, track, mid, on, metadata)
      },
      ondataopen: (channelLabel) => {
        Utils.DLog('[ondataopen]', channelLabel)
        this.emitter.emit(JANUS_EVENTS.DATA_CHANNEL_OPEN, channelLabel)
      },
      ondata: (data, channelLabel) => {
        Utils.DLog('[ondata]', channelLabel, data)
        this.emitter.emit(JANUS_EVENTS.DATA_CHANNEL_MESSAGE, channelLabel, data)
      },
      oncleanup: () => {
        Utils.safeCallbackCall(callbacks.oncleanup)
      },
      detached: () => {

      }
    })
  }

  onLocalTrack(track, on) {
    // this.emitter.emit(JANUS_EVENTS.LOCAL_STREAM, stream)
  }

  onRemoteTrack(remoteFeed, track, mid, on, metadata) {
    const eventType = metadata && metadata.reason

    if (eventType === JANUS_MEDIA_TRACKS_REASONS.CREATED) {
      const isStreamNoExistedBefore = !remoteFeed.stream || !remoteFeed.tracks
      if (isStreamNoExistedBefore) {
        remoteFeed.tracks = { [mid]: track }
        remoteFeed.stream = new MediaStream([track])
      } else {
        remoteFeed.tracks[mid] = track
        remoteFeed.stream.addTrack(track)
      }
      if (isStreamNoExistedBefore) {
        this.emitter.emit(JANUS_EVENTS.REMOTE_STREAM, remoteFeed.userId, remoteFeed.stream)
      }
    } else if (eventType === JANUS_MEDIA_TRACKS_REASONS.ENDED) {
      delete remoteFeed.tracks[mid]

      const trackToRemove = remoteFeed.stream.getTracks().find(streamTrack => streamTrack.kind === track.kind)
      remoteFeed.stream.removeTrack(trackToRemove)
    }

    this.emitter.emit(JANUS_EVENTS.REMOTE_TRACKS_UPDATED, remoteFeed.userId, track, eventType)
  }

  getPluginId () {
    if (this.videoRoomPlugin) {
      return this.videoRoomPlugin.getId()
    }
    return null
  }

  detachVideoConferencingPlugin (callbacks) {
    const clean = () => {
      this.videoRoomPlugin = null

      // detach all remote feeds
      Object.keys(this.remoteFeeds).forEach((userId) => {
        this.detachRemoteFeed(userId)
      })

      this.remoteFeeds = {}
      this.remoteJseps = {}
      /*
       * Deprecated
      this.currentMediaDeviceId = null
       */
    }

    this.videoRoomPlugin.detach({
      success: () => {
        clean()

        Utils.safeCallbackCall(callbacks.success)
      },
      error: (error) => {
        clean()

        Utils.safeCallbackCall(callbacks.error, error)
      },
    })
  }

  join (roomId, userId, isOnlyAudio, callbacks) {
    const displayName = callbacks.displayName
    delete callbacks.displayName

    this.isOnlyAudio = !!isOnlyAudio

    Utils.DLog('isOnlyAudio: ' + this.isOnlyAudio)

    const joinEvent = {
      'request': 'join', 'room': roomId,
      'ptype': 'publisher', 'id': userId, 'display': displayName
    }

    this.videoRoomPlugin.send({
      'message': joinEvent,
      success: (resp) => {
        this.currentRoomId = roomId
        this.currentUserId = userId

        Utils.safeCallbackCall(callbacks.success)
      },
      error: (error) => {
        Utils.safeCallbackCall(callbacks.error, error)
      }
    })
  }

  leave (callbacks) {
    Utils.DLog('leave')

    if (!this.engine.isConnected()) {
      Utils.safeCallbackCall(callbacks.success)
      return
    }

    const leaveEvent = { 'request': 'leave', 'room': this.currentRoomId, 'id': this.currentUserId }

    if (this.videoRoomPlugin) {
      this.videoRoomPlugin.send({ 'message': leaveEvent })
    }
    this.currentRoomId = null
    this.currentUserId = null

    Utils.safeCallbackCall(callbacks.success)
  }

  listOnlineParticipants (roomId, callbacks) {
    const listRequest = { 'request': 'listparticipants', 'room': roomId }

    this.videoRoomPlugin.send({
      'message': listRequest,
      success: (data) => {
        const participants = []
        if (data) {
          participants = data.participants
        }
        Utils.safeCallbackCall(callbacks.success, participants)
      },
      error: (error) => {
        Utils.safeCallbackCall(callbacks.error, error)
      }
    })
  }

  toggleAudioMute () {
    const muted = this.videoRoomPlugin.isAudioMuted()
    if (muted) {
      this.videoRoomPlugin.unmuteAudio()
    } else {
      this.videoRoomPlugin.muteAudio()
    }
    return this.videoRoomPlugin.isAudioMuted()
  }

  isAudioMuted () {
    return this.videoRoomPlugin.isAudioMuted()
  }

  toggleRemoteAudioMute (userId) {
    const remoteFeed = this.remoteFeeds[userId]
    if (!remoteFeed) {
      return false
    }

    const audioTracks = remoteFeed.stream.getAudioTracks()
    if (audioTracks && audioTracks.length > 0) {
      for (let i = 0; i < audioTracks.length; ++i) {
        audioTracks[i].enabled = !audioTracks[i].enabled
      }
      return !audioTracks[0].enabled
    }

    return false
  }

  isRemoteAudioMuted (userId) {
    const remoteFeed = this.remoteFeeds[userId]
    if (!remoteFeed) {
      return false
    }

    const audioTracks = remoteFeed.stream.getAudioTracks()
    if (audioTracks && audioTracks.length > 0) {
      return !audioTracks[0].enabled
    }

    return false
  }

  toggleVideoMute () {
    const muted = this.videoRoomPlugin.isVideoMuted()
    if (muted) {
      this.videoRoomPlugin.unmuteVideo()
    } else {
      this.videoRoomPlugin.muteVideo()
    }
    return this.videoRoomPlugin.isVideoMuted()
  }

  isVideoMuted() {
    return this.videoRoomPlugin.isVideoMuted();
  }

  toggleRemoteVideoMute(userId) {
    const remoteFeed = this.remoteFeeds[userId];
    if (!remoteFeed) {
      return false;
    }

    const videoTracks = remoteFeed.stream.getVideoTracks();
    if (videoTracks && videoTracks.length > 0) {
      for (let i = 0; i < videoTracks.length; ++i) {
        videoTracks[i].enabled = !videoTracks[i].enabled;
      }
      return !videoTracks[0].enabled;
    }

    return false;
  }

  isRemoteVideoMuted (userId) {
    const remoteFeed = this.remoteFeeds[userId]
    if (!remoteFeed) {
      return false;
    }

    const videoTracks = remoteFeed.stream.getVideoTracks();
    if (videoTracks && videoTracks.length > 0) {
      return !videoTracks[0].enabled;
    }

    return false;
  }

  //TODO: The "switchVideoinput" have to be removed in v3.26.*
  switchVideoinput (mediaDeviceId, callbacks) {
    console.warn(`[ConnectyCube.videochatconference] The method "switchVideoinput(mediaDeviceId, callbacks)" was deprecated. Use "videoConferenceSession.switchMediaTracks(mediaDeviceId): Promise<any>" instead.`);
  }

  //TODO: The "switchAudioinput" have to be removed in v3.26.*
  switchAudioinput (mediaDeviceId, callbacks) {
    console.warn(`[ConnectyCube.videochatconference] The method "switchAudioinput(mediaDeviceId, callbacks)" was deprecated. Use "videoConferenceSession.switchMediaTracks(mediaDeviceId): Promise<any>" instead.`)
  }

  sendKeyframeRequest (roomId, callbacks) { 
    const configureRequest = {
      'request': 'configure', 
      'room': roomId,
      'keyframe': true
    }
    
    this.videoRoomPlugin.send({
      'message': configureRequest,
      success: (response) => {
        Utils.safeCallbackCall(callbacks.success)
      },
      error: (error) => {
        Utils.safeCallbackCall(callbacks.error, error)
      }
    })
  }

  getTracksFromStream(stream) {
    const tracks = []

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length) {
      const audioTrack = audioTracks[0]
      tracks.push({ type: 'audio', capture: audioTrack, recv: false })
    }

    const videoTracks = stream.getVideoTracks()
    if (videoTracks.length) {
      const videoTrack = videoTracks[0]
      tracks.push({ type: 'video', capture: videoTrack, recv: false })
    }

    return tracks
  }

  createOffer (mediaParams, callbacks) {
    Utils.DLog('[JanusWrapper][createOffer]', mediaParams)

    const { stream: existedStream, media, replace } = mediaParams

    const createOfferParams = { tracks: [{ type: 'data' }] }

    if (existedStream) {
      const tracksFromStream = this.getTracksFromStream(existedStream)
      createOfferParams.tracks = createOfferParams.tracks.concat(tracksFromStream)
    } else if (media) {
      const tracksFromParams = []
      if (media.audio) {
        tracksFromParams.push({ type: 'audio', capture: media.audio, recv: false, replace: !!replace })
      }
      if (media.video) {
        tracksFromParams.push({ type: 'video', capture: media.video, recv: false, replace: !!replace })
      }
      createOfferParams.tracks = createOfferParams.tracks.concat(tracksFromParams)
    } else {
      createOfferParams.tracks = createOfferParams.tracks.concat([
        { type: 'audio', capture: true, recv: false, replace: !!replace },
        { type: 'video', capture: true, recv: false, replace: !!replace },
      ])
    }

    Utils.DLog('[JanusWrapper][createOffer][params]', createOfferParams)

    createOfferParams.customizeSdp = (jsep) => {

    }

    createOfferParams.success = (jsep) => {
      const publish = { 'request': 'configure', 'audio': !!media.audio, 'video': !!media.video }
      Utils.DLog('[JanusWrapper][createOffer][success]', publish)

      this.videoRoomPlugin.send({ 'message': publish, 'jsep': jsep })

      Utils.safeCallbackCall(callbacks.success)
    }

    createOfferParams.error = (error) => {
      Utils.DLog('[JanusWrapper][createOffer][error]', error)
      if (media.audio) {
        this.createOffer({ media: { video: false, audio: false }}, callbacks)
      } else {
        Utils.safeCallbackCall(callbacks.error, error)
      }
    }

    this.videoRoomPlugin.createOffer(createOfferParams)
  }

  getTracksMidsFromStream(stream) {
    const tracks = []

    const audioTracks = stream.getAudioTracks()
    if (audioTracks.length) {
      const audioTrack = audioTracks[0]
      tracks.push({ type: 'audio', mid: audioTrack.id, recv: true })
    }

    const videoTracks = stream.getVideoTracks()
    if (videoTracks.length) {
      const videoTrack = videoTracks[0]
      tracks.push({ type: 'video', mid: videoTrack.id, recv: true })
    }

    return tracks
  }

  createAnswer ({ remoteFeed, jsep }, existedStream, callbacks) {
    Utils.DLog('[JanusWrapper][createAnswer]', jsep, existedStream)
    let tracks = [{ type: 'data' }]

    if (existedStream) {
      const tracksFromStream = this.getTracksMidsFromStream(existedStream)
      tracks = tracks.concat(tracksFromStream)
    }

    Utils.DLog('[JanusWrapper][createAnswer][tracks]', tracks)

    remoteFeed.createAnswer({
      jsep: jsep,
      tracks: tracks,
      success: (jsep) => {
        const body = { 'request': 'start', 'room': this.currentRoomId }
        Utils.DLog('[JanusWrapper][createAnswer][success]', body)

        remoteFeed.send({ 'message': body, 'jsep': jsep })

        Utils.safeCallbackCall(callbacks.success)
      },
      error: (error) => {
        Utils.DLog('[JanusWrapper][createAnswer][error]', error)
        Utils.safeCallbackCall(callbacks.error, error)
      }
    })
  }

  detachRemoteFeed (userId) {
    const remoteFeed = this.remoteFeeds[userId]
    if (remoteFeed) {
      remoteFeed.detach()
      this.remoteFeeds[userId] = null
      this.remoteJseps[userId] = null
      return true
    }
    return false
  }

  getUserBitrate (userId) {
    const remoteFeed = this.remoteFeeds[userId]
    return remoteFeed.getBitrate()
  }

  getVolume (resultCallback) {
    return this.videoRoomPlugin.getLocalVolume(null, resultCallback)
  }

  getUserVolume (userId, resultCallback) {
    const remoteFeed = this.remoteFeeds[userId]
    return remoteFeed.getRemoteVolume(null, resultCallback)
  }

  showBitrate (userId, element) {
    const remoteFeed = this.remoteFeeds[userId]

    if (!Utils.getEnv().reactnative && (adapter.browserDetails.browser === 'chrome' || adapter.browserDetails.browser === 'firefox')) {
      this.bitrateTimers[userId] = setInterval(() => {
        const bitrate = remoteFeed.getBitrate()
        element.text(bitrate)
      }, 1000)
    }
  }

  hideBitrate (userId, element) {
    if (this.bitrateTimers[userId]) {
      clearInterval(this.bitrateTimers[userId])
    }
    this.bitrateTimers[userId] = null
    element.text = null
  }

  on (eventType, listener) {
    const token = this.emitter.addListener(eventType, listener)
    return token
  }

  removeAllListeners (eventType) {
    if (eventType) {
      this.emitter.removeAllListeners(eventType)
    } else {
      this.emitter.removeAllListeners()
    }
  }
}

module.exports = { Client: JanusVideoConferencingWrapper }