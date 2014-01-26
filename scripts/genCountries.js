#!/usr/local/bin/node
console.log('Requesting data...');
require('https').get('https://www.googleapis.com/fusiontables/v1/query?key=AIzaSyAm9yWCV7JPCTHCJut8whOjARd7pwROFDQ&sql=' + encodeURIComponent('SELECT name, kml_4326 FROM 1foc3xO9DyfSIF6ofvN0kp2bxSfSeKog5FbdWdQ'), function(res) {
	var json = 'COUNTRIES = [',
		response = '';
	
	res.setEncoding('utf8');
	res.on('data', function(chunk) {
		response += chunk;
	});
	res.on('end', function() {
		console.log('Parsing...');
		try {
			response = JSON.parse(response);
		} catch(e) {
			return;
		}
		response.rows.forEach(function(r, i) {
			if(r[0] === 'Antarctica') return;
			var p = r[0].indexOf('('),
				country = '{name:' + JSON.stringify((p !== -1 ? r[0].substr(0, p) : r[0]).trim()) + ',';
			
			if(r[1].geometries) {
				country += 'geometries:[';
				r[1].geometries.forEach(function(geometry, i) {
					country += (i > 0 ? ',' : '') + '[';
					geometry.coordinates[0].forEach(function(coordinates, i) {
						country += (i > 0 ? ',' : '') + '[' + coordinates[1] + ',' + coordinates[0] + ']';
					});
					country += ']';
				});
			} else {
				if(!r[1].geometry) return;
				country += 'geometry:[';
				r[1].geometry.coordinates[0].forEach(function(coordinates, i) {
					country += (i > 0 ? ',' : '') + '[' + coordinates[1] + ',' + coordinates[0] + ']';
				});
			}
			json += (i > 0 ? ',' : '') + country + ']}';
		});
		json += '];\n';
		require('fs').writeFile('static/js/countries.js', json, function() {
			console.log('Done!');
		});
	});
});