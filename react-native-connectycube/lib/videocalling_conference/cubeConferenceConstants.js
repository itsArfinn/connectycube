const CALL_TYPES = {
    VIDEO: 'video',
    AUDIO: 'audio'
}

const DEVICE_INPUT_TYPES = {
    VIDEO: 'videoinput',
    AUDIO: 'audioinput'
}

const JANUS_EVENTS = {
    PARTICIPANT_JOINED: 'participant_joined',
    PARTICIPANT_LEFT: 'participant_left',

    LOCAL_STREAM: 'local_stream',

    REMOTE_STREAM: 'remote_stream',
    REMOTE_TRACKS_UPDATED: 'remote_tracks_updated',

    DATA_CHANNEL_OPEN: 'data_channel_open',
    DATA_CHANNEL_MESSAGE: 'data_channel_message',

    ERROR: 'error'
}

const JANUS_MEDIA_TRACKS_REASONS = {
    CREATED: 'created',
    ENDED: 'ended',
    MUTE: 'mute',
    UNMUTE: 'unmute'
}

module.exports = {
    CALL_TYPES,
    DEVICE_INPUT_TYPES,
    JANUS_EVENTS,
    JANUS_MEDIA_TRACKS_REASONS
}