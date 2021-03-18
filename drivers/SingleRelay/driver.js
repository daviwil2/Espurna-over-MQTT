// driver.js for SingleRelay

'use strict';

const Homey       = require('homey');
const SingleRelay = require('../../lib/driver');

module.exports = class extends SingleRelay {

  getType(){
    return 'SingleRelay'
  }; // getType()

};
