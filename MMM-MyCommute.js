
/*********************************

	Magic Mirror Module:
	MMM-MyCommute
	By Jeff Clarke

	Fork of mrx-work-traffic
	By Dominic Marx
	https://github.com/domsen123/mrx-work-traffic

	MIT Licensed

	
		{
			module: 'MMM-MyCommute',
			position: 'top_left',
			config: {
				apiKey: 'AvE-U-CdL3R4HoB5HnL8g9cti6E5-QaDEpMNBQKzkeqKMN4s2LLG8JKoZoqvyzDt',
				origin: '28 Ivy Nola Way, Henderson, Auckland',
				startTime: '00:00',
				endTime: '23:59',
				// hideDays: [0, 6],
				showSummary: true,
				// colorCodeTravelTime: false,
				travelTimeFormat: 'h[h] m[m]',
				pollFrequency: 5 * 60 * 1000, // every 10 minutes 10 * 60 * 1000
				destinations: [
					{
						destination: '33 Fort Street, Auckland CBD, Auckland',
						label: 'BNZ Parking',
						mode: 'Driving'
					},
					{
						destination: '33 Fort Street, Auckland CBD, Auckland',
						label: 'BNZ Parking (transit)',
						mode: 'Transit',
						showNextVehicleDeparture: true,
						startTime: '00:00',
						endTime: '11:59',
						hideDays: [0, 6],
					},
					{
						destination: 'Westfield Newmarket Broadway, Newmarket, Auckland',
						label: 'Newmarket',
						mode: 'Driving'
					},
					{
						destination: 'The Boundary 5 Vitasovich Avenue, Henderson, Auckland 0612',
						label: 'Kmart Henderson',
						mode: 'Walking'
					}
				]
			}
		},

*********************************/

/* global config, Module, Log, moment */

Module.register("MMM-MyCommute", {

	defaults: {
		apiKey: "",
		origin: "65 Front St W, Toronto, ON M5J 1E6",
		startTime: "00:00",
		endTime: "23:59",
		lang: config.language,
		hideDays: [],
		showSummary: true,
		showUpdated: true,
		showUpdatedPosition: "footer", // Valid options are header or footer
		colorCodeTravelTime: true,
		moderateTimeThreshold: 1.1,
		poorTimeThreshold: 1.3,
		nextTransitVehicleDepartureFormat: "[next at] h:mm a",
		travelTimeFormat: "m [min]",
		travelTimeFormatTrim: "left",
		shortTimeFormat: "HH:mm",
		pollFrequency: 10 * 60 * 1000, //every ten minutes, in milliseconds
		maxCalendarEvents: 0,
		maxCalendarTime: 24 * 60 * 60 * 1000,
		calendarOptions: [{ mode: "driving", maxLabelLength: 25 }],
		showArrivalTime: true,
		showError: true,
		destinations: [
			{
				destination: "40 Bay St, Toronto, ON M5J 2X2",
				label: "Air Canada Centre",
				mode: "walking",
				time: null
			},
			{
				destination: "317 Dundas St W, Toronto, ON M5T 1G4",
				label: "Art Gallery of Ontario",
				mode: "transit",
				time: null
			},
			{
				destination: "55 Mill St, Toronto, ON M5A 3C4",
				label: "Distillery",
				mode: "bicycling",
				time: null
			},
			{
				destination: "6301 Silver Dart Dr, Mississauga, ON L5P 1B2",
				label: "Pearson Airport",
				time: null
			}
		]
	},

	getTranslations: function () {
		return {
			en: "translations/en.json",
			hu: "translations/hu.json",
			nl: "translations/nl.json",
			de: "translations/de.json"
		};
	},

	// Define required scripts.
	getScripts: function () {
		return ["moment.js", this.file("node_modules/moment-duration-format/lib/moment-duration-format.js")];
	},

	// Define required styles.
	getStyles: function () {
		return ["MMM-MyCommute.css", "font-awesome.css"];
	},

	travelModes: [
		"Driving",
		"Walking",
		"Transit"
	],

	// transitModes: [
	// 	"bus",
	// 	"subway",
	// 	"train",
	// 	"tram",
	// 	"rail"
	// ],

	// avoidOptions: [
	// 	"tolls",
	// 	"highways",
	// 	"ferries",
	// 	"indoor"
	// ],

	// Icons to use for each transportation mode
	symbols: {
		"driving": "car",
		"walking": "walk",
		"bicycling": "bike",
		"transit": "streetcar",
		"tram": "streetcar",
		"bus": "bus",
		"subway": "subway",
		"train": "train",
		"rail": "train",
		"metro_rail": "subway",
		"monorail": "train",
		"heavy_rail": "train",
		"commuter_train": "train",
		"high_speed_train": "train",
		"intercity_bus": "bus",
		"trolleybus": "streetcar",
		"share_taxi": "taxi",
		"ferry": "boat",
		"cable_car": "gondola",
		"gondola_lift": "gondola",
		"funicular": "gondola",
		"other": "streetcar",

		"None": "streetcar",
		"Airline": "streetcar",
		"Auto": "car",
		"Bus": "bus",
		"Ferry": "boat",
		"Train": "train",
		"Walk": "walk",
		"Other": "streetcar",

		"Walking": "walk",
	},

	start: function () {
		Log.info("Starting module: " + this.name);

		this.predictions = [];
		this.loading = true;
		this.inWindow = true;
		this.isHidden = false;

		// preform pre-calculations
		this.getPollFrequency();
		//start data poll
		this.getData();
		this.rescheduleInterval();
	},

	getEarliestOrLatestTime: function (first, second, earliest) {
		const firstSplit = first.split(":");
		const secondSplit = second.split(":");
		const firstMoment = moment().hour(firstSplit[0]).minute(firstSplit[1]);
		const secondMoment = moment().hour(secondSplit[0]).minute(secondSplit[1]);
		if (earliest) {
			if (firstMoment.isBefore(secondMoment)) {
				return firstMoment;
			} else {
				return secondMoment;
			}
		}
		// latest
		if (firstMoment.isAfter(secondMoment)) {
			return firstMoment;
		} else {
			return secondMoment;
		}
	},

	getPollFrequency: function () {
		if (this.calculatedPollFrequency) {
			return;
		}

		let totalActiveMins = 0;

		const destinations = this.getDestinations();
		for (let i = 0; i < destinations.length; i++) {
			const d = destinations[i];

			// get active time according to start- and end-times (taking into account global start and end times)
			const startTime = this.getEarliestOrLatestTime(d.startTime || "00:00", this.config.startTime, false);
			const endTime = this.getEarliestOrLatestTime(d.endTime || "23:59", this.config.endTime, true);
			const dailyDestActiveMins = endTime.diff(startTime, "minutes");

			let totalDestActiveMins = 0;
			// check active days
			const destHideDays = d.hideDays || [];
			for (let j = 0; j <= 6; j++) {
				// is day globally inactive or inactive for destination
				if (this.config.hideDays.indexOf(j) !== -1 || destHideDays.indexOf(j) !== -1) {
					continue;
				}
				// if day is active, add minutes
				totalDestActiveMins += dailyDestActiveMins;
			}

			// add destination time to total active
			totalActiveMins += totalDestActiveMins;
		}

		// TODO: make sure I am taking into account week vs day limits correctly
		// divide by daily limit
		const minsBetweenCalls = totalActiveMins/this.config.dailyReqCap;

		console.log(totalActiveMins + "mins/week total - " + minsBetweenCalls + "mins between calls");
		
		const frequency = Math.trunc(minsBetweenCalls * 60 * 1000);

		// compare with max frequency
		if (frequency < this.config.pollFrequency) {
			this.calculatedPollFrequency = this.config.pollFrequency;
		} else {
			this.calculatedPollFrequency = frequency;
		}
	},

	rescheduleInterval: function () {
		const self = this;
		if (this.interval !== null) {
			// Clear current interval, just in case
			clearInterval(this.interval);
		}

		this.interval = setInterval(function () {
			self.getData();
		}, this.calculatedPollFrequency);
	},

	suspended: false,

	suspend: function () {
		Log.log(this.name + " suspended");
		if (!this.suspended) {
			this.suspended = true;
			clearInterval(this.interval);
		}
	},

	resume: function () {
		Log.log(this.name + " resumed");
		if (this.suspended) {
			this.suspended = false;

			if (new Date() - this.lastUpdate > this.calculatedPollFrequency) {
				// Last refresh, before suspend, is too old. Update now
				this.getData();
			}
			this.rescheduleInterval();
		}
	},

	/*
		function isInWindow()

		@param start
			STRING display start time in 24 hour format e.g.: 06:00

		@param end
			STRING display end time in 24 hour format e.g.: 10:00

		@param hideDays
			ARRAY of numbers representing days of the week during which
			this tested item shall not be displayed.	Sun = 0, Sat = 6
			e.g.: [3,4] to hide the module on Wed & Thurs

		returns TRUE if current time is within start and end AND
		today is not in the list of days to hide.

	*/
	isInWindow: function (start, end, hideDays) {

		const now = moment();
		const startTimeSplit = start.split(":");
		const endTimeSplit = end.split(":");
		const startTime = moment().hour(startTimeSplit[0]).minute(startTimeSplit[1]);
		const endTime = moment().hour(endTimeSplit[0]).minute(endTimeSplit[1]);

		if (now.isBefore(startTime) || now.isAfter(endTime)) {
			return false;
		} else if (hideDays.indexOf(now.day()) !== -1) {
			return false;
		}
		return true;
	},

	appointmentDestinations: [],

	trimCalendarLabel: function (label, maxLength) {
		if (label.length > maxLength) {
			label = label.substr(0, maxLength - 1) + "&hellip;";
		}
		return label;
	},

	setAppointmentDestinations: function (payload) {
		this.appointmentDestinations = [];

		if (this.config.calendarOptions.length === 0) {
			// No routing configs for calendar events
			// Skip looking those up then
			return;
		}

		for (let i = 0; i < payload.length && this.appointmentDestinations.length < this.config.maxCalendarEvents; ++i) {
			const calendarEvent = payload[i];
			if ("location" in calendarEvent &&
				calendarEvent.location !== undefined &&
				calendarEvent.location !== false &&
				calendarEvent.startDate < (Date.now() + this.config.maxCalendarTime)
			) {
				this.appointmentDestinations.push.apply(this.appointmentDestinations,
					this.config.calendarOptions.map(calOpt => Object.assign({}, calOpt, {
						label: this.trimCalendarLabel(calendarEvent.title, calOpt.maxLabelLength),
						destination: calendarEvent.location,
						arrival_time: moment(parseInt(calendarEvent.startDate)).format('MM/DD/YYYY HH:mm:ss'), // TODO: Does this need to be UTC??
						color: calendarEvent.color
					}))
				);

				// {
				// 	"title": "Test calendar location",
				// 	"startDate": "1657262700000",
				// 	"endDate": "1657264500000",
				// 	"fullDayEvent": false,
				// 	"location": "The Falls Bistro, 22 Alderman Drive, Henderson, Auckland 0645, New Zealand",
				// 	"geo": false,
				// 	"description": false,
				// 	"today": true,
				// 	"symbol": [
				// 		"calendar"
				// 	],
				// 	"calendarName": "",
				// 	"color": "#fff"
				// }
			}
		}

		// Make sure appointmentDestinations is not too long
		// Which could happend because of inner forEach on calendarOptions
		this.appointmentDestinations = this.appointmentDestinations.slice(0, this.config.maxCalendarEvents);
	},

	getDestinations: function () {
		return this.config.destinations.concat(this.appointmentDestinations);
	},

	lastUpdate: 0,

	getData: function () {
		Log.log(this.name + " refreshing routes");

		//only poll if in window
		if (this.isInWindow(this.config.startTime, this.config.endTime, this.config.hideDays)) {
			//build URLs
			let destinationGetInfo = [];
			const destinations = this.getDestinations();
			for (let i = 0; i < destinations.length; i++) {
				const d = destinations[i];

				const destStartTime = d.startTime || "00:00";
				const destEndTime = d.endTime || "23:59";
				const destHideDays = d.hideDays || [];

				if (this.isInWindow(destStartTime, destEndTime, destHideDays)) {
					const url = "http://dev.virtualearth.net/REST/v1/Routes/" + this.getParams(d);
					destinationGetInfo.push({ url: url, config: d });
				}
			}
			this.inWindow = true;

			Log.log(destinationGetInfo);

			if (destinationGetInfo.length > 0) {
				this.sendSocketNotification("BING_TRAFFIC_GET", { destinations: destinationGetInfo, instanceId: this.identifier });
			} else {
				this.hide(
					1000, 
					console.log("hiding " + this.name + " due to no current destinations"),
					{ lockString: this.identifier }
				);
				this.inWindow = false;
				this.isHidden = true;
			}

			this.lastUpdate = new Date();
		} else {
			this.hide(
				1000, 
				console.log("hiding " + this.name + " due to outside global active window"),
				{ lockString: this.identifier }
			);
			this.inWindow = false;
			this.isHidden = true;
		}
	},

	getParams: function (dest) {

		//travel mode
		let mode = "Driving";
		if (dest.mode && this.travelModes.indexOf(dest.mode) !== -1) {
			mode = dest.mode;
		}
		let params = mode + "?";

		params += "waypoint.0=" + encodeURIComponent(dest.origin || this.config.origin);
		params += "&waypoint.1=" + encodeURIComponent(dest.destination);
		params += "&optimize=" + mode === 'Driving' ? 'timeWithTraffic' : 'time';
		params += "&key=" + (this.config.apiKey || this.config.apikey);

		if (dest.arrival_time) {
			params += "&timeType=Arrival&dateTime=" + dest.arrival_time;
		} else {
			params += "&timeType=Departure&dateTime=" + moment().format('HH:mm:ss');	//needed for time based on traffic conditions
		}

		// let params = "?";
		// params += "origin=" + encodeURIComponent(dest.origin || this.config.origin);
		// params += "&destination=" + encodeURIComponent(dest.destination);
		// params += "&key=" + (this.config.apiKey || this.config.apikey);
		// params += "&language=" + this.config.lang;

		// //travel mode
		// let mode = "driving";
		// if (dest.mode && this.travelModes.indexOf(dest.mode) !== -1) {
		// 	mode = dest.mode;
		// }
		// params += "&mode=" + mode;

		// //transit mode if travelMode = "transit"
		// if (mode === "transit" && dest.transitMode) {
		// 	const tModes = dest.transitMode.split("|");
		// 	let sanitizedTransitModes = "";
		// 	for (let i = 0; i < tModes.length; i++) {
		// 		if (this.transitModes.indexOf(tModes[i]) !== -1) {
		// 			sanitizedTransitModes += (sanitizedTransitModes === "" ? tModes[i] : "|" + tModes[i]);
		// 		}
		// 	}
		// 	if (sanitizedTransitModes.length > 0) {
		// 		params += "&transit_mode=" + sanitizedTransitModes;
		// 	}
		// }

		// if (dest.waypoints) {
		// 	const waypoints = dest.waypoints.split("|");
		// 	for (let i = 0; i < waypoints.length; i++) {
		// 		waypoints[i] = "via:" + encodeURIComponent(waypoints[i]);
		// 	}
		// 	params += "&waypoints=" + waypoints.join("|");
		// }

		// //avoid
		// if (dest.avoid) {
		// 	const a = dest.avoid.split("|");
		// 	let sanitizedAvoidOptions = "";
		// 	for (let i = 0; i < a.length; i++) {
		// 		if (this.avoidOptions.indexOf(a[i]) !== -1) {
		// 			sanitizedAvoidOptions += (sanitizedAvoidOptions === "" ? a[i] : "|" + a[i]);
		// 		}
		// 	}
		// 	if (sanitizedAvoidOptions.length > 0) {
		// 		params += "&avoid=" + sanitizedAvoidOptions;
		// 	}
		// }
		// if (dest.alternatives === true) {
		// 	params += "&alternatives=true";
		// }

		// if (dest.arrival_time) {
		// 	params += "&arrival_time=" + dest.arrival_time;
		// } else {
		// 	params += "&departure_time=now";	//needed for time based on traffic conditions
		// }

		return params;

	},

	svgIconFactory: function (glyph) {
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttributeNS(null, "class", "transit-mode-icon");

		const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
		use.setAttributeNS("http://www.w3.org/1999/xlink", "href", "modules/MMM-MyCommute/icon_sprite.svg#" + glyph);
		svg.appendChild(use);
		return (svg);
	},

	formatTime: function (time, timeInTraffic, eventArrivalTime) {
		const timeEl = document.createElement("span");
		timeEl.classList.add("travel-time");
		let now = moment();
		if (timeInTraffic != null) {
			if (this.config.showArrivalTime && !eventArrivalTime) {
				timeEl.innerHTML = moment.duration(Number(timeInTraffic), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim }) + " - " + now.add(Number(timeInTraffic), "seconds").format(this.config.shortTimeFormat);
			}
			else {
				timeEl.innerHTML = moment.duration(Number(timeInTraffic), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim });
			}
			const variance = timeInTraffic / time;
			if (this.config.colorCodeTravelTime) {
				if (variance > this.config.poorTimeThreshold) {
					timeEl.classList.add("status-poor");
				} else if (variance > this.config.moderateTimeThreshold) {
					timeEl.classList.add("status-moderate");
				} else {
					timeEl.classList.add("status-good");
				}
			}
		} else {
			if (this.config.showArrivalTime && !eventArrivalTime) {
				timeEl.innerHTML = moment.duration(Number(time), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim }) + " - " + now.add(Number(time), "seconds").format(this.config.shortTimeFormat);
			}
			else {
				timeEl.innerHTML = moment.duration(Number(time), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim });
			}
			timeEl.classList.add("status-good");
		}
		return timeEl;
	},

	formatSummary: function (route, arrivalTime) {
		// calendar event
		if (arrivalTime) {
			const time = route.summary === "Driving" ? route.timeInTraffic : route.time;
			return "Leave by " + moment(arrivalTime).add(-time, 'seconds').format(this.config.shortTimeFormat)
				+ " for " + moment(arrivalTime).format(this.config.shortTimeFormat) + " arrival.";
		}

		// Use traffic summary if driving
		if (route.summary === "Driving" && route.timeInTraffic && route.time) {
			const variance = route.timeInTraffic / route.time;
			if (variance > this.config.moderateTimeThreshold) {
				return moment.duration(Number(route.timeInTraffic - route.time), "seconds").format(this.config.travelTimeFormat, { trim: this.config.travelTimeFormatTrim }) + " traffic delay";
			} else {
				return "No significant traffic";
			}
		}
		return route.summary;
	},

	getTransitIcon: function (dest, route) {
		let transitIcon;
		if (dest.transitMode) {
			transitIcon = dest.transitMode.split("|")[0];
			if (this.symbols[transitIcon] != null) {
				transitIcon = this.symbols[transitIcon];
			} else {
				transitIcon = this.symbols[route.transitInfo[0].vehicle.toLowerCase()];
			}
		} else {
			transitIcon = this.symbols[route.transitInfo[0].vehicle.toLowerCase()];
		}

		return transitIcon;
	},

	buildTransitSummary: function (transitInfo, summaryContainer) {

		for (let i = 0; i < transitInfo.length; i++) {
			const transitLeg = document.createElement("span");
			transitLeg.classList.add("transit-leg");
			transitLeg.appendChild(this.svgIconFactory(this.symbols[transitInfo[i].vehicle.toLowerCase()]));

			const routeNumber = document.createElement("span");
			routeNumber.innerHTML = transitInfo[i].routeLabel;

			if (transitInfo[i].arrivalTime) {
				// TODO: correct next depature time
				routeNumber.innerHTML = routeNumber.innerHTML + " (" + moment(transitInfo[i].arrivalTime).format(this.config.nextTransitVehicleDepartureFormat) + ")";
			}

			transitLeg.appendChild(routeNumber);
			summaryContainer.appendChild(transitLeg);
		}
	},

	getPollFreqString: function () {
		if (this.calculatedPollFrequency) {
			const mins = Math.round(this.calculatedPollFrequency/6000)/10;
			return " (freq: " + mins.toString() + "mins)";
		} else {
			return " (freq error)";
		}
	},

	getHeader: function () {
		var headerTitle = this.data.header;

		if (this.config.showUpdated && this.config.showUpdatedPosition === "header") {
			headerTitle += " - " + this.translate("LAST_REFRESHED")

			if (this.lastUpdated) {
				headerTitle += this.lastUpdated.format(this.config.shortTimeFormat);
			} else {
				headerTitle += "no update received yet";
			}

			headerTitle += this.getPollFreqString();
		}
		return headerTitle;
	},

	getDom: function () {
		const wrapper = document.createElement("div");
		if (this.loading) {
			const loading = document.createElement("div");
			loading.innerHTML = this.translate("LOADING");
			loading.className = "dimmed light small";
			wrapper.appendChild(loading);
			this.lastWrapper = wrapper;
			return wrapper;
		}

		const destinations = this.getDestinations();
		for (let i = 0; i < this.predictions.length; i++) {
			const p = this.predictions[i];
			const row = document.createElement("div");
			row.classList.add("row");
			const destination = document.createElement("span");
			destination.className = "destination-label bright";
			if (p.config.arrival_time) {
				destination.innerHTML = p.config.label + " - " + moment(p.config.arrival_time).format(this.config.shortTimeFormat);
			} else {
				destination.innerHTML = p.config.label;
			}
			row.appendChild(destination);

			const icon = document.createElement("span");
			icon.className = "transit-mode bright";
			let symbolIcon = "car";
			if (destinations[i].color) {
				icon.setAttribute("style", "color:" + p.config.color);
			}

			if (p.config.mode && this.symbols[p.config.mode]) {
				symbolIcon = this.symbols[p.config.mode];
			}

			//different rendering for single route vs multiple
			if (p.error) {
				if (!this.config.showError) {
					return this.lastWrapper;
				}

				//no routes available.	display an error instead.
				const errorTxt = document.createElement("span");
				errorTxt.classList.add("route-error");
				errorTxt.innerHTML = "Error: " + p.error_msg;
				row.appendChild(errorTxt);
				console.error("MMM-MyCommute error: " + p.error_msg, "Config:", p.config);

			} else if (p.routes.length === 1 || !this.config.showSummary) {
				let r = p.routes[0];

				//summary?
				if (this.config.showSummary) {
					var singleSummary = document.createElement("div");
					singleSummary.classList.add("route-summary");
					if (r.transitInfo) {
						symbolIcon = this.getTransitIcon(p.config, r);
						this.buildTransitSummary(r.transitInfo, singleSummary);
					} else {
						singleSummary.innerHTML = this.formatSummary(r, p.config.arrival_time);
					}
					singleSummary.appendChild(this.formatTime(r.time, r.timeInTraffic, p.config.arrival_time));
					row.appendChild(singleSummary);
				}
				else {
					row.appendChild(this.formatTime(r.time, r.timeInTraffic, p.config.arrival_time));
				}
			} else {
				row.classList.add("with-multiple-routes");
				for (let j = 0; j < p.routes.length; j++) {
					const routeSummaryOuter = document.createElement("div");
					routeSummaryOuter.classList.add("route-summary-outer");
					let r = p.routes[j];

					var multiSummary = document.createElement("div");
					multiSummary.classList.add("route-summary");
					if (r.transitInfo) {
						symbolIcon = this.getTransitIcon(p.config, r);
						this.buildTransitSummary(r.transitInfo, multiSummary);
					} else {
						multiSummary.innerHTML = this.formatSummary(r, p.config.arrival_time);
					}
					routeSummaryOuter.appendChild(multiSummary);
					routeSummaryOuter.appendChild(this.formatTime(r.time, r.timeInTraffic, p.config.arrival_time));
					row.appendChild(routeSummaryOuter);
				}
			}
			const svg = this.svgIconFactory(symbolIcon);
			icon.appendChild(svg);
			row.appendChild(icon);
			wrapper.appendChild(row);
		}

		if (this.config.showUpdated && this.config.showUpdatedPosition === "footer") {
			const updatedRow = document.createElement("div");
			updatedRow.classList.add("light");
			updatedRow.classList.add("xsmall");
			updatedRow.innerHTML = this.translate("LAST_REFRESHED") + this.lastUpdated.format(this.config.shortTimeFormat) + this.getPollFreqString();
			wrapper.appendChild(updatedRow);
		}
		this.lastWrapper = wrapper;
		return wrapper;
	},

	socketNotificationReceived: function (notification, payload) {
		if (notification === "BING_TRAFFIC_RESPONSE" + this.identifier) {
			this.predictions = payload;
			console.log('predictions', payload);
			this.lastUpdated = moment();
			if (this.loading) {
				this.loading = false;
				if (this.isHidden) {
					this.updateDom();
					this.show(
						1000, 
						console.log("showing " + this.name + " (and this.loading)"),
						{ lockString: this.identifier }
					);
				} else {
					this.updateDom(1000);
				}
			} else {
				this.updateDom();
				if (this.isHidden) {
					this.show(
						1000, 
						console.log("showing " + this.name),
						{ lockString: this.identifier }
					);
				}
			}
			this.isHidden = false;
		}
	},

	notificationReceived: function (notification, payload) {
		if (notification === "DOM_OBJECTS_CREATED" && !this.inWindow) {
			this.hide(
				0, 
				console.log("hiding " + this.name),
				{ lockString: this.identifier }
			);
			this.isHidden = true;
		} else if (notification === "CALENDAR_EVENTS") {
			this.setAppointmentDestinations(payload);
		}
	}
});
