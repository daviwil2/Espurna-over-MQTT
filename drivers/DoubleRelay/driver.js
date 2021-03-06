// driver.js for DoubleRelay

'use strict';

const Homey       = require('homey');
const DoubleRelay = require('../../lib/driver');

module.exports = class extends DoubleRelay {

  onInit(){
    this.type = 'DoubleRelay';
  }; // onInit

};
