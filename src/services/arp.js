var util = require('util');
const { spawn } = require("child_process");

/**
 * Read the MAC address from the ARP table.
 * 
 * 3 methods for lin/win/mac  Linux reads /proc/net/arp
 * mac and win read the output of the arp command.
 * 
 * all 3 ping the IP first without checking the response to encourage the
 * OS to update the arp table.
 * 
 * 31/12/2014 -- Changelog by Leandre Gohy (leandre.gohy@hexeo.be)
 * - FIX : ping command for windows (-n not -c)
 *
 * 26/08/2013 -- Changelog by Leandre Gohy (leandre.gohy@hexeo.be)
 * - FIX : arp command for OSX (-n not -an)
 * - MODIFY : rewrite Linux lookup function to avoid looping over all entries and returned lines (arp -n IPADDRESS)
 * - MODIFY : rewrite OSX lookup function to avoid looping over all returned lines
 * - FIX : OSX formates double zero as a single one (i.e : 0:19:99:50:3a:3 instead of 00:19:99:50:3a:3)
 * - FIX : lookup functions did not returns the function on error causing callback to be called twice
 * - FIX : Windows lookup function returns wrong mac address due to indexOf usage (192.168.1.1 -> 192.168.1.10)
 * 
 */

var arp = null;

const { get_os_id } = require("iipzy-shared/src/utils/globals");
const { log } = require("iipzy-shared/src/utils/logFile");


var os_id = '';

module.exports.getMAC = function(ipaddress, cb) {
	if(os_id === '') {
		os_id = get_os_id();
		if(os_id !== 'openwrt' ) {
			arp = require("node-arp");
		}
	}
	if(os_id === 'openwrt' ) {
		exports.readMACOpenWrt(ipaddress, cb);
	}
	else {
		arp.getMAC(ipaddress, cb);
	}
};

/**
 * read from arp -n IPADDRESS
 */
module.exports.readMACOpenWrt = function(ipaddress, cb) {
	
	// ping the ip address to encourage the kernel to populate the arp tables
	var ping = spawn("ping", [ "-c", "1", ipaddress ]);
	
	ping.on('close', function (code) {
		// not bothered if ping did not work
		
		var arp = spawn("arp-scan", [ "-x", ipaddress ]);
		var buffer = '';
		var errstream = '';
		arp.stdout.on('data', function (data) {
			buffer += data;
		});
		arp.stderr.on('data', function (data) {
			errstream += data;
		});
		
		arp.on('close', function (code) {
			if (code !== 0) {
				console.log("Error running arp " + code + " " + errstream);
				cb(true, code);
				return;
			}
			
			//log("...readMACOpenWrt: ip = " + ipaddress + ", buffer = " + buffer, "arp ", "info");
			//Parse this format
			//Lookup succeeded : Address                  HWtype  HWaddress           Flags Mask            Iface
			//					IPADDRESS	              ether   MACADDRESS   C                     IFACE
			//Lookup failed : HOST (IPADDRESS) -- no entry
			//There is minimum two lines when lookup is successful
			//??var table = buffer.split('\n');
			//??if (table.length >= 2) {
			var parts = buffer.split('\t').filter(String);
				//log("...readMACOpenWrt: ip = " + ipaddress + ", part[0] = " + parts[0], "arp ", "info");
				//log("...readMACOpenWrt: ip = " + ipaddress + ", part[1] = " + parts[1], "arp ", "info");
				//log("...readMACOpenWrt: ip = " + ipaddress + ", part[2] = " + parts[2], "arp ", "info");
				//log("...readMACOpenWrt: ip = " + ipaddress + ", part[3] = " + parts[3], "arp ", "info");

			cb(false, parts[1]);

			//}
			//cb(true, "Could not find ip in arp table: " + ipaddress);
		});
	});		
};



