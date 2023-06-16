# ConnectyCube React Native SDK for messaging and video calling apps

[ConnectyCube](https://connectycube.com) React Native SDK.

ConnectyCube is a messaging and video calling platform for iOS, Android, Web, React Native, NativeScript and Cordova apps.

Check our [comprehensive guide](https://developers.connectycube.com/reactnative/) for React Native SDK.

# Features

* Messaging - first-class messaging API to build 1-1 and group chats, broadcast channels and so on. Different chat attachments are supported in the cloud.
* Video calling - peer-to-peer and group video calling up to 10 people based on modern WebRTC technologies. Various quality settings and audio/video codecs supported.
* Push notifications - never miss your chat messages with automatic push notifications to offline users. Also receive a push to all your devices when somebody calls you in a video chat.
* Authentication & Users - manage all the things related to user accounts handling, authentication, account data, password reminding etc. Integration with your own user base via external auth mechanisms.
* Chat bots - use chat bots to enable users to conversationally interact with your service or your product. Bots are fully automated services.

For more details check the [ConnectyCube features page](https://connectycube.com/features)

# Connect SDK

Simply install the package in a normal way:

```bash
npm install react-native-connectycube --save
```

and you're ready to go:

```javascript
import ConnectyCube from 'react-native-connectycube'

const credentials = {
    appId: 21,
    authKey: 'hhf87hfushuiwef',
    authSecret: 'jjsdf898hfsdfk'
};

const config = {
    debug: { mode: 1 }
};

ConnectyCube.init(credentials, config);
```

# Contribution

See more information at [CONTRIBUTING.md](.github/CONTRIBUTING.md)

# License

Apache 2.0
