// app.js for Espurna

'use strict';

const Homey = require('homey');

// get the ManagerSettings object which gives access to the methods to read and write settings
const { ManagerSettings } = require('homey');

const { Log } = require('homey-log');

var writeLogs = (process.env.DEBUG === '1') ? true : false ; // write logs using this.log if the App is running in debug mode

class Espurna extends Homey.App {

	onInit(){

		// enable logging to sentry if enabled via a URL in an environment variable: if this app crashes due to an
		// uncaughtException or unhandledRejection, homey-log will automatically send a crash report to Sentry
		// (either https://sentry.io/for/javascript/ or https://develop.sentry.dev/self-hosted/)
		this.homeyLog = (Homey.env.HOMEY_LOG_URL !== "") ? new Log({ homey: this.homey }) : undefined ;

		// get the keys with the settings
		var keys = ManagerSettings.getKeys();

		// if we don't have keys for the settings, set to defaults; try to read from environment variables first, falling back to hard-coded
		// defaults if they're not available
		if (keys.length == 0){

			if (writeLogs){ this.log('onInit() in app.js, initialising default settings') };

			// use the default address and port number from env.json if available, if not fall back to hard-coded default values
			var defaultIP, defaultPort, defaultUsername, defaultPassword;

			try {
				defaultIP       = Homey.env.MQTT_SERVER_DEFAULT_IP       ? Homey.env.MQTT_SERVER_DEFAULT_IP       : "192.168.1.1" ;
				defaultPort     = Homey.env.MQTT_SERVER_DEFAULT_PORT     ? Homey.env.MQTT_SERVER_DEFAULT_PORT     : "1833" ;
				defaultUsername = Homey.env.MQTT_SERVER_DEFAULT_USERNAME ? Homey.env.MQTT_SERVER_DEFAULT_USERNAME : null ;
				defaultPassword = Homey.env.MQTT_SERVER_DEFAULT_PASSWORD ? Homey.env.MQTT_SERVER_DEFAULT_PASSWORD : null ;
			}
			catch(err) {
				defaultIP       = "192.168.1.1";
				defaultPort     = "1833";
				defaultUsername = null;
				defaultPassword = null;
			}; // catch

			// as we have no keys we don't have any settings, so set the default values for the settings
			let defaults = {
				'server'   : defaultIP,
				'port'     : defaultPort,
				'username' : defaultUsername,
				'password' : defaultPassword
			}; // let

			// as we have no keys we don't have any settings, so set the default values for the settings
			for (var key in defaults){

				// if this is a defined property of the object, and not one inherited from it's prototype, set the default
				if (defaults.hasOwnProperty(key)){ // ensure only explictly set keys are used, not those inherited from a prototype
					ManagerSettings.set(key, defaults[key]);
				}; // if

			}; // for

			if (writeLogs){ this.log('onInit() in app.js, initialised default settings') };

		}; // if

	}; // onInit

}; // class Espurna

module.exports = Espurna;
