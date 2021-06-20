if (location.href.substr(0, 5) !== 'https')
  location.href = 'https' + location.href.substr(4, location.href.length - 4)

const socket = io()
let producer = null;
let rc = null

nameInput.value = 'bob' + Math.round(Math.random() * 1000)

socket.request = function request(type, data = {}) {
	return new Promise((resolve, reject) => {
		socket.emit(type, data, (data) => {
			if (data.error) {
			reject(data.error)
			} else {
			resolve(data)
			}
		})
	})
}


function joinRoom(name, room_id) {
  if (rc && rc.isOpen()) {
	console.log('already connected to a room')
  } else {
	rc = new RoomClient(localMedia, remoteVideos, remoteAudios, window.mediasoupClient, socket, room_id, name, roomOpen)

	addListeners()
  }

}

function roomOpen() {
	login.classList.add('d-none')
	call.classList.remove('d-none')
}

function addListeners() {
	rc.on(RoomClient.EVENTS.startScreen, () => {
		startScreenButton.classList.add('d-none')
		stopScreenButton.classList.remove('d-none')
	})

	rc.on(RoomClient.EVENTS.stopScreen, () => {
		stopScreenButton.classList.add('d-none')
		startScreenButton.classList.remove('d-none')
	})

	rc.on(RoomClient.EVENTS.stopAudio, () => {
		stopAudioButton.classList.add('d-none')
		startAudioButton.classList.remove('d-none')
	})
		rc.on(RoomClient.EVENTS.startAudio, () => {
		startAudioButton.classList.add('d-none')
		stopAudioButton.classList.remove('d-none')
	})

	rc.on(RoomClient.EVENTS.startVideo, () => {
		startVideoButton.classList.add('d-none')
		stopVideoButton.classList.remove('d-none')
	})
		rc.on(RoomClient.EVENTS.stopVideo, () => {
		stopVideoButton.classList.add('d-none')
		startVideoButton.classList.remove('d-none')
	})
	rc.on(RoomClient.EVENTS.exitRoom, () => {
		call.classList.add('d-none')
		login.classList.remove('d-none')
	})
}