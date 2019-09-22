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
  settings[key] = ManagerSettings.get(key);
}); // keys.forEach

/// declare variables used in other functions

// declare client as we want to access MQTT in most functions
var client;

// get the Device object which gives access to the setCapabilityValue method inside an MQTT client connection object, where 'this' has different scope
const { Device } = require('homey');

class SingleRelayDevice extends Homey.Device {

  // called when the Device is loaded and properties such as name, capabilities and state are available
  onInit(){

    var that = this; // so we can access functions from the Homey.Device class even inside client event handlers where 'this' has a different context

    // construct a connection object and try to connect to the MQTT server
    let port = (settings.port) ? settings.port : '1883'; // default to :1883 if no port specified
    let options = {};
    if (settings.username){ options.username = settings.username };
    if (settings.password){ options.password = settings.password };
    client = mqtt.connect('tcp://'+settings.server+':'+port, options);

    // construct an array containing all the topics on the single relay for which we want to subscribe
    let topics = ['relay/0'];
    topics = topics.map(function(subTopic){ return settings.MQTTtopic+'/'+subTopic });

    // define event handler for MQTT 'connect' events
    client.on('connect', function(){

      // we've successfully connected to the MQTT server so subscribe to the topic for the relay of this device
      client.subscribe(topics, {}, function(err, granted){
        if (err){ callback(err) };
      }); // client.subscribe

    }); // client.on connect

    // define event handler for MQTT 'message' events which are emitted when the client receives a publish packet
    client.on('message', function(topic, message, packet){

      topic = topic.split('/'); // split the string into an array using '/' as the delimiter
      message = message.toString(); // message is a Buffer, so convert to string for display

      // if this is a message about the relay on this MQTT topic
      if (topic[0] === settings.MQTTtopic && topic[1] === 'relay' && topic[2] === '0'){ // we have one relay, relay/0

        message = (message === '1') ? true : false ; // convert the message from text to boolean
        let currentState = that.getState(); // get what Homey thinks is the current state of the relay
        if (currentState.hasOwnProperty('onoff') === false){ return }; // should never happen as the call to getState should return an object with the relevant capability

        // if current state different to the message, set the state in the Homey app
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

    // register a capability listener for the capability 'onoff' which will call the function
    this.registerCapabilityListener('onoff', this._onCapabilityOnoff.bind(this));

  }; // onInit

  // called when the user adds the device, called just after pairing
  onAdded(){

    let name = this.getName();
    this.log('this.getSetting(\'MQTTtopic\')',this.getSetting('MQTTtopic'),'this.getName()',name);
    this.setSettings({'MQTTtopic': name}).catch((err) => {}); // set the default MQTT topic to be the device's name in Homey settings (persistent)
    settings.MQTTtopic = name;                                // set the same value in the local object used in this class

  }; // onAdded

  // called when the user updates the device's settings in the client; overwrite the method in your device.js to approve or reject the new settings.
  // oldSettings and newSettings are objects with the settings blocks, changedKeys is an array of keys changed since the previous version
  onSettings(oldSettings, newSettings, changedKeys){

    this.log('onSettings called, changedKeys',changedKeys);

    // if the setting MQTTtopic has changed then validate that that topic exists on the server
    if (changedKeys.indexOf('MQTTtopic') !== -1){

      // trap for the topic containing a '/'; this shouldn't happen as the RegEx should stop it
      if (newSettings.MQTTtopic.indexOf('/') !== -1){
        return Promise.reject(new Error('MQTT root topic cannot contain a \'/\''));
      }; // if

      this.log('unsubscribing from',oldSettings.MQTTtopic,'subscribing to',newSettings.MQTTtopic);

      // unsubscribe from the old topic
      client.unsubscribe(oldSettings.MQTTtopic+'/relay/0', function(err){
        if (err){ return Promise.reject(err) };
        settings.MQTTtopic = newSettings.MQTTtopic; // update settings.MQTTtopic with new string
        client.subscribe(settings.MQTTtopic+'/relay/0', {}, function(err, granted){
          if (err){ return Promise.reject(err) };
        }); // client.subscribe
      }); // client.unsubscribe

    }; // if (changedKeys...)

    return Promise.resolve(); // to signal no error

  }; // onSettings

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

};

module.exports = SingleRelayDevice;
