/* Magic Mirror
 * Module: mrx-work-traffic
 *
 * By Dominic Marx
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const request = require("request");
const moment = require("moment");

module.exports = NodeHelper.create({
	start: function () {
		console.log("====================== Starting node_helper for module [" + this.name + "]");
	},

	// subclass socketNotificationReceived
	socketNotificationReceived: function (notification, payload) {
		if (notification === "BING_TRAFFIC_GET") {
			//first data pull after new config
			this.getPredictions(payload);
		}
	},

	getPredictions: function(payload) {
		const self = this;
		let returned = 0;
		const predictions = [];
		payload.destinations.forEach(function (dest, index) {
			request({url: dest.url, method: "GET"}, function (error, response, body) {
				const prediction = new Object({
					config: dest.config
				});

				if (!error && response.statusCode === 200) {
					const data = JSON.parse(body);
					if (data.error_message) {
						console.log("MMM-MyCommute: " + data.error_message);
						prediction.error = true;
						prediction.error_msg = data.error_message;
					} else if (data.statusDescription !== "OK") {
						console.log("MMM-MyCommute: " + data.statusDescription);
						console.debug(data);
						prediction.error = true;
						prediction.error_msg = "data.status != OK: " + data.statusDescription;
					} else {
						const routeList = [];
						for (let i = 0; i < data.resourceSets[0].resources.length; i++) {
							const r = data.resourceSets[0].resources[i];
							const routeObj = new Object({
								summary: r.travelMode,
								time: r.travelDuration,
							});

							if (dest.config.mode && dest.config.mode === "Walking") {
								routeObj.summary = r.routeLegs[0].description;
							}
							if (dest.config.mode && dest.config.mode === "Driving") {
								routeObj.timeInTraffic = r.travelDurationTraffic;
							}
							if (dest.config.mode && dest.config.mode === "Transit") {
								const transitInfo = [];
								let gotFirstTransitLeg = false;
								for (let j = 0; j < r.routeLegs[0].itineraryItems.length; j++) {
									const s = r.routeLegs[0].itineraryItems[j];
									if (s.instruction.maneuverType === "TakeTransit") {
										let arrivalTime = "";
										if (!gotFirstTransitLeg && dest.config.showNextVehicleDeparture) {
											gotFirstTransitLeg = true;
											// arrivalTime = moment(s.childItineraryItems[0].time * 1000);
											arrivalTime = new Date(parseInt(s.childItineraryItems[0].time.substr(6)));
										}
										transitInfo.push({
											routeLabel: s.childItineraryItems[0].instruction.text ? s.childItineraryItems[0].instruction.text : s.instruction.text, 
											vehicle: s.iconType, 
											arrivalTime: arrivalTime
										});
									}
								}
								routeObj.transitInfo = transitInfo;
								if (transitInfo.length <= 0) {
									const travelModes = r.routeLegs[0].itineraryItems.map(s => s.iconType).join(", ");
									console.log("MMM-MyCommute: transit directrions does not contain any transits (" + travelModes + ")");
									prediction.error = true;
									prediction.error_msg = "MMM-MyCommute: transit directrions does not contain any transits (" + travelModes + ")";
								}
							}
							routeList.push(routeObj);
						}
						// for (let i = 0; i < data.routes.length; i++) {
						// 	const r = data.routes[i];
						// 	const routeObj = new Object({
						// 		summary: r.summary,
						// 		time: r.legs[0].duration.value
						// 	});

						// 	if (r.legs[0].duration_in_traffic) {
						// 		routeObj.timeInTraffic = r.legs[0].duration_in_traffic.value;
						// 	}
						// 	if (dest.config.mode && dest.config.mode === "transit") {
						// 		const transitInfo = [];
						// 		let gotFirstTransitLeg = false;
						// 		for (let j = 0; j < r.legs[0].steps.length; j++) {
						// 			const s = r.legs[0].steps[j];
						// 			if (s.transit_details) {
						// 				let arrivalTime = "";
						// 				if (!gotFirstTransitLeg && dest.config.showNextVehicleDeparture) {
						// 					gotFirstTransitLeg = true;
						// 					arrivalTime = moment(s.transit_details.departure_time.value * 1000);
						// 				}
						// 				transitInfo.push({routeLabel: s.transit_details.line.short_name ? s.transit_details.line.short_name : s.transit_details.line.name, vehicle: s.transit_details.line.vehicle.type, arrivalTime: arrivalTime});
						// 			}
						// 		}
						// 		routeObj.transitInfo = transitInfo;
						// 		if (transitInfo.length <= 0) {
						// 			const travelModes = r.legs[0].steps.map(s => s.travel_mode).join(", ");
						// 			console.log("MMM-MyCommute: transit directrions does not contain any transits (" + travelModes + ")");
						// 			prediction.error = true;
						// 			prediction.error_msg = "MMM-MyCommute: transit directrions does not contain any transits (" + travelModes + ")";
						// 		}
						// 	}
						// 	routeList.push(routeObj);
						// }
						prediction.routes = routeList;
					}
				} else {
					prediction.error = true;
					if (response !== undefined) {
						console.log("Error getting traffic prediction: " + response.statusCode);
						prediction.error_msg = "Error getting traffic prediction: " + response.statusCode;
					} else {
						console.log("Error getting traffic prediction: " + error);
						prediction.error_msg = "Error getting traffic prediction: " + error;
					}
				}
				predictions[index] = prediction;
				returned++;

				if (returned === payload.destinations.length) {
					self.sendSocketNotification("BING_TRAFFIC_RESPONSE" + payload.instanceId, predictions);
				}
			});
		});
	}
});
