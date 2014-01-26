/* Remote storage stuff */
(function(window) {
	var RPC = function() {
		this.fbAppId = document.location.host.indexOf('localhost') === 0 ? '1378723355721102' : '270786923076066';
	};

	RPC.prototype.connect = function() {
		var self = this;
		!this.onopenCallbacks && (this.onopenCallbacks = []);
		this.socket = new SockJS('http://storage.terraceparty.com:8000/sockjs');
		this.socket.onopen = function() {
			self.onopenCallbacks.forEach(function(cb) {
				cb();
			});
			delete self.onopenCallbacks;
		};
		this.socket.onmessage = this.onmessage.bind(this);
		this.socket.onclose = function() {
			delete self.socket;
		};
	};

	RPC.prototype.onmessage = function(e) {
		try {
			e.data = JSON.parse(e.data);
		} catch(e) {
			return;
		}
		if(e.data.callback && this.callbacks && this.callbacks[e.data.callback]) {
			var cid = e.data.callback;
			this.callbacks[cid](e.data.data);
			delete this.callbacks[cid];
			return;
		}
	};

	RPC.prototype.call = function(func, params, callback) {
		var self = this,
			send = function() {
				self.socket.send(JSON.stringify(params));
			};
		
		func = func.split(':');
		params[func[0]] = func[1];
		params.session = this.session.signedRequest;
		!this.sentToken && (this.sentToken = params.token = this.session.accessToken);
		params.app = this.fbAppId;
		if(callback) {
			if(!this.callbacks) {
				this.callbacks = {};
				this.callbackID = 1;
			}
			params.callback = this.callbackID++;
			this.callbacks[params.callback] = callback;
		}
		if(this.socket && this.socket.readyState === SockJS.OPEN) return send();
		if(this.socket) return this.onopenCallbacks.push(send);
		this.onopenCallbacks = [send];
		this.connect();
	};

	RPC.prototype.login = function(callback) {
		if(this.session) return callback && callback(this.session);
		if(!window.FB) return;
		var self = this;
		FB.login(function(response) {
			if(!response.authResponse) return;
			self.loginCallback(response.authResponse);
			callback && callback();
		}, {scope: 'email,user_birthday'});
	};

	RPC.prototype.loginCallback = function(session) {
		this.session = session;
		this.connect();
		['friends', 'fav'].indexOf(ROUTER.url) !== -1 && ROUTER.reload();
		$('nav .login a').addClass('loggedIn').tooltip('destroy').attr('title', L.logout).tooltip({placement: 'right'});
	};

	RPC.prototype.logout = function(callback) {
		if(!this.session || !window.FB) return;
		var self = this;
		FB.logout(function() {
			delete self.session;
			ROUTER.url === 'fav' && ROUTER.reload();
			$('nav .login a').removeClass('loggedIn').tooltip('destroy').attr('title', L.login).tooltip({placement: 'right'});
		});
	};

	RPC.prototype.getFriends = function(callback) {
		if(!this.session) return callback([]);
		this.call('f:getFriends', {}, function(feed) {
			feed.forEach(function(track) {
				LASTFM.prepTrack(track);
				track.formattedDate = PLAYER.formatDate(track.createdAt);
			});
			callback(feed);
		});
	};

	RPC.prototype.getFav = function(callback) {
		if(!this.session) return callback([]);
		this.call('f:getFav', {}, function(tracks) {
			tracks.forEach(function(track) {
				LASTFM.prepTrack(track);
			});
			callback(tracks);
		});
	};

	RPC.prototype.fav = function(track, callback) {
		var self = this;
		if(!this.session) return this.login(function() {
			self.fav(track, callback);
		});
		this.call('f:fav', {
			track : track.mbid
		}, callback);
	};

	RPC.prototype.isFav = function(track, callback) {
		if(!this.session) return callback(false);
		this.call('f:isFav', {
			track : track.mbid
		}, callback);
	};

	window.RPC = new RPC();
})(window);

/* Lastfm stuff */
(function(window) {
	var LASTFM = function() {
		this.api_key = '6bb5b4d68a50dc62310c3a3852916cc5';
	};

	LASTFM.prototype.req = function(method, params, callback) {
		params.api_key = this.api_key;
		params.format = 'json';
		params.method = method;
		$.get('http://ws.audioscrobbler.com/2.0/', params, callback, 'json').fail(function() {
			callback(false);
		});
	};

	LASTFM.prototype.prepTrack = function(track) {
		track.formattedDuration = PLAYER.formatTime(track.duration);
		return track;
	};

	LASTFM.prototype.getTrack = function(track, callback) {
		var self = this;
		this.req('track.getInfo', {
			mbid : track
		}, function(data) {
			if(!data) return callback();
			data.track.duration = data.track.duration / 1000;
			callback(self.prepTrack(data.track));
		});
	};

	LASTFM.prototype.getArtistTrack = function(artist, callback, exclude) {
		var self = this;
		this.req('artist.getTopTracks', {
			mbid : artist
		}, function(data) {
			if(!data || !data.toptracks) return callback();
			var tracks = data.toptracks.track.length ? data.toptracks.track : [data.toptracks.track],
				track;
			
			tracks.sort(function() {
				return Math.round(Math.random()) - 0.5;
			});
			tracks.forEach(function(result) {
				!track && result.mbid && (!exclude || exclude.indexOf(result.mbid) === -1) && (track = result);
			});
			callback(self.prepTrack(track));
		});
	};

	LASTFM.prototype.getTagTrack = function(tag, callback) {
		var self = this;
		this.req('tag.getTopTracks', {
			tag : tag
		}, function(data) {
			if(!data || !data.toptracks) return callback();
			var tracks = data.toptracks.track.length ? data.toptracks.track : [data.toptracks.track],
				track;
			
			tracks.sort(function() {
				return Math.round(Math.random()) - 0.5;
			});
			tracks.forEach(function(result) {
				!track && result.mbid && (track = result);
			});
			callback(self.prepTrack(track));
		});
	};

	LASTFM.prototype.getCountryTracks = function(country, callback) {
		var self = this;
		this.req('geo.getTopTracks', {
			country : country
		}, function(data) {
			if(!data || !data.toptracks) return callback();
			var tracks = [];
			data = data.toptracks.track.length ? data.toptracks.track : [data.toptracks.track];
			data.sort(function() {
				return Math.round(Math.random()) - 0.5;
			});
			data.forEach(function(track) {
				track.mbid && tracks.push(self.prepTrack(track));
			});
			callback(tracks);
		});
	};

	LASTFM.prototype.getSimilarTrack = function(track, callback, exclude) {
		var self = this,
			process = function(data) {
				var item;
				data.sort(function() {
					return Math.round(Math.random()) - 0.5;
				});
				data.forEach(function(result) {
					!item && result.mbid && (!exclude || exclude.indexOf(result.mbid) === -1) && (item = result);
				});
				return item;
			};

		if(Math.round(Math.random())) {
			this.req('artist.getSimilar', {
				mbid : track.artist.mbid,
				limit : 20
			}, function(data) {
				if(!data || !data.similarartists) return callback(false);
				var artist = process(data.similarartists.artist.length ? data.similarartists.artist : [data.similarartists.artist]);
				if(!artist) return callback(false);
				self.getArtistTrack(artist.mbid, callback, exclude);
			});
		} else {
			this.req('track.getSimilar', {
				mbid : track.mbid,
				limit : 20
			}, function(data) {
				if(!data || !data.similartracks) return callback(false);
				var track = process(data.similartracks.track.length ? data.similartracks.track : [data.similartracks.track]);
				if(!track) return callback(false);
				track.duration = track.duration / 1000;
				callback(self.prepTrack(track));
			});
		}
	};

	LASTFM.prototype.getTopTags = function(callback) {
		this.req('tag.getTopTags', {}, function(data) {
			if(!data || !data.toptags) return callback(false);
			var tags = data.toptags.tag;
			tags.sort(function() {
				return Math.round(Math.random()) - 0.5;
			});
			callback(tags);
		});
	};

	window.LASTFM = new LASTFM();
})(window);

/* Yotube stuff */
(function(window) {
	var YOUTUBE = function() {};

	YOUTUBE.prototype.search = function(feed, param, page, callback) {
		var params = {
				alt : 'json',
				format : 5,
				'start-index' : (page * 50) + 1,
				'max-results' : 50
			}, url;

		switch(feed) {
			case 'videos':
				url = 'http://gdata.youtube.com/feeds/api/videos';
				params.vq = param;
			break;
			default:
				url = 'http://gdata.youtube.com/feeds/api/standardfeeds/' + feed + (param ? '_' + param : '');
		}
		$.get(url, params, function(data) {
			callback(data.feed);
		}, 'json').fail(function() {
			callback(false);
		});
	};

	YOUTUBE.prototype.player = function(track) {
		var states = PLAYER.states,
			callback = function() {
				var ready = null,
					onReady = function() {
						player.addEventListener('onStateChange', onStateChange);
						player.addEventListener('onError', onError);
						player.playVideo();
					},
					onStateChange = function(e) {
						ready === null && [states.playing, states.buffering].indexOf(e.data) !== -1 && (ready = true);
						ready && PLAYER.stateChange(e.data);
						e.data === states.ended && (ready = false);
					},
					onError = function() {
						if(!ready) return;
						ready = false;
						PLAYER.error();
					},
					player = new YT.Player($('.player div div')[0], {
						height: '100%',
						width: '100%',
						videoId: track.bestMatch.provider_id,
						events: {
							'onReady': onReady
						},
						playerVars: {
							autoplay: 1,
							controls: 0,
							showinfo: 0,
							modestbranding: 1,
							iv_load_policy: 3,
							rel: 0,
							hd: 1
						}
					});
				
				delete PLAYER.loading;
				PLAYER.current = {
					track : track,
					play : function() {
						player && player.playVideo && player.playVideo();
					},
					pause : function() {
						player && player.pauseVideo && player.pauseVideo();
					},
					seek : function(time, ahead) {
						player && player.seekTo && player.seekTo(time, ahead);
					},
					destroy : function() {
						ready = false;
						player && player.destroy && player.destroy();
					},
					state : function() {
						return player && player.getPlayerState ? player.getPlayerState() : -1;
					},
					time : function() {
						return player && player.getCurrentTime ? player.getCurrentTime() : 0;
					},
					duration : function() {
						return player && player.getDuration ? player.getDuration() : 0;
					},
					loaded : function() {
						return player && player.getVideoLoadedFraction ? player.getVideoLoadedFraction() : 0;
					}
				};
			};

		if(this.IframeAPILoaded) return callback();
		$.getScript('http://www.youtube.com/iframe_api');
		this.IframeAPIReadyCallback = callback;
	};

	YOUTUBE.prototype.IframeAPIReady = function() {
		this.IframeAPILoaded = 1;
		this.IframeAPIReadyCallback && this.IframeAPIReadyCallback();
		delete this.IframeAPIReadyCallback;
	};

	window.YOUTUBE = new YOUTUBE();
})(window);

function onYouTubeIframeAPIReady() {
	YOUTUBE.IframeAPIReady();
}

/* Soundcloud stuff */
(function(window) {
	var SOUNDCLOUD = function() {
		this.client_id = '4c5b6518feb16067211e9785329d5368';
	};

	SOUNDCLOUD.prototype.search = function(query, callback) {
		var params = {
				client_id : this.client_id,
				filter : 'streamable',
				q : query
			};

		$.get('http://api.soundcloud.com/tracks.json', params, function(data) {
			callback(data);
		}, 'json').fail(function() {
			callback(false);
		});
	};

	SOUNDCLOUD.prototype.player = function(track) {
		var self = this,
			state;

		if(!SoundManager.ready) {
			!SoundManager.callbacks && (SoundManager.callbacks = []);
			return SoundManager.callbacks.push(function() {self.player(track)});
		}
		
		PLAYER.stateChange(state = 3);
		var sound = soundManager.createSound({
				id : 'sound' + track.bestMatch.provider_id,
				url : 'http://api.soundcloud.com/tracks/' + track.bestMatch.provider_id + '/stream?client_id=' + this.client_id,
				autoPlay : true,
				multiShot : false,
				onfinish : function() {
					PLAYER.stateChange(state = PLAYER.states.ended);
				},
				onplay : function() {
					PLAYER.stateChange(state = PLAYER.states.playing);
				},
				onresume : function() {
					PLAYER.stateChange(state = PLAYER.states.playing);
				},
				onpause : function() {
					PLAYER.stateChange(state = PLAYER.states.paused);
				},
				onload : function(ok) {
					delete PLAYER.loading;
					if(!ok) {
						cover && cover.remove();
						sound.destruct();
						return PLAYER.error();
					}
					PLAYER.current = {
						track : track,
						play : function() {
							sound.resume();
						},
						pause : function() {
							sound.pause();
						},
						seek : function(time) {
							sound.setPosition(time * 1000);
						},
						destroy : function() {
							cover && cover.remove();
							sound.destruct();
						},
						state : function() {
							return state;
						},
						time : function() {
							return sound.position ? sound.position / 1000 : 0;
						},
						duration : function() {
							return !sound.bytesTotal || sound.bytesTotal > sound.bytesLoaded ? (track.duration || sound.durationEstimate) : sound.duration / 1000;
						},
						loaded : function() {
							return sound.buffered && sound.buffered.length ? sound.buffered[0].end / 1000 / this.duration() : 0;
						}
					};
				}
			}),
			cover;
		
		if(track.album || track.image) {
			var images = track.album && track.album.image ? track.album.image : track.image;
			$('.player div').first().append(cover = $('<img src="' + images[images.length - 1]['#text'] + '">'));
		}
	};

	window.SOUNDCLOUD = new SOUNDCLOUD();
})(window);

/* Player stuff */
(function(window) {
	var PLAYER = function() {
		this.states = {ended: 0, playing: 1, paused: 2, buffering: 3};
	};

	/* Lib */
	PLAYER.prototype.addZero = function(str) {
		str = str + '';
		if(str.length < 2) str = '0' + str;
		return str;
	};

	PLAYER.prototype.formatTime = function(time) {
		var minutes = Math.floor(time / 60),
			seconds = Math.round(time % 60);
			
		return this.addZero(minutes) + ':' + this.addZero(seconds);
	};

	PLAYER.prototype.formatDate = function(timestamp) {
		var date = new Date(timestamp * 1000);
		return this.addZero(date.getDate()) + '/' + this.addZero(date.getMonth() + 1) + '/' + date.getFullYear();
	};

	PLAYER.prototype.load = function(index) {
		var track = this.queue.tracks[index],
			self = this;

		this.loading = true;
		RPC.isFav(track, function(fav) {
			fav && $('menu.controls .glyphicon-heart').addClass('active');	
		});
		this.queue.current = index;
		$('.page-header .title').text(track.artist.name + ' - ' + track.name);
		$('.page-header .times').text('00:00 / ' + this.formatTime(track.duration));
		$('div, span', '.page-header .slider').css('width', 0);
		$('menu.controls .glyphicon-heart').removeClass('active');
		$(window).resize();
		this.current && this.current.destroy();
		delete this.current;
		this.bestMatch(track, function(bestMatch) {
			if(!bestMatch) {
				self.loading = false;
				return self.next();
			}
			switch(bestMatch.provider) {
				case 1: //youtube
					YOUTUBE.player(track);
				break;
				case 2: //soundcloud
					SOUNDCLOUD.player(track);
				break;
			}
		});
	};

	PLAYER.prototype.stateChange = function(state) {
		switch(state) {
			case this.states.playing:
			case this.states.buffering:
				$('menu.controls .glyphicon-play').attr('class', 'glyphicon glyphicon-pause');
				this.next(true); //preload next
			break;
			case this.states.paused:
			case this.states.ended:
				$('menu.controls .glyphicon-pause').attr('class', 'glyphicon glyphicon-play');
				state === this.states.ended && this.next(); //Jump to the next one
			break;
		}
	};

	PLAYER.prototype.error = function() {
		this.next();
	}

	/* Gatunes Technology ;P */
	PLAYER.prototype.bestMatch = function(s, callback) {
		if(s.bestMatch) return callback && callback(s.bestMatch);
		var name = s.artist.name + ' ' + s.name,
			getWords = function(str) {
				var ws = [];
				str.split(' ').forEach(function(w) {
					w = w.toLowerCase().trim();
					ws.indexOf(w) === -1 && ws.push(w);
				});
				return ws;
			},
			words = getWords(name),
			nameWords = getWords(s.name),
			badWords = function() {
				var bw = [
						'cover',
						'live',
						'edit',
						'remix',
						'reversed',
						'backwards',
						'lesson',
						'tribute'
					], l = bw.length;

				for(var x=0; x<l; x++) {
					if(words.indexOf(bw[x]) !== -1) {
						bw.splice(x, 1);
						x--;
						l--;
					}
				}
				return bw;
			}(),
			tracks = [],
			c = 0,
			process = function() {
				c++;
				if(c < 2) return;
				tracks.forEach(function(ss) {
					var sWords = getWords(ss.name.replace(/ - /g, ' ').replace(/ \/ /g, ' ')),
						wCount = 0,
						nameWCount = 0,
						bwCount = 0;

					words.forEach(function(w) {
						if(sWords.indexOf(w) === -1) return;
						wCount++; 
						nameWords.indexOf(w) !== -1 && nameWCount++;
						
					});

					badWords.forEach(function(w) {
						sWords.indexOf(w) !== -1 && bwCount++;		
					});

					ss.timeDiff = Math.abs(ss.duration - s.duration);
					ss.wCount = wCount;
					ss.bwCount = bwCount;
					ss.exactMatch = wCount === sWords.length;
					ss.nameMatch = nameWCount === nameWords.length;
				});
				tracks.sort(function(a, b) {
					return b.bwCount > a.bwCount ? -1 : (b.bwCount < a.bwCount ? 1 : 
						(a.exactMatch > b.exactMatch ? -1 : (a.exactMatch < b.exactMatch ? 1 : 
							(a.nameMatch > b.nameMatch ? -1 : (a.nameMatch < b.nameMatch ? 1 : 
								(a.wCount > b.wCount ? -1 : (a.wCount < b.wCount ? 1 : 
									(b.timeDiff > a.timeDiff ? -1 : (b.timeDiff < a.timeDiff ? 1 : 
										(a.hd > b.hd ? -1 : (a.hd < b.hd ? 1 :
											(b.providerRanking > a.providerRanking ? -1 : (b.providerRanking < a.providerRanking ? 1 :
						0)))))))))))));
				});
				if(tracks[0] && tracks[0].wCount >= nameWords.length) s.bestMatch = tracks[0];
				callback && callback(s.bestMatch);
			};

		YOUTUBE.search('videos', name, 0, function(r) {
			r && r.entry && r.entry.forEach(function(e, i) {
				var provider_id = e.id.$t.substr(e.id.$t.lastIndexOf('/') + 1);
				tracks.push({
					providerRanking : i,
					provider : 1, //youtube
					provider_id : provider_id,
					name : e.title.$t,
					duration : parseInt(e.media$group.yt$duration ? e.media$group.yt$duration.seconds : 0, 10),
					hd : e.yt$hd ? true : false
				});
			});
			process();
		});
		SOUNDCLOUD.search(name, function(r) {
			r && r.forEach(function(t, i) {
				tracks.push({
					providerRanking : i,
					provider : 2, //soundcloud
					provider_id : t.id,
					name : t.user.username + ' - ' + t.title,
					duration : Math.round(t.duration / 1000)
				});
			});
			process();
		});
	};

	/* Controls */
	PLAYER.prototype.prev = function() {
		if(this.loading || this.queue.current === 0) return;
		this.load(--this.queue.current);
		this.queue.current === 0 && $('menu.controls .glyphicon-fast-backward').parent().addClass('disabled');
	};

	PLAYER.prototype.next = function(justQueue) {
		if(this.loading) return;
		var self = this,
			queue = this.queue,
			cb = function() {
				if(justQueue) return;
				self.current && Math.round(self.current.time() * 100 / self.current.duration()) >= 30 && ANALYTICS('send', 'event', 'Tracks', 'Play', self.current.track.mbid);
				self.load(++queue.current);
				$('menu.controls .glyphicon-fast-backward').parent().removeClass('disabled');
			};

		if(queue.current < queue.tracks.length - 1) return cb();
		var exclude = [];
		queue.tracks.forEach(function(t) {
			exclude.push(t.mbid);
		});
		LASTFM.getSimilarTrack(queue.tracks[queue.current], function(track) {
			if(!track) {
				if(justQueue) return;
				queue.tracks.pop();
				if(!queue.tracks.length) return ROUTER.reload();
				queue.current--;
				return self.next();
			}
			queue.tracks.push(track);
			justQueue && self.bestMatch(track);
			cb();
		}, exclude);
	};

	PLAYER.prototype.toggle = function() {
		if(!this.current) return;
		if(this.current.state() === this.states.paused) this.current.play();
		else this.current.pause();
	};

	PLAYER.prototype.fav = function() {
		if(!this.current) return;
		var track = this.queue.tracks[this.queue.current];
		RPC.fav(track, function(fav) {
			$('menu.controls .glyphicon-heart')[(fav ? 'add' : 'remove') + 'Class']('active');
			ANALYTICS('send', 'event', 'Tracks', fav ? 'Fav' : 'Unfav', track.mbid);
		});
	};

	window.PLAYER = new PLAYER();
})(window);

/* Map stuff */
(function(window) {
	var MAP = function() {
		this.loaded = false;
	};

	MAP.prototype.load = function(callback) {
		if(this.loaded) return callback && callback();
		var self = this;
		this.loadCallback = function() {
			if(!window.COUNTRIES || !window.google || !window.google.maps || !window.google.maps.LatLng) return;
			COUNTRIES.forEach(function(country) {
				var bounds = new google.maps.LatLngBounds(),
					paths = [];
				
				if(country.geometries) {
					country.geometries.forEach(function(geometry) {
						var p = [];
						geometry.forEach(function(coords) {
							coords = new google.maps.LatLng(coords[0], coords[1]);
							p.push(coords);
							bounds.extend(coords);
						});
						paths.push(p);
					});
					delete country.geometries;
				} else {
					country.geometry.forEach(function(coords) {
						coords = new google.maps.LatLng(coords[0], coords[1]);
						paths.push(coords);
						bounds.extend(coords);
					});
					delete country.geometry;
				}
				country.polygon = new google.maps.Polygon({
					paths : paths,
					fillColor : '#fa8a12',
					fillOpacity : 0,
					strokeWeight : 0
				});
				google.maps.event.addListener(country.polygon, 'mouseover', function() {
					this.setOptions({fillOpacity : 0.6});
				});
				google.maps.event.addListener(country.polygon, 'mouseout', function() {
					this.setOptions({fillOpacity : 0});
				});
				google.maps.event.addListener(country.polygon, 'click', function() {
					/* Load the player */
					var hash = 'player?country=' + encodeURIComponent(country.name.toLowerCase());
					history.pushState(null, null, '#' + hash);
					ROUTER.update(hash);
				});
			});
			self.loaded = true;
			callback && callback();
		};

		/* Load countries polygons data */
		$.ajax({
			cache : true,
			dataType : 'script',
			url : 'static/js/countries.js',
		}).done(this.loadCallback);

		/* Load maps API */
		$.ajax({
			cache : true,
			dataType : 'script',
			url : 'http://maps.googleapis.com/maps/api/js?sensor=false&callback=MAP.loadCallback&language=' + L.locale,
		});
	};

	MAP.prototype.draw = function() {
		if(!this.loaded) return this.load(this.draw.bind(this));
		var map = new google.maps.Map($('section .map')[0], {
				center : new google.maps.LatLng(10, 0),
				scrollwheel : false,
				maxZoom : 7,
				minZoom : 2,
				zoom : 2,
				mapTypeControl : false,
				streetViewControl : false,
				panControl : false,
				zoomControlOptions: {
					position : google.maps.ControlPosition.TOP_RIGHT
				},
				styles : [
					{
						stylers: [
							{saturation: -100}		
						]
					},
					{
						featureType : 'poi.business',
						stylers : [
							{visibility: 'off'}
						]
					},
					{
						featureType : 'poi.attraction',
						stylers : [
							{visibility: 'off'}
						]
					}
				]
			});

		COUNTRIES.forEach(function(country) {
			country.polygon.setOptions({fillOpacity : 0});
			country.polygon.setMap(map);
		});
	};

	window.MAP = new MAP();
})(window);

/* Templates Logic */
TEMPLATE = {
	home : function(params, render) {
		LASTFM.getTopTags(function(tags) {
			(tags || []).forEach(function(tag) {
				tag.params = JSON.stringify({tag : tag.name});
			});
			render({
				tags : tags
			});
			var input = $('.search form input[type="text"]'),
				autofill = $('.search form .autofill'),
				results = $('.search form .results'),
				ul = $('ul', results),
				setActive = function(li) {
					ul.children().removeClass('active');
					li.addClass('active');
					li.prev().hasClass('header') && (li = li.prev());
					ul.stop().animate({
						scrollTop : li.offset().top + ul.prop('scrollTop') - ul.offset().top
					}, 'fast');
				},
				lastQuery,
				search = function() {
					var query = input.val();
					if(query === '') return autofill.removeClass('open');
					if(lastQuery === query) return autofill.addClass('open');
					lastQuery = query;

					var tagsLI = $('<li>'),
						artistsLI = $('<li>'),
						tracksLI = $('<li>'),
						renderLI = function(i, bound, text, params) {
							var li = $('<li>'),
								a = $('<a>');

							a.text(text);
							a.mousemove(function() {
								if(ul.is(':animated')) return;
								$('li.active', ul).removeClass('active');
								li.addClass('active');
							});
							a.click(function() {
								/* Load the player */
								var hash = 'player?' + params;
								history.pushState(null, null, '#' + hash);
								ROUTER.update(hash);
							});
							li.append(a);
							bound.before(li);
							li.index() === 1 && setActive(li);
							if(i === 2) {
								var mLI = $('<li class="more"></li>'),
									mA = $('<a><span class="glyphicon glyphicon-chevron-down"></span></a>');

								mA.click(function() {
									var index = mLI.index() + 1,
										li;

									mLI.remove();
									while((li = $(ul.children()[index])).is(':hidden')) {
										li.show();
										index++;
									}
									input.focus();
								});
								mLI.append(mA);
								bound.before(mLI);
								
							} else if(i > 2) li.hide();
							autofill.addClass('open');
						},
						noResultsCount = 0,
						noResults = function() {
							if(++noResultsCount < 3) return;
							ul.append('<li class="empty">' + L.noResults + '</li>')
						};

					ul.empty().append(artistsLI).append(tracksLI).append(tagsLI);

					LASTFM.req('artist.search', {
						artist : query,
						limit : 10
					}, function(data) {
						if(!data || !data.results || !data.results.artistmatches.artist) {
							noResults();
							return artistsLI.remove();
						}
						data.results = data.results.artistmatches.artist;
						var artists = [];
						(data.results.length ? data.results : [data.results]).forEach(function(result) {
							result.mbid && artists.push(result);
						});
						if(!artists.length) {
							noResults();
							return artistsLI.remove();
						}
						artistsLI.before('<li class="header"><h4>' + L.artists + '</h4></li>');
						artists.forEach(function(artist, i) {
							renderLI(i, artistsLI, artist.name, 'artist=' + artist.mbid);
						});
						artistsLI.remove();
					});

					LASTFM.req('track.search', {
						track : query,
						limit : 10
					}, function(data) {
						if(!data || !data.results || !data.results.trackmatches.track) {
							noResults();
							return tracksLI.remove();
						}
						data.results = data.results.trackmatches.track;
						var tracks = [];
						(data.results.length ? data.results : [data.results]).forEach(function(result) {
							result.mbid && tracks.push(result);
						});
						if(!tracks.length) {
							noResults();
							return tracksLI.remove();
						}
						tracksLI.before('<li class="header"><h4>' + L.tracks + '</h4></li>');
						tracks.forEach(function(track, i) {
							renderLI(i, tracksLI, track.artist + ' - ' + track.name, 'track=' + track.mbid);
						});
						tracksLI.remove();
						!tracks.length && noResults();
					});

					LASTFM.req('tag.search', {
						tag : query,
						limit : 10
					}, function(data) {
						if(!data || !data.results || !data.results.tagmatches.tag) {
							noResults();
							return tagsLI.remove();
						}
						tagsLI.before('<li class="header"><h4>' + L.genres + '</h4></li>');
						data.results = data.results.tagmatches.tag;
						(data.results.length ? data.results : [data.results]).forEach(function(tag, i) {
							renderLI(i, tagsLI, tag.name, 'tag=' + encodeURIComponent(tag.name));
						});
						tagsLI.remove();
					});
				},
				timeout;

			input.keyup(function() {
				clearTimeout(timeout);
				timeout = setTimeout(function() {
					search();
				}, 250);
			});
			input.keydown(function(e) {
				if([38, 40].indexOf(e.keyCode) === -1) return;
				e.preventDefault();
				var current = $('li.active', ul);
				switch(e.keyCode) {
					case 38: //up
						var prev = current.prev();
						while((prev.is(':hidden') || prev.attr('class')) && prev.prev().length) prev = prev.prev();
						if(!prev.length || prev.is(':hidden') || prev.attr('class')) return;
						setActive(prev);
					break;
					case 40: //down
						var next = current.next();
						while((next.is(':hidden') || next.attr('class')) && next.next().length) next = next.next();
						if(!next.length || next.is(':hidden') || next.attr('class')) return;
						setActive(next);
					break;
				}
			});
			$('.search .autofill .close').click(function() {
				clearTimeout(timeout);
				autofill.removeClass('open');
				input.val('').focus();
			});
			$('.search form').submit(function(e) {
				e.preventDefault();
				var active = $('li.active a', ul);
				if(!active.length) return search();
				active.click();
			});
			$('.search input').first().focus();
		});
	},
	player : function(params, render) {
		var trackCb = function(track) {
				if(!track) return ROUTER.update('home');
				render({
					track : track
				});
				
				$('menu.controls a').mousedown(function(e) {
					e.preventDefault();
				});

				var player = $('.player div').first(),
					title = $('.page-header .title'),
					slider = $('.page-header .slider'),
					/* Resize handler */
					onResize = function() {
						var h = $('section').height() - $('.page-header').height() - $('footer').height() - 35;
						player.css('height', h);
						title.css('max-width', $('section').width() - 370);
					},
					/* Keyboard shortcuts */
					onKeydown = function(e) {
						switch(e.keyCode) {
							case 37:
								PLAYER.prev();
							break;
							case 39:
								PLAYER.next();
							break;
							case 32:
								PLAYER.toggle();
								e.preventDefault();
							break;
							case 70:
								PLAYER.fav();
							break;
						}
					},
					/* Player UI update interval */
					timeInterval = setInterval(function() {
						if(!PLAYER.current || !PLAYER.current.duration()) return;
						$('.page-header .times').text(PLAYER.formatTime(PLAYER.current.time()) + ' / ' + PLAYER.formatTime(PLAYER.current.duration() || PLAYER.current.track.duration));
						!slider.hasClass('sliding') && $('div', slider).css('width', PLAYER.current.time() * slider.width() / PLAYER.current.duration());
						$('span', slider).css('width', PLAYER.current.loaded() * slider.width());
						FRAPP.setTitle('(' + PLAYER.formatTime(PLAYER.current.time()) + ') ' + PLAYER.current.track.name);
					}, 250);
				
				/* Slider logic */
				slider.mousedown(function(e) {
					if(!PLAYER.current || !PLAYER.current.duration()) return;
					var progess = $('div', slider),
						seek,
						mousemove = function(e) {
							var sw = slider.width(),
								w = e.clientX - slider.offset().left;

							w < 0 && (w = 0);
							w > sw && (w = sw);
							progess.css('width', w);
							PLAYER.current.seek(seek = w * PLAYER.current.duration() / sw);
						},
						mouseup = function() {
							PLAYER.current.seek(seek, true);
							setTimeout(function() {
								slider.removeClass('sliding');
							}, 150);
							$(window).unbind('mousemove', mousemove);
							$(window).unbind('mouseup', mouseup);
						};

					slider.addClass('sliding');
					$(window).bind('mousemove', mousemove);
					$(window).bind('mouseup', mouseup);
					mousemove(e);
					e.preventDefault();
				});

				onResize();
				$(window).bind('resize', onResize).bind('keydown', onKeydown);
				ROUTER.onUnload = function() {
					$(window).unbind('resize', onResize).unbind('keydown', onKeydown);
					clearInterval(timeInterval);
					PLAYER.current && PLAYER.current.destroy();
					delete PLAYER.current;
					delete PLAYER.queue;
					FRAPP.setTitle('TerrraceParty');
				};

				/* Start the player */
				PLAYER.queue = {
					current : 0,
					tracks : [track]
				};
				PLAYER.load(0);
			};

		if(params.artist) return LASTFM.getArtistTrack(params.artist, trackCb);
		else if(params.track) return LASTFM.getTrack(params.track, trackCb);
		else if(params.tag) LASTFM.getTagTrack(params.tag, trackCb);
		else if(params.country) {
			LASTFM.getCountryTracks(params.country, function(tracks) {
				if(!tracks) return ROUTER.update('map');
				trackCb(tracks[0]);
				PLAYER.queue.tracks = tracks;
			});
		} else if(params.fav) {
			RPC.getFav(function(tracks) {
				if(!tracks) return ROUTER.update('fav');
				trackCb(tracks[0]);
				PLAYER.queue.tracks = tracks;
			});
		} else LASTFM.getTopTags(function(tags) {
			if(!tags) return ROUTER.update('home');
			LASTFM.getTagTrack(tags[Math.floor(Math.random() * tags.length)].name, trackCb);
		});
	},
	friends : function(params, render) {
		RPC.getFriends(function(friends){
			render({
				friends : friends
			});

			$('.invite button').click(function() {
				FB.ui({
					method : 'send',
					link : 'http://www.terraceparty.com/'
				});
			});
		});
	},
	fav : function(params, render) {
		RPC.getFav(function(tracks) {
			render({
				tracks : tracks
			});
		});
	},
	map : function(params, render) {
		MAP.load(function() {
			render({});
			MAP.draw();
			ROUTER.onUnload = function() {
				window.COUNTRIES && COUNTRIES.forEach(function(country) {
					country.polygon.setMap(null);
				});
			};
		});
	}
};

window.addEventListener('frapp.init', function() {
	/* Handlebars helpers */
	Handlebars.registerHelper('i', function(className) {
		return new Handlebars.SafeString('<span class="glyphicon glyphicon-' + className + '"></span>');
	});

	Handlebars.registerHelper('empty', function(data, options) {
		if(!data || !data.length) return options.fn(this);
		else return options.inverse(this);
	});
		
	/* Render the Frapp */
	$('body').append(Handlebars.templates.frapp({
		version : FRAPP.version.frapp,
		year : (new Date()).getFullYear()
	}));

	$('nav [title]').tooltip({placement: 'right'});

	/* SoundManager setup */
	soundManager.setup({
		url : 'static/swf/',
		flashVersion : 9,
		debugMode : false,
		onready : function() {
			SoundManager.ready = 1;
			SoundManager.callbacks && SoundManager.callbacks.forEach(function(cb){cb()});
			delete SoundManager.callbacks;
		}
	});

	/* Init FB */
	$('body').append('<div id="fb-root"></div>');
	fbAsyncInit = function() {
		FB.init({
			appId : RPC.fbAppId,
			logging : false,
			status : false
		});
		FB.getLoginStatus(function(response){
			response.authResponse && RPC.loginCallback(response.authResponse);
		});
	};
	$.getScript('http://connect.facebook.net/' + L.locale + '/all.js');

	/* Init Analytics */
	GoogleAnalyticsObject = 'ANALYTICS';
	ANALYTICS = function() {
		!ANALYTICS.q && (ANALYTICS.q = []);
		ANALYTICS.q.push(arguments);
	};
	ANALYTICS.l = (new Date()).getTime();
	ANALYTICS('create', 'UA-5641525-7', 'terraceparty.com');
	$.getScript('http://www.google-analytics.com/analytics.js');

	/* Router setup */
	ROUTER = new ROUTER(function(panel, params) {
		var render = function(data) {
				$('section').stop().replaceWith(Handlebars.templates[panel](data));
				setTimeout(function() {
					ANALYTICS('send', 'pageview', {
						'page' : '/' + location.hash.substr(1),
						'title' : panel
					});
				}, 0);
			};
		
		if(window.ROUTER.onUnload) {
			window.ROUTER.onUnload();
			delete window.ROUTER.onUnload;
		}
		panel = panel || 'home'; //The default panel
		$('nav li').removeClass('active');
		$('nav li.' + panel).addClass('active');
		if(TEMPLATE[panel]) {
			$('section').fadeOut('fast', function() {
				$(this).replaceWith($(Handlebars.templates.loading()).hide().fadeTo('fast', 0.7));
			});
			return TEMPLATE[panel](params, render);
		}
		render(params);
	});
});
