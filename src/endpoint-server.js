/**
 * Web RPC Services. 
 * publish the functional end-point for Web App.
 * 
 * 
 * 关于api上发布的方法,做如下约定,
 *		1. 需要返回数据或确认调用状态的, 统一使用异步风格,并约定最后一个参数为 callback 用于回传数据.
 *		2. 无需返回及确认状态的方法填接, 无回调参数, 无返回值. 
 * 		3. 参数必须保证可以直接进行完整的JSON序列化.
 * 		
 * 
 * Protocol : 
 * 
 * base : 基本结构,一个json对像.
 * 
 * {
 * 		type:"",	// 消息类型
 * 		body:"",	// 负载内容
 * 
 * 		// --- 其它附加信息 ---
 * 		"key1":"value1",
 * 		"key2":"value2",
 * 		...
 * 		"keyn":"valuen",
 * }
 * 
 * echo : 客户端连接上来之后的第一个消息.用于请求info信息,并通知server端自己是谁.
 * 
 * {
 * 		type:"echo",
 * 		clientId:"",
 * }
 * 
 * Info : 一段JSON信息,用来描述当前服务结点的状态,提供的服务等情况.
 * 
 * {
 * 		type:"info",
 * 		body:{
 * 			points : {
 * 				ifName:{
 * 					methods:{
 * 						methodName1:{
 * 							input:["string","number","object"],
 * 							output:["error","array","string"]
 * 						}
 * 					}
 * 				}
 * 			},
 * 			publish : {
 * 				name:{
 * 					struct:{},
 * 					opts:{
 * 						find:true,
 * 						remove:true,
 * 						update:true,
 * 						save:true
 * 					}
 * 				}
 * 			}
 * 		}
 * }
 * 
 * GlogalError : 一段JSON,用来描述一段非调用方法产生的错误信息. 如客户端消息解析错误等.
 * {
 * 		type:"error",
 * 		body:""			// 错误消息
 * }
 * 
 * Message用于描述通迅内容,固定字段名,结构如下:
 * 
 * {
 *      type:"call"|"callback"|"notify" // 调用类型 Call 表示调用, Notify 表示单向通知调用,不需要返回. Callback 表示方法返回结果.
 *      sn:"",                          // 调用序号,用于标识通信顺序, Call,Notify累加值,每次加1, Callback为对应请求的序号
 *      name:"",                        // 接口名称
 *      method:"MethodName",        	// 方法名称
 *      body:[],                        // 输入参数,使用一个array,注意内容与Methods定义的Input结构相同.
 * 		cid:"",							// clientid,用于在标识唯一client,由server侧解析消息时附加
 * }
 * 
 */

var format = require("util").format;
var Domain = require("domain");

var randomStr =function(_len){
    for(var str = "" , len = _len || 10 ; str.length < len ; str += (~~(Math.random() * 36)).toString(36));
    return str;
};

var defaultInput = function(len){
    for(var arr = [], i = len -1; arr.length < i;arr.push("object"));
    return arr;
};

var SPoint = function(origin, _description,_name){
	
	var me = this , description = _description , name = _name;
	 
	if(!origin){
		throw new Error("origin is undefined");
	}
	
	if(!(me instanceof SPoint)){
		return new SPoint(origin);
	}

	if(!description){
		description = {};
	}
	
	name = me.name = description.name = description.name || name || randomStr(10);
	
	//不相等表示未提供接口描述, 扫描生成
	if(description != _description){
		
		var methods = description.methods = {};
		var method = null , parlen = 0;
		
		for(var key in origin){
            
            // 以下划线开头的,认为是内部方法或对像,直接忽略
            if(key[0] == "_"){
                continue;
            }
            /*
             * 由于需要在线程间通导,所以生成的方法,全为异步方法.
             */
            if((method = origin[key]) instanceof Function){
                /*
                 * function生成代理方法.并创建方法描述,
                 * 这里根据n = function.length做为判断依据, 规则如下:
                 *  
                 *  n = 0 无参数也无传出的通知方法.
                 *  n = 1 无参数但有返回值.
                 *  n > 1 有n - 1个对像参数, 最后一个为callback. 由于这个callback无法检则参数列表, 
                 *        所以认为有两个参数,第一个为错误对像,第二个为数据对像.
                 *        
                 *  由于以上判断方式,所以可见,这里不支持可变参数.其目的为在前端
                 *  能完成一部份参数检查工作,减小server端带宽及压力.
                 *  
                 */
                switch(parlen = method.length || 0){
                    case 0 :
                        methods[key] = {
                            input:[]
                        };
                        break;
                    case 1 :
                        methods[key] = {
                            input:[],
                            output:['error','object']
                        };
                        break;
                    default:
                        methods[key] = {
                            input:defaultInput(parlen),
                            output:['error','object']
                        };
                }
                
                me[key] = (function(origin,method){
                	
                	// 原始方法的代理方法
                    return function(args){
                    	
                    	var len = arguments.length;
                    	
                    	if(len == 1 && Array.isArray(args)){
                    		
                    		// 由于约定好最后个参数应该是一个function.
                    		// 所以如果只有一个参数,并且是array,则表示在外层已经拼接了参数列表. 
                    		method.apply(origin,args);
                    		
                    	}else if(len >= 1 && typeof(arguments[len - 1]) == "function"){
                    		
                    		// 如果有大于1个参数,并且最后一个参数是一个function,表示没有拼接,只是正常的调用 
                    		method.apply(origin,arguments);
                    		
                    	}else if(len == 0 && method.length == 0){
                    		
                    		// 没有调用参数,原始方法也没有参数,确认为通知方法.
                    		method.apply(origin,arguments);
                    		
                    	}else{
                    		
                    		// 错误调用
                    		throw new Error("error arguments");
                    		
                    	}
                    };
                })(origin,method);
            }else{
                /*
                 * 非function,生成get方法. set方法建议由原始对像自己实现.例如有些属性不应该被改变
                 */
                me[getterName(key)] = (function(origin,key){
                    return function(cb){
                        cb && cb(origin[key]);
                    };
                })(origin,key);
            }
        }
	}
	
	me.toString = function(){
		return JSON.stringify(description);
	};
	
	me.valueOf = function(){
		return description;
	};
}


// Client

var ClientPrototype = {
		parseMsg : function(msg){
			var spliceStr = "\n\n", index;
			
			if((index = this.__receiveStr.lastIndexOf(spliceStr)) == -1){
				// waiting next
				return;
			}
			
			// 能完整解析的内容
			var parseStr = this.__receiveStr.substring(0,index);
			
			// 剩余的
			this.__receiveStr = this.__receiveStr.substring(index + 2);
			
			var parseArr = parseStr.split(spliceStr);
			
			var msgs = [];
			
			parseArr.forEach(function(str){
				var me = this;
				var decodeStr = decodeURI(str);
				var msg = JSON.parse(decodeStr);
				
				log.dev("dispatch msg : type:%s, method:%s", msg.type , msg.method);
				
				this.dispatch(msg,function(err,msg){
					
					if(err){
						me.emit("error",err);
						return;
					}
					
					me.write(msg);
				});
			},this);
			
		},
		receive:function(msg){
			log.dev("receive message : ",msg);
			this.__receiveStr += msg;
			this.parseMsg();
		},
		setWritable:function(conn){
			this.__conn = conn;
		},
		setServerPoint:function(sp){
			this.__sp = sp;
		},
		write:function(msg){
			if("string" == typeof msg){
				this.__conn.write(msg);
			}else{
				this.__conn.write(JSON.stringify(msg));
			}
		},
		dispatch:function(msg,cb){
			
			if(msg.type == "echo"){
				
				if(this.name != msg.body){
					log.info("WebRPC:client change name from [%s] to [%s]", this.name, msg.body);
				}
				
				this.name = msg.body;
			}
			
			this.__sp.__dispatch(msg,cb);
		}
};

var Client = function(conn,sp){
	var me = Domain.create();
	
	me.__receiveStr = "";
	me.name = "unknow client [" + conn.remoteAddress +"]";
	
	for(var key in ClientPrototype){
		if("function" == typeof ClientPrototype[key]){
			me[key] = me.bind(ClientPrototype[key]);
		}else{
			me[key] = ClientPrototype[key]
		}
	}
	
	me.on("dispose",function(){
		me.__receiveStr = null;
		me.__conn = null;
		me.__sp = null;
	});
	
	me.setWritable(conn);
	me.setServerPoint(sp);
	
	return  me;
}

// service point manager
var SPM = function(){
	this.sps = {};
}

SPM.prototype = {
		// 获得已有服务接口的描述.
		info:function(){
			var iobj = {};
			var pointMgr = this.sps;
			
			for(var key in pointMgr){
				iobj[key] = pointMgr[key].valueOf();
			}
			return iobj;
		},
		// 发布一个服务接口.
		addPoint:function(origin,description,iname){
			var p = new SPoint(origin,description,iname);
			this.sps[p.name] = p;
			return p;
		},
		/**
		 * 接收并处理一条消息
		 */
		__dispatch:function(msg,cb){
			var method = msg.method;
			var body = msg.body;
			var sp = null;
			
			switch(msg.type){
				case "echo":
					
					log.dev("WebRPC: register client , %s", msg.body);
					cb(null,{type:"info", body:this.info()});
					
					return;
				case "notify" :
					cb = "notify";
				case "call" :
					// 两段式方法名,前一级为SP名称,后一级为调用方法名
					if(method && (method = method.split(".")).length ==2){
						
						if(!Array.isArray(body)){
							body  = [body];
						}
						
						if(cb != "notify"){
							if(cb instanceof Function){
								body.push((function(sn,cb){
									return function(){
										var msg = {type:"callback",sn:sn};
										var args = Array.prototype.slice.call(arguments,0);
										msg.body = args;
										cb(null,msg);
									}
								})(msg.sn,cb));
							}else{
								// break and send Error;
								break;
							}
						}
						
						sp = this.sps[method[0]];
						
						if(sp){
							sp[method[1]].apply(sp,body);
						}
						
						return;
					}
					
					//break and send error;
					break;
			}
			
			cb(new Error(format("ignoer the message, [type:%s ]",msg.type)),null);
			
		},
		/**
		 * 添加子服务节点. 将代理一个节点的发布方法.
		 * @param url : {string|function}
		 * 	远端节点的访问位置或访问方法.
		 * 		[http | https | tcp | ws]://host[:port][/path/]
		 * @param opts : {map}
		 * 		连接配置信息
		 */
		addSubnode : function(url,opts){
			
		},
		
		// ------------  以下统统为接入方法 ------------ //
		joint:function(conn){
			var me = this;
			
			/**
			 * 这个方法将用于监听onconnect事件
			 */
			
			var client = new Client(conn,me);
			
//			client.setWritable(conn);
//			client.setServerPoint(me);
			
			client.on("error",function(err){
				// 致命错误..关闭连接.
				log.error("error...\n %s" + err.stack);
				conn.end(JSON.stringify({type:"error",body:err.stack}));
			});
		
			// websocket, xhr-stream and so on by sockjs 
			conn.on("data",function(originMsg){
				client.receive(originMsg);
			});
			
			conn.on("close",function(){
				log.info("dispost domain");
				client.dispose();
			});
			
		}
	 }

 module.exports = SPM;
