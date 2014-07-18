rapid-webrpc
============

基于websocket的rpc封装工具

#How to use the rapid-webrpc

> 示范一个简单的在server端发布方法与在client中使用发布接口的过程.

##At Server-Side
	
	/**
	 *  引入所需的rapid组成. 这里将示范一个简单的接口和rdb查询的操作接口, 
	 *  所以这里使用了simple-mongodb来访问本地的mongodb
	 */
	require("rapid-core");
	require("rapid-httpserver");
	require("rapid-webrpc");
	require("rapid-simple-mongo");
	
	rapid.define({
		"config.rapid-service-sockjs":{
			prefix:"/haha/heihei"
		},
		// httpserver只做为一个文件server,没有其它内容
		"config.rapid-httpserver":{
			autoStart:true,
			mapping:[
			    {	
			    	url:"/*",
			    	resource:"/app/*"
	    		}
			]
		}
	});
	
	rapid.watch("plugin.rapid-simple-mongo","plugin.rapid-service-sockjs",function(mongo,socketMgr){
		
		// 默认连接本地的mongodb.
		var db = mongo.getAgent({},{
			idle:1000 * 10
		});
		// 处理db的错误. 防止没有error handle引发的服务崩溃
		db.on("error",function(err){
			log.err(err);
		})
		
		/**
		 * addPoint方法
		 * 
		 * addPoint(factory,description,name);
		 * 
		 * factory是服务像,上面的方法将被发布为对像的接口.
		 * description是一个描述factory的对像,用来精确描述接口的参数及返回内容. 
		 * name,表示发布接口的名称, 如果description中未提供name,则这个参数升效,否则以description中的为准.
		 * 
		 * 如果未提供description与name, 方法将自动扫描factory的结构,自动生成一个description对像,以及一个随机的名称.
		 * 这个随机的名称,在每次服务启动的时候都会不同.所以,请小心.
		 */
		// 添加一个简单的服务接口
		 socketMgr.addPoint({
			 // 以下划线开头的,直接认为是内部方法,不会向外暴露
			 _notadd:function(){},
			 // 如果没有参数,也没有callback,认为是一个notify方法,只调用,但是并不确认是否执行成功
			 what:function(){
				 console.log(arguments);
			 },
			 // 如果有一个callback,由认为是正常的通迅方法,
			 hello:function(cb){
				 cb && cb(null, "what,what,what???");
			 },
			 // 带参数的方法
			 say:function(name,cb){
				 cb && cb(null, name + " say, what is that???");
			 }
		 },null,"test");
		 
		 // 添加另一个服务接口,这个接口将做一个简单的db查询.
		 socketMgr.addPoint({
			 // 只有一个简单的方法,用来查
			query:function(name,selector,cb){
				name = name || "test";
				selector = selector || {};
				
				db.find(name,selector,function(err,rs){
					cb(err,rs);
				});
			}
		 },null,"db");
		 
	});
	
##At Browser-Side

首选需要将client-side目录下的 "rapid-webrpc.js" 放至到能从browser中访问的位置.


	<!-- 引入两个依赖的库 -->
	<script type="text/javascript" src="./socketjs.js"></script>

	<script type="text/javascript" src="./rapid-webrpc.js"></script>

	<script type="text/javascript">
	
	// 指定连接位置并给出一个client的名称
	RapidClient.setup("/haha/heihei","testclientid" + (Date.now() / 1000));
	
	// 处理一系统的全局事件, error, close, online, offline, unknowMsg 
	RapidClient.on("error",function(err){
		console.log(error);
	});
	
	RapidClient.on("close",function(reason){
		console.log(reason);
	});
	
	RapidClient.on("unknownMsg",function(reason){
		console.log(reason);
	});
	
	//通过getProxy获得一个后端方法的代理对像
	RapidClient.getProxy("test",function(err,test){
		
		if(err){
			console.log(err.stack);
			return;
		}
		
		// 直接使用.
		test.what();
		
		test.say("client ",function(err,rv){
			console.log(rv);
		});
		
		test.hello(function(err,rv){
			console.log(err,rv);
		});
	});
	
	RapidClient.getProxy("db",function(err,db){
		
		if(err){
			console.log(err.stack);
			return;
		}
		
		if(db){
			db.query("demo",{},function(err,rs){
				console.log(err,rs);
			});
		}
	});
	
	</script>