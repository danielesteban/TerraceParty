#!/usr/local/bin/node
/*
To run this you'll need:
- node.js with handlebars, uglifyjs & less npm packages (to recompile the templates & css)
- Also, it has been only tested on a Mac. Sorry ;{P
*/

var exec = require('child_process').exec,
	fs = require('fs');

function uglify(files, callback) {
	if(!files.length) return callback();
	var file = files.shift();
	console.log('uglifying ' + file + '...');
	exec('uglifyjs bundle/' + file + ' -nco bundle/' + file, function() {
		uglify(files, callback);
	});
}

function md5(files, path, callback, md5s) {
	if(!files.length) return callback(md5s);
	md5s = md5s || [];
	exec('md5 -q bundle' + path + files.shift(), function(err, stdout, stderr) {
		md5s.push(stdout.substr(0, stdout.length - 1));
		md5(files, path, callback, md5s);
	});
}

function compact(files, ext, callback) {
	exec('cat bundle/' + files + ' > bundle/' + ext + '.' + ext, function() {
		md5([ext + '.' + ext], '/', function(md5) {
			exec('mv bundle/' + ext + '.' + ext + ' bundle/' + md5[0] + '.' + ext, function() {
				callback(md5[0]);
			});
		});
	});
}

function genTemplates(callback) {
	//compact
	fs.readdirSync('bundle/templates').forEach(function(template) {
		if(template.indexOf('.handlebars') === -1) return;
		fs.writeFileSync('bundle/templates/' + template, str_replace_array(fs.readFileSync('bundle/templates/' + template, 'utf8'), ["\n", "\r", "\t"], ['', '', '']));
	});
	//compile
	exec('handlebars -m bundle/templates/*.handlebars -f bundle/js/templates.js -k each -k if -k unless -k L -k a -k empty -k i', function() {
		callback();
	});
}

function writeIndex(css, js) {
	var html = fs.readFileSync('bundle/index.html', 'utf8'),
		index = html.substr(0, html.indexOf('<script'));

	index = index.replace(/<html>/, '<html manifest="/app.manifest">');
	index += '<link href="/' + css + '.css" rel="stylesheet" />';
	index += '<script src="/' + js + '.js" charset="utf-8"></script>';
	index += html.substr(html.indexOf('<title>'));
	index = str_replace_array(index, ["\n", "\r", "\t"], ['', '', '']);
	fs.writeFileSync('bundle/index.html', index);
	return require('crypto').createHash('md5').update(index).digest('hex');
}

function genManifest(index, css, js) {
	var manifest = "CACHE:\n/?" + index + "\n" + 
		//"/index.html?" + index + "\n" +
		"/" + css + ".css\n" +
		"/" + js + ".js\n" + 
		"\nFALLBACK:\n/ /?" + index + "\n" +
		//"/index.html /index.html?" + index + "\n" +
		"\nNETWORK:\n" +
		"/app.manifest\n" +
		"/static/\n" +
		"*";

	manifest = "CACHE MANIFEST\n\n# " + require('crypto').createHash('md5').update(manifest).digest('hex') + "\n\n" + manifest;
	fs.writeFileSync('bundle/app.manifest', manifest);
}

function copyModules(callback) {
	var frapp_modules = '../../../app.nw/frapp_modules/';
	exec('cp ' + frapp_modules + 'jquery/jquery.js bundle/js/1jquery.js', function() {
		exec('cp ' + frapp_modules + 'bootstrap/bootstrap.js bundle/js/2bootstrap.js', function() {
			fs.writeFileSync('bundle/css/1bootstrap.css', fs.readFileSync(frapp_modules + 'bootstrap/bootstrap.css', 'utf8').replace(/fonts\//g, 'static/fonts/'));
			exec('cp -R ' + frapp_modules + 'bootstrap/fonts bundle/static/fonts', function() {
				exec('cp ' + frapp_modules + 'handlebars/handlebars-runtime.js bundle/js/3handlebars.js', function() {
					exec('cp ' + frapp_modules + 'router/router.js bundle/js/z1router.js', function() {
						exec('cp ' + frapp_modules + 'lang/lang.js bundle/js/z2Lang.js', function() {
							fs.writeFileSync('bundle/js/z3Init.js', "FRAPP = {" +
								"version : {frapp : '" + JSON.parse(fs.readFileSync('package.json', 'utf8')).version + "'}," +
								"setTitle : function(title) {var t = $('title'); t.text() !== title && t.text(title)}" +
							"};" +
							"typeof window.CustomEvent !== 'function' && (function () {" +
								"function CustomEvent(event, params) {" +
									"params = params || { bubbles: false, cancelable: false, detail: undefined };" +
									"var evt = document.createEvent( 'CustomEvent' );" +
									"evt.initCustomEvent( event, params.bubbles, params.cancelable, params.detail );" +
									"return evt;" +
								"};" +
								"CustomEvent.prototype = window.Event.prototype;" +
								"window.CustomEvent = CustomEvent;" +
							"})();" +
							"$(window).load(function() {" +
								"window.dispatchEvent(new window.CustomEvent('frapp.init'));" +
								"setTimeout(function() { $(window).bind('popstate', function() {ROUTER.update(location.hash.substr(1))}); }, 0);" +
							"});" +
							"window.applicationCache && window.applicationCache.addEventListener('updateready', function(e) {" +
								"if(window.applicationCache.status !== window.applicationCache.UPDATEREADY) return;" +
								"try {" +
									"window.applicationCache.swapCache();" +
								"} catch(e) {}" +
								"window.location.reload();" +
							"}, false);");
							callback();
						});
					});
				});
			});
		});
	});
}

function str_replace(string, find, replace) {
	var i = string.indexOf(find),
		len;

	if(i !== -1) {
		len = find.length;
		do {
			string = string.substr(0, i) + replace + string.substr(i + len);

			i = string.indexOf(find);
		} while(i !== -1);
	}

	return string;
}

function str_replace_array(string, find, replace) {
	for(var i = find.length - 1; i >= 0; --i) {
		if(find[i] !== replace[i]) string = str_replace(string, find[i], replace[i]);
	}

	return string;
}

console.log("Creating bundle...");
exec('rm -rf bundle', function() {
	exec('mkdir bundle', function() {
		exec('cp -R css js static templates index.html bundle/', function() {
			copyModules(function() {
				console.log('compiling templates...');
				genTemplates(function() {
					console.log('compiling css...');
					exec('lessc --compress --clean-css bundle/css/screen.less bundle/css/screen.css', function() {
						exec('rm -rf bundle/templates bundle/css/screen.less', function() {
							uglify([
								'js/frapp.js',
								'js/lang.js',
								'js/z1router.js',
								'js/z2Lang.js',
								'js/z3Init.js'
							], function() {
								console.log('compacting css...');
								compact('css/*.css', 'css', function(cssMD5) {
									console.log('compacting js...');
									compact('js/*.js', 'js', function(jsMD5) {
										console.log('cleaning bundle...');
										exec('rm -rf bundle/js bundle/css', function() {
											console.log('generating index & manifest...');
											var indexMD5 = writeIndex(cssMD5, jsMD5);
											genManifest(indexMD5, cssMD5, jsMD5, function() {
												//exec('rm -rf bundle', function() {
													console.log('Done!');       
												//});
											});
										});
									});
								});
							});
						});
					});
				});
			});
		});
	});
});
