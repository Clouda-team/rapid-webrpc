/**
 * Rapid Web RPC Client.
 * 
 */

var RapidClient = (function(){
	
	var socket = null;
	var serverInfo = null;
	var sn = 0;
	var proxys = [];
	var clientid = null;
	var __eventMap = {};
	var status = "offline";
	
	var msgRank = [];
	var waitingCallback = {};
	var sendTimer = null;
	
	var dispatch = function(msg){
		
		if(msg){
			
			switch(msg.type){
				case "callback":
					var args = msg.body , cb;
					
					if(!Array.isArray(args)){
						args = [args];
					}
					
					if(cb = waitingCallback[msg.sn]){
						cb.apply(null,args);
					}
					
					delete waitingCallback[msg.sn];
					
//					console.log("callback ns:%s, rs.lenght : %s",msg.sn,args.length);
					break;
				case "info":
					serverInfo = msg.body || {};
					rpc.__emit("info",serverInfo);
					break;
				case "error":
					var err = new Error("server error");
					err.stack = msg.body;
					rpc.__emit(err);
					break;
				default:
					rpc.__emit("unknownMsg",msg);
					return;
			}
		}
	};
	
	var sendOut = function(msg,waiting){
		
		if(msg){
			
			msg.sn = sn++;
			
			if(msg.type == "call"){
				waitingCallback[msg.sn] = waiting;
			}
			
			msgRank.push(msg);
		}
		
		if(sendTimer){
			return;
		}
		/**
		 * 每100毫秒发送10条消息,每条消息都以uriencode进行编码.并以\n\n结束. 
		 * 这种做法是为了保证服务端可以直接以stream的方式进行读取,同时便于后续
		 * 在前端对大消息进行折分发送时,不影响服务端.
		 */
		sendTimer = setTimeout(function(){
			
			var payload = "";
			
			msgRank.splice(0,10).forEach(function(msg){
				var strify = ""
					
				if("string" != typeof msg){
					strify = JSON.stringify(msg);
				}else{
					strify = msg;
				}
//				console.log(strify);
				payload += encodeURI(strify) + "\n\n";
			});
			
			socket.send(payload);
			
			// 如果还有剩余.
			if(msgRank.length > 0 ){
				setTimeout(sendOut,0);
			}
			
			sendTimer = null;
			
		},100);
		
	}
	
	var buildProxy = function(description){
		
		var rv = {} , name = description.name,  methods, md;
		rv.__description = description, methods = description.methods;
		
		for(var mn in methods){
			md = methods[mn];
			rv[mn] = (function(mn,md){
				var inLen = md.input.length;
				var outLen = md.output ? md.output.length : 0;
				var isNotify = outLen == 0;
				
				return function(){
					
					var args , cb , argsLen, len = arguments.length;
					
					args = Array.prototype.splice.call(arguments, 0 ,len - (isNotify ? 0 : 1));
					cb = isNotify ? null : arguments[0];
					
					argsLen = args.length;
					
					
					/**
					 * 这里只做参数数量上的基本检查.
					 * 原则为:
					 *  	( isNotify : 0 : 1 ) <= args.length <= md.input.length
					 */
					if(argsLen <= inLen){
						
						if(!isNotify && !(cb instanceof Function)){
							throw new Error("callback is not a function");
						}
						
						// 执行远端方法
						sendOut({
							type: isNotify ? "notify" : "call",
							body : args,
							method : name + "." + mn,
						},cb);
						
					}else if(cb && cb instanceof Function){
						cb(new Error("wrong arguments , need [" + md.input.join(",") + "]"))
						return;
					}else{
						throw new Error("wrong arguments , need [" + md.input.join(",") + "]");
					}
				}
			})(mn,md);
		}
		
		return rv;
	}
	
	
	var sendJSON = function(obj){
		socket.send(encodeURI(JSON.stringify(obj)) + "\n\n");
	}
	
	var rpc = {
		setup : function(url,_clientId){
			var me = this;
			if(!clientid){
				clientid = _clientId; 
			}
			
			if(!socket){
				socket = new SockJS(url,undefined,{
					protocols_whitelist : ['websocket', 'xdr-streaming', 'xhr-streaming']
				});
				
				socket.onopen = function(){
					sendOut({type:"echo",body:clientid});
					status = "online";
					me.__emit("online");
				};
				
				socket.onmessage = function(msg){
					var decodeMsg;
//					console.log(msg.data);
					try{
						decodeMsg = JSON.parse(msg.data);
					}catch(e){
						decodeMsg = msg.data;
					}
					
					dispatch(decodeMsg);
				};
				
				socket.onclose = function(reason){
					status = "offline";
					me.__emit("close",reason);
					me.__emit("offline");
				}
			}
		},
		getProxy:function(name,cb){
			var args = arguments , description;
			
			if(!serverInfo){
				setTimeout(function(){
					rpc.getProxy.apply(rpc,args);
				},100);
				return;
			};
			
			if(description = serverInfo[name]){
				cb && cb(null,buildProxy(description));
			}else{
				sendOut({type:"echo",body:clientid});
				
				this.on("info",function(info){
					if(serverInfo[name]){
						cb && cb(null,false);
					}else{
						cb && cb(new Error("can not find the interface description for [" + name + "]"),null);
						return;
					}
				},true);
			}
			
			return;
		},
		on : function(type,handle,once){
			var listeners = __eventMap[type] = __eventMap[type] || [];
			
			if(once){
				var proxyHandle = function(){
					handle.apply(this,arguments);
					var i = listeners.indexOf(proxyHandle);
					listeners.splice(i,1);
				};
				listeners.push(proxyHandle);
			}else{
				listeners.push(handle);
			}
		},
		__emit : function(type){
			var args = Array.prototype.slice.call(arguments,1);
			var listeners = __eventMap[type] = __eventMap[type] || [];
			
			for(var i = listeners.length - 1 ; i >= 0; i--){
				listeners[i].apply(null,args);
			}
		},
		__getSocket:function(){
			return socket;
		},
		__getServerInfo:function(){
			return serverInfo;
		}
	};
	
	return rpc;
})();
