// device.js for DoubleRelay

'use strict';

const Homey = require('homey');
const lib   = require('../../lib/device.lib.js');

class DoubleRelay extends Homey.Device {

  // called when the user adds a new device, called just after pairing, so called just once
  onAdded(){
    lib.onAdded().call(this);
  }; // onAdded

  // called when the Device is loaded and properties such as name, capabilities and state are available
  onInit(){
    lib.onInit().call(this, 'DoubleRelay');
  }; // onInit

  // called when the user deletes the device
  onDeleted(){
    lib.onDeleted().call(this)
  }; // onDeleted

  // called when the user updates the device's settings in the client; overwrite the method to approve or reject the new settings.
  // oldSettings and newSettings are objects with the settings blocks, changedKeys is an array of keys changed since the previous version
  onSettings(oldSettings, newSettings, changedKeys, callback){
    lib.onSettings.call(this, oldSettings, newSettings, changedKeys, callback)
  }; // onSettings

}; // class

module.exports = DoubleRelay;
