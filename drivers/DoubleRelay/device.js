// device.js for DoubleRelay

'use strict';

const Homey       = require('homey');
const DoubleRelay = require('../../lib/device');

module.exports = class extends DoubleRelay {

  getType(){
    return 'DoubleRelay'
  }; // getType()

};
