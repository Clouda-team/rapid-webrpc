/**
 * New node file
 */

var sockjs = require("sockjs");
var prefix = "/services/socket";

var eps = require("./endpoint-server.js");

var server , handle;

var sp = new eps();

rapid.plugin.define("rapid-service-sockjs",["rapid-httpserver","rapid-log"],function(httpd,log,cb){
	rapid.watch("config.rapid-service-sockjs",function(conf){
		prefix = conf.prefix || prefix;
		server = sockjs.createServer({
			prefix:prefix
		});
		
		handle = server.middleware();
		httpd.addService(handle);
		
		server.on("connection",function(conn){
			sp.joint(conn);
		});
		
		sp.on = function(){
			server.on.apply(server,arguments);
		}
		cb(null,sp);
	});
});

