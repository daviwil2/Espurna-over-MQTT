// driver.js for SingleRelay

'use strict';

const Homey  = require('homey');
const mqtt   = require('mqtt');
const lib    = require('../../lib/driver.lib.js');

/// add event handers for events triggered in the Homey.Driver class

class SingleRelay extends Homey.Driver {

  onInit(){
    lib.onInit();
  }; // onInit

  onPair(socket){
    lib.onPair(socket, 'SingleRelay');
  }; // onPair

}; // class SingleRelay

module.exports = SingleRelay;
