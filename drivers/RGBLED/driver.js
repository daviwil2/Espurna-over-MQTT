// driver.js for RGBLED

'use strict';

const Homey  = require('homey');
const RGBLED = require('../../lib/driver');

module.exports = class extends RGBLED {

  onInit(){
    this.type = 'RGBLED';
  }; // onInit

};
