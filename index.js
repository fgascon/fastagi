var agi = require('agi');
var Q = require('q');
var slice = [].slice;

function Request(context, params){
	this._context = context;
	this._params = params;
	this.url = 'agi://127.0.0.1/' + (this.get('network_script') || '');
	this.accountcode = this.get('accountcode');
	this.extension = this.get('extension');
	this.context = this.get('context');
	this.channel = this.get('channel');
	this.priority = this.get('priority');
	this.caller = {
		number: this.get('callerid'),
		name: this.get('calleridname')
	};
}

Request.prototype.getAll = function(){
	return this._params;
};

Request.prototype.get = function(name){
	return this._params['agi_'+name];
};

function Executor(context){
	this._context = context;
}

['exec', 'getVariable', 'streamFile', 'waitForDigit', 'hangup'].forEach(function(method){
	Executor.prototype[method] = function(){
		var args = slice.call(arguments);
		var deferred = Q.defer();
		args.push(function(err, res){
			if(err){
				console.error('[ERROR]', err);
				deferred.reject(err);
			}else{
				console.log('[DEBUG]', method, res);
				deferred.resolve();
			}
		});
		var context = this._context;
		context[method].apply(context, args);
		return deferred.promise;
	};
});

Executor.prototype.end = function(){
	this._context.end();
};

function Response(context){
	this._executor = new Executor(context);
	this._currentAction = null;
	this.done = false;
}

['exec', 'getVariable', 'streamFile', 'waitForDigit', 'hangup'].forEach(function(method){
	Response.prototype[method] = function(){
		var args = slice.call(arguments);
		var executor = this._executor;
		function action(){
			return executor[method].apply(executor, args);
		}
		if(this._currentAction){
			this._currentAction = this._currentAction.then(action);
		}else{
			this._currentAction = action();
		}
		return this;
	};
});

Response.prototype.then = function(callback){
	if(this._currentAction){
		this._currentAction = this._currentAction.then(callback);
	}else{
		this._currentAction = Q.when(callback);
	}
	return this;
};

Response.prototype.answer = function(){
	return this.exec('ANSWER');
};

Response.prototype.dial = function(number){
	var args = slice.call(arguments);
	args.unshift('DIAL');
	return this.exec.apply(this, args);
};

Response.prototype.receiveFax = function(file){
	return this.exec('ReceiveFax', file);
};

Response.prototype.end = function(handler){
	handler || (handler = function(){});
	this.done = true;
	var executor = this._executor;
	function done(err){
		executor.end();
		handler(err);
	}
	if(this._currentAction){
		this._currentAction.done(function(){
			done();
		}, done);
	}else{
		done();
	}
	return this;
};

exports.createServer = function(handler){
	return agi.createServer(function(context){
		context.on('variables', function(vars){
			var req = new Request(context, vars);
			var res = new Response(context);
			handler(req, res);
		});
	});
};