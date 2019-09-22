'use strict';

const Homey = require('homey');
const mqtt  = require('mqtt');

/// get the settings (MQTT server) into a local object

// get the ManagerSettings object which gives access to the methods to read and write settings
const { ManagerSettings } = require('homey');

// get an array of keys, one key per setting
var keys = [];

// create a settings object and itterate over the keys, retrieving the value of each key via a method call on the ManagerSettings object
// this provides a locally-accessible object with the settings data that specifies the MQTT server
var settings = {};

/// add event handers for events triggered in the Homey.Driver class

class RGBLED extends Homey.Driver {

  onInit(){

    keys = ManagerSettings.getKeys();

    // if we have keys stored
    if (keys.length > 1){
      keys.forEach(function(key){
        settings[key] = ManagerSettings.get(key);
      }); // keys.forEach
    }; // if

  }; // onInit

  onPair(socket){

    // run this code when the list_devices event is fired
    socket.on('list_devices', function(data, callback){

      /// get devices

      // declare variables
      var client;
      var port = (settings.port) ? settings.port : '1883'; // default to :1883 if no port specified
      var interval;
      var devices = []; // define empty array of devices that we'll populate with objects in the prescribed format
      var objects = {}; // create an empty object to store the raw data returned from the MQTT server
      var isRGBLED, index, i, device;

      const CLOSETIMEOUT = 10000; // ms == seconds * 1000, 10 seconds
      const EMITTIMEOUT  = 1000;  // 1 second

      // if we have a server defined get devices from MQTT
      if (settings.server){

        // define a function to emit when devices are still being searched if taking a long time, Homey will search for 30 seconds
        function _returnDevices(){

          // itterate over the objects to see if they're app == ESPURNA and if so, if we know enough about them to add them to the array as device objects
          Object.keys(objects).forEach(function(key, index){

            // if it has app == ESPURNA, a host, relay and vcc fields then continue
            if (objects[key]['app'] && objects[key]['app'] == 'ESPURNA' && objects[key]['host'] && objects[key]['relay'] && objects[key]['vcc']){

              isRGBLED = true; // assume it's an RGB LED controller
              if (!objects[key]['brightness'] || !objects[key]['color'] || !objects[key]['rgb'] || !objects[key]['hsv'] || !objects[key]['channel']){
                isRGBLED = false; // it's lacking the keys for an RGB LED controller so it's probably a switch
              }; // if
              if (objects[key]['relay'] && objects[key]['relay']['1']){
                isRGBLED = false; // it has two or more relays so it's not an RGB LED controller as that has only one relay
              }; // if

              // check to see if the devices is already in the devices array
              index = false;
              for (i = 0; i < devices.length; i++){
                if (devices[i]['name'] == objects[key]['host']){ index = i }
              }; // for

              // it's not an RGB LED device and it's in the array at position index, so remove it
              if (isRGBLED === false && index !== false){
                devices = devices.splice(index, 1)
              }; // if

              // it is an RGB LED device and it's not in the array so build an object and push it on
              if (isRGBLED === true && index === false){
                device = {'data': {'id': objects[key]['vcc']}, 'name': objects[key]['host']};
                devices.push(device);
              }; // if

            }; // if

          }); // .forEach

          // emit the current array of devices to the client
          socket.emit('list_devices', devices);

        }; // _returnDevices

        // define a function to close the connection and return the devices to the client
        function _closeConnection(arg){
          clearInterval(interval); // stop sending the list of devices back to the client every 500ms
          client.end(); // close the  connection to the MQTT server
          callback( null, devices ); // run the callback function to return the list of devices back to the client
        }; // _closeConnection

        // take the array (topic converted to an array) and add to or create a nested object with the specified value
        function _assign(array, value){

          function _isObject(obj){
            return obj === Object(obj) && Object.prototype.toString.call(obj) !== '[object Array]'
          }; // _isObject

          /// old code that threw errors

          /*
          // ensure the object within objects is populated to a depth of 3, which is the maximum used by Espurna
          if (!objects[array[0]]){ objects[array[0]] = {} };
          if ((array.length > 1) && (!objects[array[0]][array[1]])){ objects[array[0]][array[1]] = {} };
          if ((array.length > 2) && (!objects[array[0]][array[1]][array[2]])){ objects[array[0]][array[1]][array[2]] = null };

          // add the data to the object
          if (array.length === 1){ objects[array[0]] = value };
          if (array.length === 2){ objects[array[0]][array[1]] = value };
          if (array.length === 3){ objects[array[0]][array[1]][array[2]] = value };
          */

          // ensure the object is populated with the relevant number of objects to a depth of 3, which is the maximum used by Espurna
          if (objects.hasOwnProperty([array[0]]) == false){ objects[array[0]] = {} };
          if ((array.length > 1) && (objects[array[0]].hasOwnProperty([array[1]]) == false)){ objects[array[0]][array[1]] = {} };
          if ((array.length > 2) && (objects[array[0]][array[1]].hasOwnProperty([array[2]]) == false)){ objects[array[0]][array[1]][array[2]] = null };

          // add the data to the object
          if (array.length === 1){ objects[array[0]] = value };
          if (array.length === 2){ objects[array[0]][array[1]] = value };
          if (array.length === 3){ objects[array[0]][array[1]][array[2]] = value };

        }; // _assign

        // after CLOSETIMEOUT run the _closeConnection function
        setTimeout(_closeConnection, CLOSETIMEOUT);

        // every EMITTIMEOUT run the _returnDevices function and store in interval
        interval = setInterval(_returnDevices, EMITTIMEOUT);

        // construct a connection object and try to connect to the MQTT server
        let options = {};
        if (settings.username){ options.username = settings.username };
        if (settings.password){ options.password = settings.password };

        client = mqtt.connect('tcp://'+settings.server+':'+port, options);

        // define event handler for MQTT 'connect' events
        client.on('connect', function(){

          // we've successfully connected so subscribe to the root topic
          client.subscribe('#', {}, function(err, granted){
            if (err){ callback(err) };
          }); // client.subscribe

          // define event handler for MQTT 'message' events which are emitted when the client receives a publish packet
          client.on('message', function(topic, message, packet){
            let array = topic.split('/'); // split the string into an array using '/' as the delimiter
            let value = message.toString(); // message is a Buffer, so convert to string
            _assign(array, value); // add this value (message) to the objects object that is working storage for discovered MQTT devices
          }); // client.on message

        }); // client.on connect

        // define event handler for MQTT 'error' events
        client.on('error', function(err){
          client.end(); // close the connection
          callback(err);
        }); // client.on error

      }; // if

    }); // socket.on

  }; // onPair

}; // class SingleRelayDriver

module.exports = RGBLED;
