/*
function bonjourServiceNameToProtocolInfo(serviceName) {
switch (serviceName) {
case "_adisk._tcp":					return {friendlyName: "Time Capsule Backups",					   	type: "Apple Proprietary"};
case "_afpovertcp._tcp":			return {friendlyName: "AppleTalk Filing Protocol (AFP)",		   	type: "Apple Proprietary"};
case "_airdroid._tcp":				return {friendlyName: "AirDroid App",							   	type: "3rd Party Custom"};
case "_airdrop._tcp":				return {friendlyName: "OSX AirDrop",							   	type: "Apple Proprietary"};
case "_airplay._tcp":				return {friendlyName: "Apple TV",								   	type: "Apple Proprietary"};
case "_airport._tcp":				return {friendlyName: "AirPort Base Station",					   	type: "Apple Proprietary"};
case "_amzn-wplay._tcp":			return {friendlyName: "Amazon Devices",							  	type: "AmazonProprietary"};
case "*._sub._apple-mobdev2._tcp":	return {friendlyName: "OSX Wi-Fi Sync",							  	type: "Apple Proprietary"};
case "_apple-mobdev2._tcp":			return {friendlyName: "OSX Wi-Fi Sync",							  	type: "Apple Proprietary"};
case "_apple-sasl._tcp":			return {friendlyName: "Apple Password Server",					  	type: "Apple Proprietary"};
case "_appletv-v2._tcp":			return {friendlyName: "Apple TV Home Sharing",					  	type: "Apple Proprietary"};
case "_atc._tcp":					return {friendlyName: "Apple Shared iTunes Library",			   	type: "Apple Proprietary"};
case "_sketchmirror._tcp":			return {friendlyName: "Sketch App",								  	type: "3rd Party Custom"};
case "_bcbonjour._tcp":				return {friendlyName: "Sketch App",								  	type: "3rd Party Custom"};
case "_bp2p._tcp":					return {friendlyName: "???",										type: "Unknown"};
case "_Friendly._sub._bp2p._tcp":	return {friendlyName: "???",										type: "Unknown"};
case "_invoke._sub._bp2p._tcp":		return {friendlyName: "???",										type: "Unknown"};
case "_webdav._sub._bp2p._tcp":		return {friendlyName: "???",										type: "Unknown"};
case "_companion-link._tcp":		return {friendlyName: "Airplay 2? Undocumented",					type: "Apple Proprietary"};
case "_cloud._tcp":					return {friendlyName: "Cloud by Dapile",							type: "3rd Party Custom"};
case "_daap._tcp":					return {friendlyName: "Digital Audio Access Protocol (DAAP)",		type: "Apple Proprietary"};
case "_device-info._tcp":			return {friendlyName: "OSX Device Info",							type: "Apple Proprietary"};
case "_distcc._tcp":				return {friendlyName: "Distributed Compiler",						type: "Apple Proprietary"};
case "_dpap._tcp":					return {friendlyName: "Digital Photo Access Protocol (DPAP)",		type: "Apple Proprietary"};
case "_eppc._tcp":					return {friendlyName: "Remote AppleEvents",						  	type: "Apple Proprietary"};
case "_esdevice._tcp":				return {friendlyName: "ES File Share App",						  	type: "3rd Party Custom"};
case "_esfileshare._tcp":			return {friendlyName: "ES File Share App",						  	type: "3rd Party Custom"};
case "_ftp._tcp":					return {friendlyName: "File Transfer Protocol (FTP)",				type: "File Protocol"};
case "_googlecast._tcp":			return {friendlyName: "Google Cast (Chromecast)",					type: "Google Proprietary"};
case "_googlezone._tcp":			return {friendlyName: "Google Zone (Chromecast)",					type: "Google Proprietary"};
case "_hap._tcp":					return {friendlyName: "Apple HomeKit - HomeKit Accessory Protocol", type: "Apple Proprietary"};
case "_homekit._tcp":				return {friendlyName: "Apple HomeKit",							  	type: "Apple Proprietary"};
case "_home-sharing._tcp":			return {friendlyName: "iTunes Home Sharing",						type: "Apple Proprietary"};
case "_http._tcp":					return {friendlyName: "Hypertext Transfer Protocol (HTTP)",		  	type: "File Protocol"};
case "_hudson._tcp":				return {friendlyName: "Jenkins App",								type: "3rd Party Custom"};
case "_ica-networking._tcp":		return {friendlyName: "Image Capture Sharing",					  	type: "Apple Proprietary"};
case "_ichat._tcp":					return {friendlyName: "iChat Instant Messaging Protocol",			type: "Apple Proprietary"};
case "_print._sub._ipp._tcp":		return {friendlyName: "Printers (AirPrint)",						type: "Universal/Shared"};
case "_cups._sub._ipps._tcp":		return {friendlyName: "Printers",									type: "Universal/Shared"};
case "_print._sub._ipps._tcp":		return {friendlyName: "Printers",									type: "Universal/Shared"};
case "_jenkins._tcp":				return {friendlyName: "Jenkins App",								type: "3rd Party Custom"};
case "_KeynoteControl._tcp":		return {friendlyName: "OSX Keynote",								type: "Apple Proprietary"};
case "_keynotepair._tcp":			return {friendlyName: "OSX Keynote",								type: "Apple Proprietary"};
case "_mediaremotetv._tcp":			return {friendlyName: "Apple TV Media Remote",					  	type: "Apple Proprietary"};
case "_nfs._tcp":					return {friendlyName: "Network File System (NFS)",				  	type: "File Protocol"};
case "_nvstream._tcp":				return {friendlyName: "NVIDIA Shield Game Streaming",				type: "3rd Party Custom"};
case "_androidtvremote._tcp":		return {friendlyName: "Nvidia Shield / Android TV",				  	type: "3rd PartyProprietary"};
case "_omnistate._tcp":				return {friendlyName: "OmniGroup (OmniGraffle and other apps)",	  	type: "3rd Party Custom"};
case "_pdl-datastream._tcp":		return {friendlyName: "PDL Data Stream (Port 9100)",				type: "Apple Proprietary"};
case "_photoshopserver._tcp":		return {friendlyName: "Adobe Photoshop Nav",						type: "3rd Party Custom"};
case "_printer._tcp":				return {friendlyName: "Printers - Line Printer Daemon (LPD/LPR)",	type: "Universal/Shared"};
case "_raop._tcp":					return {friendlyName: "AirPlay - Remote Audio Output Protocol",	  	type: "Apple Proprietary"};
case "_readynas._tcp":				return {friendlyName: "Netgear ReadyNAS",							type: "3rd Party Custom"};
case "_rfb._tcp":					return {friendlyName: "OSX Screen Sharing",						  	type: "Apple Proprietary"};
case "_physicalweb._tcp":			return {friendlyName: "Physical Web",								type: "Google Proprietary"};
case "_riousbprint._tcp":			return {friendlyName: "Remote I/O USB Printer Protocol",			type: "Apple Proprietary"};
case "_rsp._tcp":					return {friendlyName: "Roku Server Protocol",						type: "3rd Party Custom"};
case "_scanner._tcp":				return {friendlyName: "Scanners",									type: "Universal/Shared"};
case "_servermgr._tcp":				return {friendlyName: "Server Admin",								type: "Apple Proprietary"};
case "_sftp-ssh._tcp":				return {friendlyName: "Protocol - SFTP",							type: "File Protocol"};
case "_sleep-proxy._udp":			return {friendlyName: "Wake-on-Network / Bonjour Sleep Proxy",	  	type: "Apple Proprietary"};
case "_smb._tcp":					return {friendlyName: "Protocol - SMB",							  	type: "File Protocol"};
case "_spotify-connect._tcp":		return {friendlyName: "Spotify Connect",							type: "3rd Party Custom"};
case "_ssh._tcp":					return {friendlyName: "Protocol - SSH ",							type: "File Protocol"};
case "_teamviewer._tcp":			return {friendlyName: "TeamViewer",								  	type: "3rd Party Custom"};
case "_telnet._tcp":				return {friendlyName: "Remote Login (TELNET)",					  	type: "File Protocol"};
case "_touch-able._tcp":			return {friendlyName: "Apple TV Remote App (iOS devices)",		  	type: "Apple Proprietary"};
case "_tunnel._tcp":				return {friendlyName: "Tunnel",									  	type: "File Protocol"};
case "_udisks-ssh._tcp":			return {friendlyName: "Ubuntu / Raspberry Pi Advertisement",		type: "3rd Party Custom"};
case "_webdav._tcp":				return {friendlyName: "WebDAV File System (WEBDAV)",				type: "File Protocol"};
case "_webdav._tcp":				return {friendlyName: "WebDAV File System (WEBDAV)",				type: "File Protocol"};
case "_workstation._tcp":			return {friendlyName: "Workgroup Manage",							type: "Apple Proprietary"};
case "_xserveraid._tcp":			return {friendlyName: "Xserve RAID",								type: "Apple Proprietary"};
default:							return {friendlyName: "$not listed$",								type: "Unknown"};
}
}

*/

function bonjourServiceNameToProtocolInfo(serviceName) {
  switch (serviceName) {
    case "_adisk._tcp":
      return {
        friendlyName: "Time Capsule Backups",
        type: "Apple Proprietary"
      };
    case "_afpovertcp._tcp":
      return {
        friendlyName: "AppleTalk Filing Protocol (AFP)",
        type: "Apple Proprietary"
      };
    case "_airdroid._tcp":
      return { friendlyName: "AirDroid App", type: "3rd Party Custom" };
    case "_airdrop._tcp":
      return { friendlyName: "OSX AirDrop", type: "Apple Proprietary" };
    case "_airplay._tcp":
      return { friendlyName: "Apple TV", type: "Apple Proprietary" };
    case "_airport._tcp":
      return {
        friendlyName: "AirPort Base Station",
        type: "Apple Proprietary"
      };
    case "_amzn-wplay._tcp":
      return { friendlyName: "Amazon Devices", type: "AmazonProprietary" };
    case "*._sub._apple-mobdev2._tcp":
      return { friendlyName: "OSX Wi-Fi Sync", type: "Apple Proprietary" };
    case "_apple-mobdev2._tcp":
      return { friendlyName: "OSX Wi-Fi Sync", type: "Apple Proprietary" };
    case "_apple-sasl._tcp":
      return {
        friendlyName: "Apple Password Server",
        type: "Apple Proprietary"
      };
    case "_appletv-v2._tcp":
      return {
        friendlyName: "Apple TV Home Sharing",
        type: "Apple Proprietary"
      };
    case "_atc._tcp":
      return {
        friendlyName: "Apple Shared iTunes Library",
        type: "Apple Proprietary"
      };
    case "_sketchmirror._tcp":
      return { friendlyName: "Sketch App", type: "3rd Party Custom" };
    case "_bcbonjour._tcp":
      return { friendlyName: "Sketch App", type: "3rd Party Custom" };
    case "_bp2p._tcp":
      return { friendlyName: "???", type: "Unknown" };
    case "_Friendly._sub._bp2p._tcp":
      return { friendlyName: "???", type: "Unknown" };
    case "_invoke._sub._bp2p._tcp":
      return { friendlyName: "???", type: "Unknown" };
    case "_webdav._sub._bp2p._tcp":
      return { friendlyName: "???", type: "Unknown" };
    case "_companion-link._tcp":
      return {
        friendlyName: "Airplay 2? Undocumented",
        type: "Apple Proprietary"
      };
    case "_cloud._tcp":
      return { friendlyName: "Cloud by Dapile", type: "3rd Party Custom" };
    case "_daap._tcp":
      return {
        friendlyName: "Digital Audio Access Protocol (DAAP)",
        type: "Apple Proprietary"
      };
    case "_device-info._tcp":
      return { friendlyName: "OSX Device Info", type: "Apple Proprietary" };
    case "_distcc._tcp":
      return {
        friendlyName: "Distributed Compiler",
        type: "Apple Proprietary"
      };
    case "_dpap._tcp":
      return {
        friendlyName: "Digital Photo Access Protocol (DPAP)",
        type: "Apple Proprietary"
      };
    case "_eppc._tcp":
      return { friendlyName: "Remote AppleEvents", type: "Apple Proprietary" };
    case "_esdevice._tcp":
      return { friendlyName: "ES File Share App", type: "3rd Party Custom" };
    case "_esfileshare._tcp":
      return { friendlyName: "ES File Share App", type: "3rd Party Custom" };
    case "_ftp._tcp":
      return {
        friendlyName: "File Transfer Protocol (FTP)",
        type: "File Protocol"
      };
    case "_googlecast._tcp":
      return {
        friendlyName: "Google Cast (Chromecast)",
        type: "Google Proprietary"
      };
    case "_googlezone._tcp":
      return {
        friendlyName: "Google Zone (Chromecast)",
        type: "Google Proprietary"
      };
    case "_hap._tcp":
      return {
        friendlyName: "Apple HomeKit - HomeKit Accessory Protocol",
        type: "Apple Proprietary"
      };
    case "_homekit._tcp":
      return { friendlyName: "Apple HomeKit", type: "Apple Proprietary" };
    case "_home-sharing._tcp":
      return { friendlyName: "iTunes Home Sharing", type: "Apple Proprietary" };
    case "_http._tcp":
      return {
        friendlyName: "Hypertext Transfer Protocol (HTTP)",
        type: "File Protocol"
      };
    case "_hudson._tcp":
      return { friendlyName: "Jenkins App", type: "3rd Party Custom" };
    case "_ica-networking._tcp":
      return {
        friendlyName: "Image Capture Sharing",
        type: "Apple Proprietary"
      };
    case "_ichat._tcp":
      return {
        friendlyName: "iChat Instant Messaging Protocol",
        type: "Apple Proprietary"
      };
    case "_print._sub._ipp._tcp":
      return { friendlyName: "Printers (AirPrint)", type: "Universal/Shared" };
    case "_cups._sub._ipps._tcp":
      return { friendlyName: "Printers", type: "Universal/Shared" };
    case "_print._sub._ipps._tcp":
      return { friendlyName: "Printers", type: "Universal/Shared" };
    case "_jenkins._tcp":
      return { friendlyName: "Jenkins App", type: "3rd Party Custom" };
    case "_KeynoteControl._tcp":
      return { friendlyName: "OSX Keynote", type: "Apple Proprietary" };
    case "_keynotepair._tcp":
      return { friendlyName: "OSX Keynote", type: "Apple Proprietary" };
    case "_mediaremotetv._tcp":
      return {
        friendlyName: "Apple TV Media Remote",
        type: "Apple Proprietary"
      };
    case "_nfs._tcp":
      return {
        friendlyName: "Network File System (NFS)",
        type: "File Protocol"
      };
    case "_nvstream._tcp":
      return {
        friendlyName: "NVIDIA Shield Game Streaming",
        type: "3rd Party Custom"
      };
    case "_androidtvremote._tcp":
      return {
        friendlyName: "Nvidia Shield / Android TV",
        type: "3rd PartyProprietary"
      };
    case "_omnistate._tcp":
      return {
        friendlyName: "OmniGroup (OmniGraffle and other apps)",
        type: "3rd Party Custom"
      };
    case "_pdl-datastream._tcp":
      return {
        friendlyName: "PDL Data Stream (Port 9100)",
        type: "Apple Proprietary"
      };
    case "_photoshopserver._tcp":
      return { friendlyName: "Adobe Photoshop Nav", type: "3rd Party Custom" };
    case "_printer._tcp":
      return {
        friendlyName: "Printers - Line Printer Daemon (LPD/LPR)",
        type: "Universal/Shared"
      };
    case "_raop._tcp":
      return {
        friendlyName: "AirPlay - Remote Audio Output Protocol",
        type: "Apple Proprietary"
      };
    case "_readynas._tcp":
      return { friendlyName: "Netgear ReadyNAS", type: "3rd Party Custom" };
    case "_rfb._tcp":
      return { friendlyName: "OSX Screen Sharing", type: "Apple Proprietary" };
    case "_physicalweb._tcp":
      return { friendlyName: "Physical Web", type: "Google Proprietary" };
    case "_riousbprint._tcp":
      return {
        friendlyName: "Remote I/O USB Printer Protocol",
        type: "Apple Proprietary"
      };
    case "_rsp._tcp":
      return { friendlyName: "Roku Server Protocol", type: "3rd Party Custom" };
    case "_scanner._tcp":
      return { friendlyName: "Scanners", type: "Universal/Shared" };
    case "_servermgr._tcp":
      return { friendlyName: "Server Admin", type: "Apple Proprietary" };
    case "_sftp-ssh._tcp":
      return { friendlyName: "Protocol - SFTP", type: "File Protocol" };
    case "_sleep-proxy._udp":
      return {
        friendlyName: "Wake-on-Network / Bonjour Sleep Proxy",
        type: "Apple Proprietary"
      };
    case "_smb._tcp":
      return { friendlyName: "Protocol - SMB", type: "File Protocol" };
    case "_spotify-connect._tcp":
      return { friendlyName: "Spotify Connect", type: "3rd Party Custom" };
    case "_ssh._tcp":
      return { friendlyName: "Protocol - SSH ", type: "File Protocol" };
    case "_teamviewer._tcp":
      return { friendlyName: "TeamViewer", type: "3rd Party Custom" };
    case "_telnet._tcp":
      return { friendlyName: "Remote Login (TELNET)", type: "File Protocol" };
    case "_touch-able._tcp":
      return {
        friendlyName: "Apple TV Remote App (iOS devices)",
        type: "Apple Proprietary"
      };
    case "_tunnel._tcp":
      return { friendlyName: "Tunnel", type: "File Protocol" };
    case "_udisks-ssh._tcp":
      return {
        friendlyName: "Ubuntu / Raspberry Pi Advertisement",
        type: "3rd Party Custom"
      };
    case "_webdav._tcp":
      return {
        friendlyName: "WebDAV File System (WEBDAV)",
        type: "File Protocol"
      };
    case "_webdav._tcp":
      return {
        friendlyName: "WebDAV File System (WEBDAV)",
        type: "File Protocol"
      };
    case "_workstation._tcp":
      return { friendlyName: "Workgroup Manage", type: "Apple Proprietary" };
    case "_xserveraid._tcp":
      return { friendlyName: "Xserve RAID", type: "Apple Proprietary" };
    default:
      return { friendlyName: serviceName, type: "Unknown" };
  }
}

module.exports = { bonjourServiceNameToProtocolInfo };
