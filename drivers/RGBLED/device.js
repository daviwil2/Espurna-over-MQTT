'use strict';

const Homey = require('homey');
const mqtt  = require('mqtt');

/// get the settings (MQTT server) into a local object

// get the ManagerSettings object which gives access to the methods to read and write settings
const { ManagerSettings } = require('homey');

// get an array of keys, one key per setting
const keys = ManagerSettings.getKeys();

// create a settings object and itterate over the keys, retrieving the value of each key via a method call on the ManagerSettings object
// this provides a locally-accessible object with the settings data that specifies the MQTT server
let settings = {};
keys.forEach(function(key){
  settings[key] = ManagerSettings.get(key)
}); // keys.forEach

/// declare variables used in other functions

// declare client as we want to access MQTT in most functions
var client;

// declare hsv as an array as we need to know what it is in the various capability handler functions
var hsv = [];

// declare topics as an array that will contain the topics for which we eish to subscribe
var topics;

// get the Device object which gives access to the setCapabilityValue method inside an MQTT client connection object, where 'this' has different scope
const { Device } = require('homey');

class RGBLEDDevice extends Homey.Device {

  // called when the user adds a new device, called just after pairing, so called just once
  onAdded(){}; // onAdded

  // called when the Device is loaded and properties such as name, capabilities and state are available
  onInit(){

    var that = this; // so we can access functions from the Homey.Device class even inside client event handlers where 'this' has a different context

    /*
      MAYBE I NEED TO HAVE EACH CUSTOM SETTINGS IN A SEPARATE ROOT OBJECT NAME, USING THE MQTTTOPIC AS THE KEY, E.G. 'Study': {'MQTTtopic': 'Study', 'controls': 'RGB'}
      AS MY DIFFERENT BUTTONS ARE GETTING CONFUSED...
      DOES THAT MEAN I HAVE TO HAVE A SEPARATE CLIENT OBJECT FOR THE MQTT CONNECTION TOO?
      WHEN ONINIT() IS CALLED IT RETURNS KEYS [ 'server', 'port', 'username', 'password' ] BUT NOT THOSE SPECIFIC TO THE DEVICE...
    */
    // ensure that the default settings are available to the rest of the function and, if not, set them
    function _defaultSettings(){

      return new Promise(function(resolve, reject){

        // MQTTtopic and controls in the settings object are truthy so simply resolve the promise
        if (settings.MQTTtopic && settings.controls){ return resolve(settings) };

        // MQTTtopic and controls aren't defined in the settings object so set them to default values
        let defaults = {'MQTTtopic': that.getName(), 'controls': 'RGB'};
        that.setSettings(defaults) // set the default MQTT topic to be the device's name in Homey settings (persistent)
        .then(() => {
          settings.MQTTtopic = defaults.MQTTtopic;
          settings.controls  = defaults.controls;
          return resolve(settings);
        }) // .then this.setSettings
        .catch((err) => {
          return reject(err);
        }); // .catch this.setSettings

      }); // return new Promise

    }; // _defaultSettings

    // call the _defaultSettings function that returns a promise; this resolves when the settings for MQTTtopic and controls are available in the settings object
    _defaultSettings()
    .then(() => {

      // populate the topics array with all the relevant topics for an RGB LED controller
      topics = ['relay/0', 'brightness', 'color', 'rgb', 'hsv', 'channel/+'];
      topics = topics.map(function(subTopic){ return settings.MQTTtopic+'/'+subTopic });

      // construct a connection object and try to connect to the MQTT server
      let port = (settings.port) ? settings.port : '1883'; // default to :1883 if no port specified
      let options = {}; // construct and populate an options object
      if (settings.username){ options.username = settings.username };
      if (settings.password){ options.password = settings.password };
      client = mqtt.connect('tcp://'+settings.server+':'+port, options);

      // define event handler for MQTT 'connect' events
      client.on('connect', function(){

        // we've successfully connected to the MQTT server so subscribe to the topics for this device
        client.subscribe(topics, {}, function(err, granted){
          if (err){ callback(err) };
        }); // client.subscribe

      }); // client.on connect

      // define event handler for MQTT 'message' events which are emitted when the client receives a publish packet
      client.on('message', function(topic, message, packet){

        topic = topic.split('/'); // split the string into an array using '/' as the delimiter
        message = message.toString(); // message is a Buffer, so convert to string for display

        // if this message is about the HSV values then split the message string into an array to populate the hsv variable
        if (topic[0] === settings.MQTTtopic && topic[1] == 'hsv'){ hsv = message.split(',') };

        // if this is a message about the relay then we need to process the state and update Homey with the state as reported by MQTT
        if (topic[0] === settings.MQTTtopic && topic[1] === 'relay' && topic[2] === '0'){ // relay is /0

          message = (message === '1') ? true : false ; // convert the message from text to boolean
          let currentState = that.getState(); // get what Homey thinks is the current state of the relay

          // should never happen as the call to getState should return an object with the relevant capability
          if (currentState.hasOwnProperty('onoff') === false){ return };

          // if current state is different to the message, set the state in the Homey app
          if (currentState.onoff !== message){
            that.setCapabilityValue('onoff', message)
            .then(() => {})
            .catch((err) => { console.log(err) });
          }; // if

        }; // if

      }); // client.on message

      // define event handler for MQTT 'reconnect' events
      client.on('reconnect', function(){});

      // define event handler for MQTT 'error' events
      client.on('error', function(err){
        client.end(); // close the connection
      }); // client.on error

      // register a capability listeners and the functions we'll call for each
      this.registerCapabilityListener('onoff',            this._onCapabilityOnoff.bind(this));
      this.registerCapabilityListener('dim',              this._onCapabilityDim.bind(this));
      this.registerCapabilityListener('light_hue',        this._onCapabilityLightHue.bind(this));
      this.registerCapabilityListener('light_saturation', this._onCapabilityLightSaturation.bind(this));

    }) // .then _defaultSettings
    .catch((err) => {

      that.log(err);

    }); // .catch _defaultSettings

  }; // onInit

  // called when the user deletes the device
  onDeleted(){
    client.end();
  }; // onDeleted

  // called when the user updates the device's settings in the client; overwrite the method in your device.js to approve or reject the new settings.
  // oldSettings and newSettings are objects with the settings blocks, changedKeys is an array of keys changed since the previous version
  onSettings(oldSettings, newSettings, changedKeys, settingsCallback){

    // if the setting MQTTtopic has changed...
    if (changedKeys.indexOf('MQTTtopic') !== -1){

      // trap for the topic containing a '/'; this shouldn't happen as the RegEx should stop it
      if (newSettings.MQTTtopic.indexOf('/') !== -1){
        return Promise.reject(new Error('MQTT root topic cannot contain a \'/\''));
      }; // if

      // unsubscribe from the old topics
      client.unsubscribe(topics, function(err){

        if (err){ return Promise.reject(err) };

        // update settings.MQTTtopic with new string
        settings.MQTTtopic = newSettings.MQTTtopic;

        // update the topics array with the new MQTT server
        topics = topics.map(function(topic){
          topic = topic.split('/'); // split into an array delimited with '/'
          topic[0] = newSettings.MQTTtopic;
          topic = topic.join('/'); // recombine the array into a string
          return topic; // update the array with the new topic
        }); // topics.map

        // subscribe to the MQTT topics, that array now updated with the new server name
        client.subscribe(settings.MQTTtopic+'/relay/0', {}, function(err, granted){
          if (err){ return Promise.reject(err) };
          return Promise.resolve(); // to signal no error
        }); // client.subscribe

      }); // client.unsubscribe

    }; // if (changedKeys...)

    // catch all
    return Promise.resolve(); // to signal no error

  }; // onSettings

  // callback function to onSettings event
  settingsCallback(err, result){
    if (err){ this.log('err passed to settingsCallback', err) };
    if (result){ this.log('result passed to settingsCallback', result) };
  }; // settingsCallback

  // called when the Device has requested a state change (turn on or off) and is used to set the value via MQTT
  _onCapabilityOnoff(value, opts, callback){

    // value is true false, so send 0 or 1 via MQTT
    var state        = (value === false) ? '0' : '1' ;
    var currentState = this.getState(); // {onoff: state} where state == null, true or false
    currentState     = (currentState.hasOwnProperty('onoff')) ? currentState = currentState.onoff : null ;

    client.publish(settings.MQTTtopic+'/relay/0/set', state, function(err){
      if (err){ callback(err, null) }; // if
      callback(null, state);
    }); // client.publish

  }; // _onCapabilityOnoff

  // the H in HSV, value 0-1, range 0-360
  _onCapabilityLightHue(value, opts, callback){

    // check that the settings of this controller are for 'RGB'
    if (settings.hasOwnProperty('controls') == -1){ throw new Error('malformed settings object in _onCapabilityLightHue') };

    if (settings.controls !== 'RGB'){
      console.log('not RGB in _onCapabilityLightHue');
      return
    } else {
      console.log('is RGB so going ahead');
    }; // if

    // ensure that hsv is a valid array
    if (Array.isArray(hsv) === false || hsv.length !== 3){ callback(new Error('hsv is invalid')) };

    value = Math.round(parseFloat(value) * 360); // convert the decimal number 0-1 to a whole integer 0-360
    value = value.toString();                    // convert the number to a string
    hsv[0] = value;                              // update the first value of the array to this new H value
    let hsvString = hsv.join(',');               // convert the array to a string which is what Espurna expects

    client.publish(settings.MQTTtopic+'/hsv/set', hsvString, function(err){
      if (err){ callback(err, null) }; // if
      callback(null);
    }); // client.publish

    callback(null);

  }; // _onCapabilityLightHue

  // the S in HSV, value 0-1, range 0-100
  _onCapabilityLightSaturation(value, opts, callback){

    // check that the settings of this controller are for 'RGB'
    if (settings.hasOwnProperty('controls') == -1){ throw new Error('malformed settings object in _onCapabilityLightHue') };
    if (settings.controls !== 'RGB'){
      console.log('not RGB in _onCapabilityLightSaturation');
      return
    } else {
      console.log('is RGB so going ahead')
    }; // if

    // ensure that hsv is a valid array
    if (Array.isArray(hsv) === false || hsv.length !== 3){ callback(new Error('hsv is invalid')) };

    value = Math.round(parseFloat(value) * 100); // convert the decimal number 0-1 to a whole integer 0-360
    value = value.toString();                    // convert the number to a string
    hsv[1] = value;                              // update the second value of the array to this new H value
    let hsvString = hsv.join(',');               // convert the array to a string which is what Espurna expects

    client.publish(settings.MQTTtopic+'/hsv/set', hsvString, function(err){
      if (err){ callback(err, null) }; // if
      callback(null);
    }); // client.publish

    callback(null);

  }; // _onCapabilityLightSaturation

  // can either set brightness of root/channel/3 or 4 which is in the Espurna UI as 'Channel 4' or 'Channel 5' and controls the white light, range 0-255
  // or set the V in HSV, for RGB LEDs, range 0-100
  // set according to the advanced settings property
  _onCapabilityDim(value, opts, callback){

    // validate that the settings object is valid and populated for the type of LED control
    if (settings.hasOwnProperty('controls') == -1 || !settings.controls){
      console.log(settings);
      throw new Error('malformed settings object in _onCapabilityLightHue')
    }; // if

    console.log('_onCapabilityDim', settings.controls, value, opts);

    switch(settings.controls){

      // for RGB LEDs on channels 0, 1 and 2
      case 'RGB':

        // ensure that hsv is a valid array
        if (Array.isArray(hsv) === false || hsv.length !== 3){ callback(new Error('hsv is invalid')) };

        value = Math.round(parseFloat(value) * 100); // convert the decimal number 0-1 to a whole integer 0-100
        value = value.toString();                    // convert the number to a string
        hsv[2] = value;                              // update the third value of the array to this new V value
        let hsvString = hsv.join(',');               // convert the array to a string which is what Espurna expects

        client.publish(settings.MQTTtopic+'/hsv/set', hsvString, function(err){
          if (err){ callback(err, null) };
          callback(null);
        }); // client.publish

        break;

      // for white light control on channel 3 or 4
      case 'C4':
      case 'C5':

        value = Math.round(parseFloat(value) * 255);
        value = value.toString();
        let channel = (settings.controls === 'C4') ? '3' : '4' ;
        client.publish(settings.MQTTtopic+'/channel/'+channel+'/set', value, function(err){
          if (err){ callback(err, null) };
          callback(null);
        }); // client.publish

        break;

    }; // switch

  }; // _onCapabilityDim

}; // class

module.exports = RGBLEDDevice;
