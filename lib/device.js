// device.lib.js used by the device.js files

'use strict';

const Homey  = require('homey');
const mqtt   = require('mqtt');
const { ManagerSettings } = require('homey'); // get the ManagerSettings object which gives access to the methods to read and write settings

/// declare variables

var client           = {}; // object to hold the MQTT conenction
var settings         = {}; // object to hold the server (App, not device) settings retrieved from the Homey ManagerSettings API; these are not the per-device Advanced Settings
var advancedSettings = {}; // object to hold the per-device Advanced Settings
var hsv              = []; // array to hold hsv for RGBLEDs

var writeLogs = (process.env.DEBUG === '1') ? true : false ; // write logs using this.log if the App is running in debug mode

var settings, topics, rootTopic, state, capabilities, controls, level, relay;

// populate the settings object from Homey's ManagerSettings; these are the app settings that define the MQTT server, credentials, etc.
function _getSettings(){
  var keys = ManagerSettings.getKeys();
  keys.forEach(function(key){
    settings[key] = ManagerSettings.get(key)
  }); // keys.forEach
}; // _getSettings

// add event handler that is fired when server settings change, to repopulate the local object
ManagerSettings.on('set', function(key){
  _getSettings();
}); // ManagerSettings.on

module.exports = class EspurnaOverMQTTDevice extends Homey.Device {

  // check that the Advanced Settings are populated; new devices won't have these to they need to be set to defaults
  // these are the MQTT topic name and, for RGB LED controllers, whether they control RGB LEDs or White LEDs on either channel 4 or channel 5
  // the defaults are to set the MQTT topic to be the same as the device name, which is itself the MQTT topic name from the MQTT server when paired,
  // and if the device is an RGB LED controller to control RGB LEDs. These can noth be changed in the Homey app under the Advanced Settings for the device
  _defaultAdvancedSettings(){

    // note that the value for this is passed to this function via .call, and passed into the Promise scope by the .bind at the end of the Promise declaration
    return new Promise(function(resolve, reject){

      if (this.getSettings().MQTTtopic == ''){

        if (writeLogs){ this.log('_defaultAdvancedSettings in /lib/device.js, MQTTtopic is empty, setting to '+this.getName()) };
        let defaults = { 'MQTTtopic': this.getName() }; // set the MQTTtopic to be the same as the device name, which is the topic that was returned from the MQTT server during pairing
        if (this.type === 'RGBLED'){ defaults['controls'] = 'RGB' }; // if it's an RGBLED controller that's been added assume it controls RGB LEDs not white LEDs
        this.setSettings(defaults)
        .then(() => {
          if (writeLogs){ this.log('_defaultAdvancedSettings in /lib/device.js, default settings successfully written') };
          return resolve(this.getSettings())
        })
        .catch((err) => {
          return reject(err)
        }); // this.setSettings

      } else {

        return resolve(this.getSettings())

      }; // if

    }.bind(this)); // return new Promise

  }; // _defaultAdvancedSettings

  /// perform device actions, such as toggling on/off state or setting colour, brightness etc. each called by .registerCapabilityListener in onInit()
  /// for all the functions 'this' is passed through the invocation via registerCapabilityListener using .call(...) where 'this' is the first parameter

  // set a relay state on or off
  _setCapabilityOnOff(value, opts, callback){

    advancedSettings = this.getSettings();

    // validate that the opts object contains a valid relay
    if (opts.relay){
      if (['0', '1'].indexOf(opts.relay) == -1){
        return callback(new Error('invalid opts.relay attribute passed in _setCapabilityOnOff in /lib/device.lib.js'), null);
      }; // if
    } else {
      return callback(new Error('opts doesn\'t have a relay attribute in _setCapabilityOnOff in /lib/device.lib.js'), null);
    }; // if

    // value is true of false, so send 0 or 1 via MQTT
    value = (value === false) ? '0' : '1' ;

    if (writeLogs){ this.log('_setCapabilityOnOff called in /lib/device.js, setting relay '+opts.relay+' to '+value+' for topic '+advancedSettings.MQTTtopic) };

    client.publish(advancedSettings.MQTTtopic+'/relay/'+opts.relay+'/set', value, function(err){
      if (err){
        return callback(err, null)
      }; // if
      return callback(null, value)
    }); // client.publish

  }; // _setCapabilityOnOff

  // the H in HSV, value 0-1, range 0-360
  _setCapabilityLightHue(value, opts, callback){

    advancedSettings = this.getSettings();

    // check that the advancedSettings of this controller are for 'RGB'
    if (advancedSettings.hasOwnProperty('controls') == -1){ return new Error('malformed advancedSettings object in _setCapabilityLightHue') };
    if (advancedSettings.controls !== 'RGB'){ return };

    // ensure that hsv is a valid array
    if (Array.isArray(hsv) === false || hsv.length !== 3){ return new Error('hsv is invalid') };

    // calculate the correct array for the new HSV values
    value = Math.round(parseFloat(value) * 360); // convert the decimal number 0-1 to a whole integer 0-360
    value = value.toString();                    // convert the number to a string
    hsv[0] = value;                              // update the first value of the array to this new H value
    let hsvString = hsv.join(',');               // convert the array to a string which is what Espurna expects

    if (writeLogs){ this.log('_setCapabilityLightHue called in /lib/device.js, setting hue to '+hsvString+' for topic '+advancedSettings.MQTTtopic) };

    client.publish(advancedSettings.MQTTtopic+'/hsv/set', hsvString, function(err){
      if (err){
        return callback(err, null)
      }; // if
      return callback(null, value)
    }); // client.publish

  }; // _setCapabilityLightHue

  // the S in HSV, value 0-1, range 0-100
  _setCapabilityLightSaturation(value, opts, callback){

    advancedSettings = this.getSettings();

    // check that the advancedSettings of this controller are for 'RGB'
    if (advancedSettings.hasOwnProperty('controls') == -1 || advancedSettings.controls !== 'RGB'){
      return callback(new Error('malformed advancedSettings object in _setCapabilityLightHue'), null)
    }; // if

    // ensure that hsv is a valid array
    if (Array.isArray(hsv) === false || hsv.length !== 3){
      return callback(new RangeError('hsv is invalid'), null)
    }; // if

    value = Math.round(parseFloat(value) * 100); // convert the decimal number 0-1 to a whole integer 0-360
    value = value.toString();                    // convert the number to a string
    hsv[1] = value;                              // update the second value of the array to this new H value
    let hsvString = hsv.join(',');               // convert the array to a string which is what Espurna expects

    if (writeLogs){ this.log('_setCapabilityLightSaturation called in /lib/device.js, setting hue to '+hsvString+' for topic '+advancedSettings.MQTTtopic) };

    client.publish(advancedSettings.MQTTtopic+'/hsv/set', hsvString, function(err){
      if (err){
        return callback(err, null);
      }; // if
      return callback(null, value);
    }); // client.publish

  }; // _setCapabilityLightSaturation

  // can either set brightness of root/channel/3 or 4 which is in the Espurna UI as 'Channel 4' or 'Channel 5' and controls the white light, range 0-255
  // or set the V in HSV, for RGB LEDs, range 0-100
  // set according to advancedSettings.controls, RGB or C4 or C5
  _setCapabilityDim(value, opts, callback){

    advancedSettings = this.getSettings();

    // validate that the advancedSettings object is valid and populated for the type of LED control
    if (advancedSettings.hasOwnProperty('controls') == -1 || !advancedSettings.controls){
      return callback(new Error('malformed advancedSettings object in _setCapabilityLightDim'), null)
    }; // if

    switch(advancedSettings.controls){

      // for RGB LEDs on channels 0, 1 and 2
      case 'RGB':

        // ensure that hsv is a valid array
        if (Array.isArray(hsv) === false || hsv.length !== 3){ return callback(new Error('hsv is invalid')) };

        value = Math.round(parseFloat(value) * 100); // convert the decimal number 0-1 to a whole integer 0-100
        value = value.toString();                    // convert the number to a string
        hsv[2] = value;                              // update the third value of the array to this new V value
        let hsvString = hsv.join(',');               // convert the array to a string which is what Espurna expects

        if (writeLogs){ this.log('_setCapabilityLightSaturation called in /lib/device.js for type '+advancedSettings.controls+', setting level to '+hsvString+' for topic '+advancedSettings.MQTTtopic) };

        client.publish(advancedSettings.MQTTtopic+'/hsv/set', hsvString, function(err){
          if (err){
            return callback(err, null)
          }; // if
          return callback(null, value)
        }); // client.publish

        break;

      // for white light control on channel 3 or 4
      case 'C4':
      case 'C5':

        value = Math.round(parseFloat(value) * 255);
        value = value.toString();
        let channel = (advancedSettings.controls === 'C4') ? '3' : '4' ;

        if (writeLogs){ this.log('_setCapabilityLightSaturation called in /lib/device.js for type '+advancedSettings.controls+', setting level to '+value+' for topic '+advancedSettings.MQTTtopic) };

        client.publish(advancedSettings.MQTTtopic+'/channel/'+channel+'/set', value, function(err){
          if (err){
            return callback(err, null)
          }; // if
          return callback(null, value)
        }); // client.publish

        break;

      default:

        return callback(new RangeError('Out of range for value of advancedSettings.controls: '+advancedSettings.controls), null);

    }; // switch

  }; // _setCapabilityDim

  /// handlers for events generated by Homey

  // called when the user adds a new device, called just after pairing, so called just once
  onAdded(){}; // _onAdded

  // called when the Device is loaded and properties such as name, capabilities and state are available
  onInit(){

    // call the function getType() passed from the device.js file for this specific device that returns a it's type as a string
    this.type = this.getType();

    // validate that type is specified and valid
    if (!this.type || ['RGBLED', 'SingleRelay', 'DoubleRelay'].indexOf(this.type) == -1){
      throw new Error('invalid or missing type passed to onPair in ./lib/driver.lib.js')
    }; //if

    // ensure that the Advanced Settings are populated so we know to which MQTTtopic to subscribe
    this._defaultAdvancedSettings.call(this)
    .then((advancedSettings) =>{

      // populate the settings object with the server address, connection credentials so we can connect to the MQTT server
      _getSettings();

      // check that the MQTTtopic is populated; this should always be the cease as the _defaultAdvancedSettings function populates this for new devices
      rootTopic = this.getSetting('MQTTtopic');
      if (rootTopic == ''){
        throw new Error('MQTTtopic not populated, cannot connect to server and subscribe to topic')
      }; // if

      // populate the topics array with all the relevant topics/subtopics for the type of device, + being wildcard
      topics = (this.type === 'RGBLED') ? ['relay/0', 'brightness', 'color', 'rgb', 'hsv', 'channel/+'] : ['relay/+'] ;
      topics = topics.map(function(subTopic){ return rootTopic+'/'+subTopic });

      // determine port and construct a connection object to connect to the MQTTserver
      let options = {};
      if (settings.username){ options.username = settings.username };
      if (settings.password){ options.password = settings.password };

      if (writeLogs){ this.log('connecting to MQTT server mqtt://'+settings.server+':'+settings.port+' for topic '+rootTopic) };

      // attempt to connect to the MQTT server
      client = mqtt.connect('mqtt://'+settings.server+':'+settings.port, options);

      /// event handlers for the MQTT client events

      // define event handler for MQTT 'connect' events
      client.on('connect', function(){

        if (writeLogs){ this.log('connected to MQTT server') };

        // as we've successfully connected to the MQTT server we can subscribe to the topics for this device
        client.subscribe(topics, {}, function(err, granted){});

      }.bind(this)); // client.on connect

      // define event handler for MQTT 'message' events which are emitted when the MQTT client receives a publish packet
      // we use these to set capability states for the device; e.g. for a double relay switch getCapabilities() returns [ 'onoff.1', 'onoff.2' ]
      // if changing settings using the Homey app then these will get called but are unnecessary as Homey will update
      // the relevant capability automatically; where these handlers are needed are where the device is changed outside
      // of Homey e.g. using another app or via it's web UI
      client.on('message', function(topic, message, packet){

        topic            = topic.split('/'); // split the string into an array using '/' as the delimiter
        message          = message.toString(); // message is a Buffer, so convert to string for display

        state            = this.getState();
        capabilities     = this.getCapabilities();
        advancedSettings = this.getSettings();

        // handle relay message
        if (topic[0] === rootTopic && topic[1] === 'relay'){

          // convert the message from text to boolean
          message = (message === '1') ? true : false ;

          // trap for invalid topic[2]
          if (typeof topic[2] !== 'string' || ['0', '1'].indexOf(topic[2]) == -1){
            if (writeLogs){ this.log('onInit() in /lib/device.js, invalid topic[2] (relay #) in relay message') };
            return;
          }; // if

          switch(this.type){

            case 'RGBLED':
            case 'SingleRelay':

              this.setCapabilityValue('onoff', message)
              .then(() => {})
              .catch((err) => {});
              break;

            case 'DoubleRelay':

              // trap for mismatch between topic[2] (relay #) and properties of the state object
              if ( (topic[2] == '0' && state.hasOwnProperty('onoff.1') === false) || (topic[2] == '1' && state.hasOwnProperty('onoff.2') === false) ){
                if (writeLogs){ this.log('onInit() in /lib/device.js, mismatch between topic[2] (relay #) and properties of the state object') };
                return;
              }; // if

              relay = (topic[2] === '0') ? 'onoff.1' : 'onoff.2' ; // relay 1 is '0', relay 2 is '1'
              this.setCapabilityValue(relay, message)
              .then(() => {})
              .catch((err) => {});
              break;

          }; // switch

        }; // if topic[0]...

        // handle HSV message
        if (topic[0] === rootTopic && topic[1] == 'hsv'){

          // ensure the RGB LED controller for this topic supports HSV, that is is set to RGB and not C4 or C5 white LED
          if (capabilities.indexOf('light_hue') !== -1){

            // convert comma-separated string to array and populate the hsv variable declared earlier
            hsv = message.split(',');

            // per https://developer.athom.com/docs/apps-reference
            // hue is the H in HSV, value expected by Homey 0-1, range returned from the MQTT server 0-360
            // saturation is the S in HSV, value 0-1, range 0-100
            // dim can be either set brightness of root/channel/3 or 4 which is in the Espurna UI as 'Channel 4' or 'Channel 5'
            //   and controls the white light, range 0-255, or set the V in HSV, for RGB LEDs, range 0-100

            // H
            let light_hue = hsv[0];
            light_hue = parseInt(light_hue);
            light_hue = light_hue / 360; // labelMultiplier 360

            // S
            let light_saturation = hsv[1];
            light_saturation = parseInt(light_saturation);
            light_saturation = light_saturation / 100; // labelMultiplier 100

            // V
            let dim = hsv[2];
            dim = parseInt(dim);
            dim = dim / 100; // labelMultiplier 100

            this.setCapabilityValue('light_hue', light_hue)
            .then(() => {
              return this.setCapabilityValue('light_saturation', light_saturation);
            })
            .then(() => {
              return this.setCapabilityValue('dim', dim);
            })
            .then(() => {})
            .catch((err) => {});

          }; //if capabilities.indexOf

        }; // if topic[0]

        // handle channel message
        if (topic[0] === rootTopic && topic[1] == 'channel'){

          // RGB LED
          if (capabilities.light_hue && (topic[2] == '0' || topic[2] == '1' || topic[2] == '2')){ // RGB LED
            message = parseInt(message); // convert to number
            message = (message/100).toFixed(2); // 0-1, to two decimal places
            this.setCapabilityValue('dim', message)
            .then(() => {}) // then this.setCapabilityValue
            .catch((err) => {}); // catch this.setCapabilityValue
          }; // if

          // C4/C5
          if (!capabilities.light_hue && (topic[2] == '3' || topic[2] == '4')){

            // ascertain whether this RGB LED controller is controlling white LEDs on C4 or C5
            controls = advancedSettings.hasOwnProperty('controls') ? advancedSettings.controls : null ;
            if (controls !== null){

              // get the level to which we need to set the light_saturation
              level = null; //
              if (topic[2] == '3' && controls == 'C4'){ level = message };
              if (topic[2] == '4' && controls == 'C5'){ level = message };

              if (level !== null){

                level = parseInt(level); // convert string to number
                level = level/255; // value returned is range 0-255, light_saturation should be 0-1
                level = level.toFixed(2); // round to 2 decimal places

                this.setCapabilityValue('light_saturation', parseInt(level))
                .then(() => {}) // then this.setCapabilityValue
                .catch((err) => {}); // catch this.setCapabilityValue

              }; // if level

            }; //if controls

          }; // if !capabilities

        }; // if topic[0]

      }.bind(this)); // client.on message

      // define event handler for MQTT 'reconnect' events
      client.on('reconnect', function(){});

      // define event handler for MQTT 'error' events
      client.on('error', function(err){
        if (writeLogs){ this.log('MQTT client error: '+err.message) };
        client.end(); // close the MQTT connection
      }); // client.on error

      // register capability listeners and the functions we'll call for each capability appropriate for the type of device
      switch (this.type){

        case 'RGBLED':
          this.registerCapabilityListener('onoff',            (value, opts, callback) => { opts.relay = '0'; this._setCapabilityOnOff.call(this, value, opts, callback); }); // relay/0
          this.registerCapabilityListener('dim',              (value, opts, callback) => { this._setCapabilityDim.call(this, value, opts, callback) });
          this.registerCapabilityListener('light_hue',        (value, opts, callback) => { this._setCapabilityLightHue.call(this, value, opts, callback) });
          this.registerCapabilityListener('light_saturation', (value, opts, callback) => { this._setCapabilityLightSaturation.call(this, value, opts, callback) });
          break;

        case 'SingleRelay':
          this.registerCapabilityListener('onoff',            (value, opts, callback) => { opts.relay = '0'; this._setCapabilityOnOff.call(this, value, opts, callback); }); // relay/0
          break;

        case 'DoubleRelay':
          this.registerCapabilityListener('onoff.1',          (value, opts, callback) => { opts.relay = '0'; this._setCapabilityOnOff.call(this, value, opts, callback); }); // relay/0
          this.registerCapabilityListener('onoff.2',          (value, opts, callback) => { opts.relay = '1'; this._setCapabilityOnOff.call(this, value, opts, callback); }); // relay/1
          break;

      }; // switch

    })
    .catch((err) => {
      throw err
    });

  }; // onInit

  // called when the user deletes the device
  onDeleted(){
    if (client && client.end){ client.end() }; // terminate the MQTT client if client and the client.end function are available
  }; // onDeleted

  // called when the user updates the device's Advanced Settings in the client; overwrite the method to approve or reject the new settings.
  // oldSettings and newSettings are objects with the settings blocks, changedKeys is an array of keys changed since the previous version
  onSettings(oldSettings, newSettings, changedKeys, callback){

    if (writeLogs){ this.log('onSettings() in /lib/device.js called') };

    // if the setting MQTTtopic has changed...
    if (changedKeys.indexOf('MQTTtopic') !== -1){

      // trap for the topic containing a '/'; this shouldn't happen as the RegEx should stop it
      if (newSettings.MQTTtopic.indexOf('/') !== -1 || newSettings.MQTTtopic.indexOf('+') !== -1){
        return callback(new RangeError('MQTT topic contains one or more invalid characters'), null);
      }; // if

      // unsubscribe from the old topics
      client.unsubscribe(topics, function(err){

        if (err){ return callback(err, null) };

        // update with new string
        this.setSettings( {'MQTTtopic': newSettings.MQTTtopic} );

        // update the topics array with the new MQTT server
        topics = topics.map(function(topic){
          topic = topic.split('/'); // split into an array delimited with '/'
          topic[0] = newSettings.MQTTtopic;
          topic = topic.join('/'); // recombine the array into a string
          return topic; // update the array with the new topic
        }); // topics.map

        // subscribe to the MQTT topics, that array now updated with the new server name
        client.subscribe(topics, {}, function(err, granted){
          if (err){ return callback(err, null) };
          return callback(null); // to signal no error
        }); // client.subscribe

      }); // client.unsubscribe

    }; // if (changedKeys...)

    // catch all
    return callback(null); // to signal no error

  }; // onSettings

}; // module.exports
