const mediaType = {
	audio: 'audioType',
	video: 'videoType',
	screen: 'screenType'
}
const _EVENTS = {
	exitRoom: 'exitRoom',
	openRoom: 'openRoom',
	startVideo: 'startVideo',
	stopVideo: 'stopVideo',
	startAudio: 'startAudio',
	stopAudio: 'stopAudio',
	startScreen: 'startScreen',
	stopScreen: 'stopScreen'
}

class RoomClient {

	constructor(localMediaEl, remoteVideoEl, remoteAudioEl, mediasoupClient, socket, room_id, name, successCallback) {
		this.name = name
		this.localMediaEl = localMediaEl
		this.remoteVideoEl = remoteVideoEl
		this.remoteAudioEl = remoteAudioEl
		this.mediasoupClient = mediasoupClient

		this.socket = socket
		this.producerTransport = null
		this.consumerTransport = null
		this.device = null
		this.room_id = room_id

		this.consumers = new Map()
		this.producers = new Map()

		/**
		 * map that contains a mediatype as key and producer_id as value
		 */
		this.producerLabel = new Map()

		this._isOpen = false
		this.eventListeners = new Map()
		Object.keys(_EVENTS).forEach(function (evt) {
			this.eventListeners.set(evt, [])
		}.bind(this))


		this.createRoom(room_id).then(async function () {
			await this.join(name, room_id)
			this.initSockets()
			this._isOpen = true
			successCallback()
		}.bind(this))
	}

	////////// INIT /////////

	async createRoom(room_id) {
		await this.socket.request('createRoom', {
			room_id
		}).catch(err => {
			console.log(err)
		})
	}

	async join(name, room_id) {
		socket.request('join', {
			name,
			room_id
		}).then(async function (e) {
			for(let client of JSON.parse(e.peers))
			{
				if(client[1].name != name)
				{
					const peer = document.createElement('div')
					peer.innerHTML = client[1].name
					peer.style.position = 'absolute'
					peer.style.zIndex = '1'
					peer.className = 'd-flex align-items-center justify-content-center w-100 h-100'
					const container = document.createElement('div')
					container.className = 'card w-auto my-3'
					container.style.minHeight = '18vh'
					container.id = client[1].id
					container.appendChild(peer)
					remoteVideos.appendChild(container)
				}
			}
			const data = await this.socket.request('getRouterRtpCapabilities');
			let device = await this.loadDevice(data)
			this.device = device
			await this.initTransports(device)
			this.socket.request('getProducers')
		}.bind(this)).catch(e => {
			console.log(e)
		})
	}

	async loadDevice(routerRtpCapabilities) {
		let device
		try {
			device = new this.mediasoupClient.Device();
		} catch (error) {
			if (error.name === 'UnsupportedError') {
				console.error('browser not supported');
			}
			console.error(error)
		}
		await device.load({
			routerRtpCapabilities
		})
		return device

	}

	async initTransports(device) {
		// init producerTransport
		{
			const data = await this.socket.request('createWebRtcTransport', {
				forceTcp: false,
				rtpCapabilities: device.rtpCapabilities,
			})
			if (data.error) {
				console.error(data.error);
				return;
			}

			this.producerTransport = device.createSendTransport(data);

			this.producerTransport.on('connect', async function ({
				dtlsParameters
			}, callback, errback) {
				this.socket.request('connectTransport', {
						dtlsParameters,
						transport_id: data.id
					})
					.then(callback)
					.catch(errback)
			}.bind(this));

			this.producerTransport.on('produce', async function ({
				kind,
				rtpParameters
			}, callback, errback) {
				try {
					const {
						producer_id
					} = await this.socket.request('produce', {
						producerTransportId: this.producerTransport.id,
						kind,
						rtpParameters,
					});
					callback({
						id: producer_id
					});
				} catch (err) {
					errback(err);
				}
			}.bind(this))

			this.producerTransport.on('connectionstatechange', function (state) {
				switch (state) {
					case 'connecting':

						break;

					case 'connected':
						//localVideo.srcObject = stream
						break;

					case 'failed':
						this.producerTransport.close();
						break;

					default:
						break;
				}
			}.bind(this));
		}

		// init consumerTransport
		{
			const data = await this.socket.request('createWebRtcTransport', {
				forceTcp: false,
			});
			if (data.error) {
				console.error(data.error);
				return;
			}

			// only one needed
			this.consumerTransport = device.createRecvTransport(data);
			this.consumerTransport.on('connect', function ({
				dtlsParameters
			}, callback, errback) {
				this.socket.request('connectTransport', {
						transport_id: this.consumerTransport.id,
						dtlsParameters
					})
					.then(callback)
					.catch(errback);
			}.bind(this));

			this.consumerTransport.on('connectionstatechange', async function (state) {
				switch (state) {
					case 'connecting':
						break;

					case 'connected':
						//remoteVideo.srcObject = await stream;
						//await socket.request('resume');
						break;

					case 'failed':
						this.consumerTransport.close();
						break;

					default:
						break;
				}
			}.bind(this));
		}
	}

	initSockets() {
		this.socket.on('consumerClosed', function ({
			consumer_id
		}) {
			console.log('closing consumer:', consumer_id)
			this.removeConsumer(consumer_id)
		}.bind(this))

		/**
		 * data: [ {
		 *  producer_id:
		 *  producer_socket_id:
		 * }]
		 */
		this.socket.on('newProducers', async function (data) {
			console.log('new producers', data)
			for (let {
					producer_id, producer_socket_id
				} of data) {
				await this.consume(producer_id, producer_socket_id)
			}
		}.bind(this))

		this.socket.on('joined', function(data) {
			const peer = document.createElement('div')
			peer.innerHTML = data.name
			peer.style.position = 'absolute'
			peer.style.zIndex = '1'
			peer.className = 'd-flex align-items-center justify-content-center w-100 h-100'
			const container = document.createElement('div')
			container.className = 'card w-auto my-3'
			container.style.minHeight = '18vh'
			container.id = data.id
			container.appendChild(peer)
			remoteVideos.appendChild(container)
		})

		this.socket.on('disconnect', function () {
			this.exit(true)
		}.bind(this))
	}

	//////// MAIN FUNCTIONS /////////////

	async produce(type) {
		let mediaConstraints = {}
		let audio = false
		let screen = false
		switch (type) {
			case mediaType.audio:
				mediaConstraints = {
					audio: true,
					video: false
				}
				audio = true
				break
			case mediaType.video:
				mediaConstraints = {
					audio: false,
					video: true,
				}
				break
			case mediaType.screen:
				mediaConstraints = false
				screen = true
				break;
			default:
				return
				break;
		}
		if (!this.device.canProduce('video') && !audio) {
			console.error('cannot produce video');
			return;
		}
		if (this.producerLabel.has(type)) {
			console.log('producer already exists for this type ' + type)
			return
		}
		console.log('mediacontraints:',mediaConstraints)
		let stream;
		try {
			stream = screen ? await navigator.mediaDevices.getDisplayMedia() : await navigator.mediaDevices.getUserMedia(mediaConstraints)
			console.log(navigator.mediaDevices.getSupportedConstraints())


			const track = audio ? stream.getAudioTracks()[0] : stream.getVideoTracks()[0]
			const params = {
				track
			};
			if (!audio && !screen) {
				params.encodings = [{
						rid: 'r0',
						maxBitrate: 100000,
						//scaleResolutionDownBy: 10.0,
						scalabilityMode: 'S1T3'
					},
					{
						rid: 'r1',
						maxBitrate: 300000,
						scalabilityMode: 'S1T3'
					},
					{
						rid: 'r2',
						maxBitrate: 900000,
						scalabilityMode: 'S1T3'
					}
				];
				params.codecOptions = {
					videoGoogleStartBitrate: 1000
				};
			}
			producer = await this.producerTransport.produce(params)

			console.log('producer', producer)

			this.producers.set(producer.id, producer)

			let elem
			if (!audio) {
				elem = document.createElement('video')
				elem.srcObject = stream
				elem.id = producer.id
				elem.playsinline = false
				elem.autoplay = true
				elem.loop = true
				elem.muted = true
				this.localMediaEl.appendChild(elem)
			}

			producer.on('trackended', () => {
				this.closeProducer(type)
			})

			producer.on('transportclose', () => {
				console.log('producer transport close')
				if (!audio) {
					elem.srcObject.getTracks().forEach(function (track) {
						track.stop()
					})
					elem.parentNode.removeChild(elem)
				}
				this.producers.delete(producer.id)

			})

			producer.on('close', () => {
				console.log('closing producer')
				if (!audio) {
					elem.srcObject.getTracks().forEach(function (track) {
						track.stop()
					})
					elem.parentNode.removeChild(elem)
				}
				this.producers.delete(producer.id)

			})

			this.producerLabel.set(type, producer.id)

			switch (type) {
				case mediaType.audio:
					this.event(_EVENTS.startAudio)
					break
				case mediaType.video:
					this.event(_EVENTS.startVideo)
					break
				case mediaType.screen:
					this.event(_EVENTS.startScreen)
					break;
			}
		} catch (err) {
			console.log(err)
		}
	}

	async consume(producer_id, producer_socket_id) {

		this.getConsumeStream(producer_id).then(function ({
			consumer,
			stream,
			kind
		}) {

			this.consumers.set(consumer.id, consumer)
			let elem, container;
			if (kind === 'video') {
				elem = document.createElement('video')
				elem.srcObject = stream
				elem.id = consumer.id
				elem.playsinline = false
				elem.autoplay = true
				container = document.getElementById(producer_socket_id)
				container.className = "card w-auto my-3"
				container.style.minHeight = '18vh'
				container.appendChild(elem)
				this.remoteVideoEl.appendChild(container)
			} else {
				elem = document.createElement('audio')
				elem.srcObject = stream
				elem.id = consumer.id
				elem.playsinline = false
				elem.autoplay = true
				this.remoteAudioEl.appendChild(elem)
			}

			consumer.on('trackended', function () {
				this.removeConsumer(consumer.id)
			}.bind(this))
			consumer.on('transportclose', function () {
				this.removeConsumer(consumer.id)
			}.bind(this))



		}.bind(this))
	}

	async getConsumeStream(producerId) {
		const {
			rtpCapabilities
		} = this.device
		const data = await this.socket.request('consume', {
			rtpCapabilities,
			consumerTransportId: this.consumerTransport.id, // might be 
			producerId
		});
		const { id, kind, rtpParameters, } = data;

		let codecOptions = {};
		const consumer = await this.consumerTransport.consume({
			id,
			producerId,
			kind,
			rtpParameters,
			codecOptions,
		})
		const stream = new MediaStream();
		stream.addTrack(consumer.track);
		return {
			consumer,
			stream,
			kind
		}
	}

	closeProducer(type) {
		if (!this.producerLabel.has(type)) {
			console.log('there is no producer for this type ' + type)
			return
		}
		let producer_id = this.producerLabel.get(type)
		console.log(producer_id)
		this.socket.emit('producerClosed', {
			producer_id
		})
		this.producers.get(producer_id).close()
		this.producers.delete(producer_id)
		this.producerLabel.delete(type)

		if (type !== mediaType.audio) {
			let elem = document.getElementById(producer_id)
			elem.srcObject.getTracks().forEach(function (track) {
				track.stop()
			})
			elem.parentNode.removeChild(elem)
		}

		switch (type) {
			case mediaType.audio:
				this.event(_EVENTS.stopAudio)
				break
			case mediaType.video:
				this.event(_EVENTS.stopVideo)
				break
			case mediaType.screen:
				this.event(_EVENTS.stopScreen)
				break;
			default:
				return
				break;
		}

	}

	pauseProducer(type) {
		if (!this.producerLabel.has(type)) {
			console.log('there is no producer for this type ' + type)
			return
		}
		let producer_id = this.producerLabel.get(type)
		this.producers.get(producer_id).pause()

	}

	resumeProducer(type) {
		if (!this.producerLabel.has(type)) {
			console.log('there is no producer for this type ' + type)
			return
		}
		let producer_id = this.producerLabel.get(type)
		this.producers.get(producer_id).resume()

	}

	removeConsumer(consumer_id) {
		let elem = document.getElementById(consumer_id)
		elem.srcObject.getTracks().forEach(function (track) {
			track.stop()
		})
		elem.parentNode.removeChild(elem)

		this.consumers.delete(consumer_id)
	}

	exit(offline = false) {

		let clean = function () {
			this._isOpen = false
			this.consumerTransport.close()
			this.producerTransport.close()
			this.socket.off('disconnect')
			this.socket.off('newProducers')
			this.socket.off('consumerClosed')
		}.bind(this)

		if (!offline) {
			this.socket.request('exitRoom').then(e => console.log(e)).catch(e => console.warn(e)).finally(function () {
				clean()
			}.bind(this))
		} else {
			clean()
		}

		this.event(_EVENTS.exitRoom)

	}

	///////  HELPERS //////////

	static get mediaType() {
		return mediaType
	}

	event(evt) {
		if (this.eventListeners.has(evt)) {
			this.eventListeners.get(evt).forEach(callback => callback())
		}
	}

	on(evt, callback) {
		this.eventListeners.get(evt).push(callback)
	}




	//////// GETTERS ////////

	isOpen() {
		return this._isOpen
	}

	static get EVENTS() {
		return _EVENTS
	}
}