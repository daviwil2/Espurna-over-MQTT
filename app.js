'use strict';

// load the sentry.io reporting module and connect to the local sentry.io onpremise instance
const Sentry = require('@sentry/node');
Sentry.init({ dsn: 'http://be763a9646a743aebc6d26fd2c169455@sentry.local:9000/1' });

const Homey = require('homey');

// get the ManagerSettings object which gives access to the methods to read and write settings
const { ManagerSettings } = require('homey');

// get the keys
var keys = ManagerSettings.getKeys();

class Espurna extends Homey.App {

	onInit(){

		console.log('onInit() called in app.js for app \'Espurna over MQTT\'');

		// if we have keys for the settings, display them on the console
		if (keys.length > 0){

			console.log('keys successfully retrieved', keys);
			let value;
			keys.forEach(function(key){
				value = ManagerSettings.get(key);
				console.log('key', key, 'has value', value);
			}); // keys.forEach

		} else {

			console.log('no keys returned from ManagerSettings.getKeys(), setting defaults');

			// as we have no keys we don't have any settings, so set the default values for the settings
			let defaults = {'server': '192.168.1.32', 'port': '1883', 'username': null, 'password': null};
			for (var key in defaults){

				// if this is a defined property of the object, and not one inherited from it's prototype, set the default
				if (defaults.hasOwnProperty(key)){ // ensure only explictly set keys are used, not those inherited from a prototype
					console.log('setting', key, 'to', defaults[key]);
					ManagerSettings.set(key, defaults[key]);
				}; // if

			}; // for

			console.log('keys now', ManagerSettings.getKeys());

		}; // if

		console.log('onInit() finished in app.js for app \'Espurna over MQTT\'');

	}; // onInit

}; // class Espurna

module.exports = Espurna;
